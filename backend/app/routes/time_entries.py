"""Time tracking: start/stop timer and manual entries. One running timer per employee."""
from datetime import datetime

from flask import Blueprint, jsonify, request

from .. import db
from ..auth import current_employee, error, login_required
from ..models import TimeEntry
from ..timekeeping import close_entry, recalc_total, running_entries
from .work_items import find_item, item_json, log, parse_date

bp = Blueprint("time_entries", __name__, url_prefix="/api")

MAX_MANUAL_MINUTES = 24 * 60


def timer_json(entry):
    """elapsed_seconds is computed here so the browser never has to trust its own clock or timezone."""
    if entry is None:
        return None
    return {
        "id": entry.id,
        "work_item_id": entry.work_item_id,
        "number": entry.work_item.number,
        "title": entry.work_item.title,
        "elapsed_seconds": int((datetime.now() - entry.started_at).total_seconds()),
    }


def my_running_timer():
    entries = running_entries(employee_id=current_employee().id)
    return entries[0] if entries else None


@bp.get("/timer")
@login_required()
def get_timer():
    """The logged-in employee's running timer, or null."""
    return jsonify(timer_json(my_running_timer()))


@bp.post("/work-items/<int:item_id>/timer/start")
@login_required()
def start_timer(item_id):
    me = current_employee()
    item = find_item(item_id)
    if item is None:
        return error("Work item not found.", 404)
    if item.status.kind == "DONE":
        return error("This work is finished. Reopen it before tracking more time.")

    # Only one timer at a time: starting here pauses whatever was running.
    for entry in running_entries(employee_id=me.id):
        if entry.work_item_id == item.id:
            return jsonify(timer_json(entry))
        close_entry(entry)
        log(entry.work_item, "TIME", new=f"{entry.minutes}m by timer")

    # Starting work on something that was only waiting moves it into progress.
    if item.status.kind == "OPEN":
        active = next((s for s in item.category.statuses if s.kind == "ACTIVE"), None)
        if active:
            log(item, "STATUS", old=item.status.name, new=active.name)
            item.status = active

    entry = TimeEntry(work_item=item, employee_id=me.id, entry_type="TIMER", started_at=datetime.now())
    db.session.add(entry)
    db.session.commit()
    return jsonify(timer_json(entry)), 201


@bp.post("/work-items/<int:item_id>/timer/stop")
@login_required()
def stop_timer(item_id):
    item = find_item(item_id)
    if item is None:
        return error("Work item not found.", 404)
    entries = running_entries(employee_id=current_employee().id, work_item_id=item.id)
    if not entries:
        return error("No timer is running on this work.")
    for entry in entries:
        close_entry(entry)
        log(item, "TIME", new=f"{entry.minutes}m by timer")
    db.session.commit()
    return jsonify(item_json(item))


@bp.post("/work-items/<int:item_id>/time")
@login_required()
def add_manual_time(item_id):
    """Body: {"minutes": 90, "note": "...", "date": "2026-11-20"}. Date is optional (default now)."""
    item = find_item(item_id)
    if item is None:
        return error("Work item not found.", 404)
    data = request.get_json(silent=True) or {}
    minutes = data.get("minutes")
    if isinstance(minutes, bool) or not isinstance(minutes, int) or not 1 <= minutes <= MAX_MANUAL_MINUTES:
        return error("Time must be between 1 minute and 24 hours.")
    try:
        when = parse_date(data.get("date")) or datetime.now()
    except (ValueError, TypeError):
        return error("Date must look like 2026-11-20.")
    if when > datetime.now():
        return error("Time cannot be logged for a future date.")

    # started_at == ended_at marks a manual entry: it never counts as a running timer.
    db.session.add(TimeEntry(work_item=item, employee_id=current_employee().id, entry_type="MANUAL",
                             started_at=when, ended_at=when, minutes=minutes,
                             note=(data.get("note") or "").strip() or None))
    log(item, "TIME", new=f"{minutes}m entered manually")
    recalc_total(item)
    db.session.commit()
    return jsonify(item_json(item)), 201


@bp.delete("/time-entries/<int:entry_id>")
@login_required()
def delete_time_entry(entry_id):
    """Fix a mistake. Employees can remove their own entries; managers any entry they can see."""
    me = current_employee()
    entry = db.session.get(TimeEntry, entry_id)
    item = find_item(entry.work_item_id) if entry else None
    if item is None:
        return error("Time entry not found.", 404)
    if entry.employee_id != me.id and me.role == "EMPLOYEE":
        return error("You can only remove your own time.", 403)
    log(item, "TIME", old=f"{entry.minutes}m", new="removed")
    db.session.delete(entry)
    recalc_total(item)
    db.session.commit()
    return jsonify(item_json(item))
