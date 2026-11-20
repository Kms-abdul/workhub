"""Dashboard and reports. Everything is counted by status *kind* (OPEN / ACTIVE / DONE),
so it works for any category and any workflow an admin configures."""
from datetime import datetime, time, timedelta

from flask import Blueprint, jsonify, request

from .. import db
from ..access import access_json, can_use_category
from ..auth import current_employee, error, login_required
from ..models import ActivityLog, Category, Employee, Status, TimeEntry, WorkItem
from .work_items import iso, visible_items, work_type_ids

bp = Blueprint("reports", __name__, url_prefix="/api")


# ---------- reports for a period ----------
# Three numbers are used everywhere, each tied to a date:
#   created  = work logged in the period            (work_items.created_at)
#   finished = work finished in the period          (work_items.completed_at)
#   minutes  = time logged in the period            (time_entries.started_at)

def read_period(args):
    """from/to (or a single date) as 'YYYY-MM-DD'; both default to today. Returns (start, end_exclusive)."""
    today = datetime.now().date().isoformat()
    first = args.get("date") or args.get("from") or today
    last = args.get("date") or args.get("to") or first
    start = datetime.combine(datetime.fromisoformat(first).date(), time.min)
    end = datetime.combine(datetime.fromisoformat(last).date(), time.min) + timedelta(days=1)
    if end <= start:
        raise ValueError("'to' is before 'from'")
    return start, end


def period_data(me, start, end, employee_id=None, work_type=None):
    """Work created, work finished and time logged in the period, limited to what `me` may see.
    work_type (a name such as "Meeting") narrows everything to that kind of work, in any category."""
    if me.role == "EMPLOYEE":
        employee_id = me.id
    base = visible_items(me)
    if work_type and work_type.strip():
        base = base.filter(WorkItem.classification_id.in_(work_type_ids(work_type)))
    created = base.filter(WorkItem.created_at >= start, WorkItem.created_at < end)
    finished = base.filter(WorkItem.completed_at >= start, WorkItem.completed_at < end)
    entries = (TimeEntry.query.join(WorkItem, TimeEntry.work_item_id == WorkItem.id)
               .filter(TimeEntry.work_item_id.in_(base.with_entities(WorkItem.id)),
                       TimeEntry.started_at >= start, TimeEntry.started_at < end,
                       TimeEntry.ended_at.isnot(None)))
    if employee_id:
        created = created.filter(WorkItem.created_by == employee_id)
        finished = finished.filter(WorkItem.assigned_to == employee_id)
        entries = entries.filter(TimeEntry.employee_id == employee_id)
    return created.all(), finished.all(), entries.all()


def summarise(created, finished, entries):
    """Totals plus one row per category, per employee and per work type."""
    blank = lambda: {"created": 0, "finished": 0, "minutes": 0}
    totals, by_category, by_employee, by_work_type = blank(), {}, {}, {}
    row = lambda table, key, name: table.setdefault(key, {"id": key, "name": name, **blank()})

    def type_row(item):
        # Work types are matched by name, so "Meeting" is one row whichever category it was logged under.
        name = item.classification.name if item.classification else None
        return row(by_work_type, name.casefold() if name else "", name or "No work type")

    for item in created:
        totals["created"] += 1
        row(by_category, item.category_id, item.category.name)["created"] += 1
        row(by_employee, item.created_by, item.creator.name)["created"] += 1
        type_row(item)["created"] += 1
    for item in finished:
        totals["finished"] += 1
        row(by_category, item.category_id, item.category.name)["finished"] += 1
        type_row(item)["finished"] += 1
        if item.assignee:
            row(by_employee, item.assigned_to, item.assignee.name)["finished"] += 1
    for entry in entries:
        totals["minutes"] += entry.minutes
        row(by_category, entry.work_item.category_id, entry.work_item.category.name)["minutes"] += entry.minutes
        row(by_employee, entry.employee_id, entry.employee.name)["minutes"] += entry.minutes
        type_row(entry.work_item)["minutes"] += entry.minutes

    by_name = lambda r: r["name"].lower()
    return {"totals": totals, "by_category": sorted(by_category.values(), key=by_name),
            "by_employee": sorted(by_employee.values(), key=by_name),
            "by_work_type": sorted(by_work_type.values(), key=lambda r: (r["id"] == "", -r["minutes"], r["name"].lower()))}


def bad_dates():
    return error("Dates must look like 2026-11-20, and 'to' cannot be before 'from'.")


@bp.get("/reports/daily")
@login_required()
def daily_report():
    """?date=2026-11-20&employee_id=3  One day: the summary plus every work item touched that day."""
    me = current_employee()
    try:
        start, end = read_period({"date": request.args.get("date")})
    except ValueError:
        return bad_dates()
    created, finished, entries = period_data(me, start, end, request.args.get("employee_id", type=int),
                                             request.args.get("work_type"))

    minutes_by_item = {}
    for entry in entries:
        minutes_by_item[entry.work_item_id] = minutes_by_item.get(entry.work_item_id, 0) + entry.minutes
    touched = {i.id: i for i in created + finished + [e.work_item for e in entries]}
    created_ids, finished_ids = {i.id for i in created}, {i.id for i in finished}
    items = [{
        "id": i.id, "number": i.number, "title": i.title, "category": i.category.name,
        "work_type": i.classification.name if i.classification else None,
        "assigned_to": i.assignee.name if i.assignee else None,
        "status": {"name": i.status.name, "kind": i.status.kind},
        "created_today": i.id in created_ids, "finished_today": i.id in finished_ids,
        "minutes": minutes_by_item.get(i.id, 0),
    } for i in sorted(touched.values(), key=lambda i: i.number)]

    report = summarise(created, finished, entries)
    return jsonify(date=start.date().isoformat(), items=items,
                   employees_active=len(report["by_employee"]), **report)


@bp.get("/reports/summary")
@login_required()
def summary_report():
    """?from=&to=&work_type=  Employee, category and work type report for a period."""
    try:
        start, end = read_period(request.args)
    except ValueError:
        return bad_dates()
    report = summarise(*period_data(current_employee(), start, end, work_type=request.args.get("work_type")))
    return jsonify(**{"from": start.date().isoformat(), "to": (end - timedelta(days=1)).date().isoformat()}, **report)


@bp.get("/reports/category")
@login_required()
def category_report():
    """?category_id=&from=&to=&q=  One category in depth, for work logged in the period.
    This is the support report: pick Quick Solutions to see calls by status, person and branch."""
    me = current_employee()
    try:
        start, end = read_period(request.args)
    except ValueError:
        return bad_dates()
    category = db.session.get(Category, request.args.get("category_id", type=int) or 0)
    if category is None or not can_use_category(me, category):
        return error("Choose a category.")

    items = (visible_items(me).filter(WorkItem.category_id == category.id,
                                      WorkItem.created_at >= start, WorkItem.created_at < end)
             .order_by(WorkItem.created_at.desc()).all())
    q = (request.args.get("q") or "").strip().casefold()
    if q:
        text = lambda i: " ".join([i.number, i.title, i.description or "",
                                   *[str(v) for v in (i.custom_data or {}).values()]]).casefold()
        items = [i for i in items if q in text(i)]

    done = [i for i in items if i.status.kind == "DONE"]
    to_finish = [(i.completed_at - i.created_at).total_seconds() / 60 for i in done if i.completed_at and i.completed_at >= i.created_at]
    totals = {
        "created": len(items), "finished": len(done), "open": len(items) - len(done),
        "finished_percent": round(100 * len(done) / len(items), 1) if items else None,
        "average_minutes_to_finish": round(sum(to_finish) / len(to_finish)) if to_finish else None,
        "minutes": sum(i.total_minutes for i in items),
    }

    by_status = [{"name": s.name, "kind": s.kind, "count": sum(1 for i in items if i.status_id == s.id)}
                 for s in category.statuses]
    by_employee = {}
    for i in items:
        row = by_employee.setdefault(i.assigned_to, {"name": i.assignee.name if i.assignee else "Unassigned",
                                                     "count": 0, "finished": 0})
        row["count"] += 1
        row["finished"] += i.status.kind == "DONE"

    # Most common values of each extra field (e.g. which branch calls most). Typed values are grouped
    # ignoring capitals and spaces. A field where nothing repeats is free text and is left out.
    by_field = []
    for field in category.custom_fields:
        counts = {}
        for i in items:
            value = str((i.custom_data or {}).get(field.field_key) or "").strip()
            if value:
                entry = counts.setdefault(" ".join(value.casefold().split()), {"value": value, "count": 0})
                entry["count"] += 1
        top = sorted(counts.values(), key=lambda r: (-r["count"], r["value"].lower()))[:8]
        if top and top[0]["count"] > 1:
            by_field.append({"label": field.label, "values": top, "distinct": len(counts)})

    return jsonify(
        category={"id": category.id, "name": category.name},
        **{"from": start.date().isoformat(), "to": (end - timedelta(days=1)).date().isoformat()},
        totals=totals, by_status=by_status,
        by_employee=sorted(by_employee.values(), key=lambda r: -r["count"]),
        by_field=by_field,
        fields=[{"key": f.field_key, "label": f.label} for f in category.custom_fields],
        items=[{"id": i.id, "number": i.number, "title": i.title, "created_at": iso(i.created_at),
                "assigned_to": i.assignee.name if i.assignee else None,
                "status": {"name": i.status.name, "kind": i.status.kind},
                "minutes": i.total_minutes, "custom_data": i.custom_data or {}} for i in items[:200]],
    )


# ---------- dashboard ----------

def empty_counts():
    return {"total": 0, "open": 0, "active": 0, "done": 0, "minutes": 0}


def add_row(table, key, name):
    return table.setdefault(key, {"id": key, "name": name, **empty_counts()})


@bp.get("/dashboard")
@login_required()
def dashboard():
    """Today's picture: everything still unfinished, plus whatever was finished today.
    Scope follows the role: an employee sees their own work, a manager the department, an admin everything."""
    me = current_employee()
    now = datetime.now()
    midnight = datetime.combine(now.date(), time.min)
    visible_ids = visible_items(me).with_entities(WorkItem.id)

    items = (visible_items(me).join(Status, WorkItem.status_id == Status.id)
             .filter(db.or_(Status.kind != "DONE", WorkItem.completed_at >= midnight)).all())

    totals = empty_counts()
    by_category, by_employee = {}, {}
    overdue = 0
    for item in items:
        kind = item.status.kind.lower()
        rows = [totals, add_row(by_category, item.category_id, item.category.name)]
        if item.assignee:
            rows.append(add_row(by_employee, item.assigned_to, item.assignee.name))
        for row in rows:
            row["total"] += 1
            row[kind] += 1
        if kind != "done" and item.due_date and item.due_date < now:
            overdue += 1

    # Time logged today, credited to the category of the work and to whoever logged it.
    entries = (db.session.query(TimeEntry.minutes, TimeEntry.employee_id, Employee.name,
                                Category.id, Category.name)
               .join(WorkItem, TimeEntry.work_item_id == WorkItem.id)
               .join(Employee, TimeEntry.employee_id == Employee.id)
               .join(Category, WorkItem.category_id == Category.id)
               .filter(TimeEntry.work_item_id.in_(visible_ids), TimeEntry.started_at >= midnight,
                       TimeEntry.ended_at.isnot(None)).all())
    for minutes, employee_id, employee_name, category_id, category_name in entries:
        totals["minutes"] += minutes
        add_row(by_employee, employee_id, employee_name)["minutes"] += minutes
        add_row(by_category, category_id, category_name)["minutes"] += minutes

    recent = (ActivityLog.query.filter(ActivityLog.work_item_id.in_(visible_ids))
              .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc()).limit(12).all())

    return jsonify(
        date=now.date().isoformat(),
        scope={"EMPLOYEE": "Your work", "MANAGER": ", ".join(access_json(me)["department_names"]),
               "ADMIN": "All departments"}[me.role],
        totals={**totals, "overdue": overdue},
        by_category=sorted(by_category.values(), key=lambda r: -r["total"]),
        by_employee=sorted(by_employee.values(), key=lambda r: r["name"].lower()),
        recent=[{"id": a.id, "work_item_id": a.work_item_id, "number": a.work_item.number,
                 "employee": a.employee.name, "action": a.action, "old_value": a.old_value,
                 "new_value": a.new_value, "created_at": iso(a.created_at)} for a in recent],
    )
