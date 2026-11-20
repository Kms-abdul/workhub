"""Work items: the one engine behind every category. Nothing here is category-specific;
the category's own statuses, issue list and custom fields decide what is allowed."""
from datetime import datetime, time, timedelta

from flask import Blueprint, jsonify, request

from .. import db
from ..access import can_use_category, category_limit, department_ids
from ..auth import current_employee, error, login_required
from ..models import (PRIORITIES, ActivityLog, Category, Classification, Employee, Status, TimeEntry,
                      WorkItem)
from ..timekeeping import close_entry, running_entries

bp = Blueprint("work_items", __name__, url_prefix="/api/work-items")

MAX_ROWS = 500


# ---------- helpers ----------

def iso(value):
    return value.isoformat(timespec="seconds") if value else None


def parse_date(text):
    """'2026-11-20' or a full ISO datetime -> datetime, or None if empty. Raises ValueError if malformed."""
    return datetime.fromisoformat(text) if text else None


def log(item, action, old=None, new=None):
    db.session.add(ActivityLog(work_item=item, employee_id=current_employee().id,
                               action=action, old_value=old, new_value=new))


def can_see_all(me):
    return me.role in ("MANAGER", "ADMIN")


def visible_items(me):
    """ADMIN: everything. MANAGER: all work in the departments and categories they have access to.
    EMPLOYEE: only work they logged or are assigned to."""
    query = WorkItem.query
    if me.role == "ADMIN":
        return query
    if me.role == "EMPLOYEE":
        return query.filter(db.or_(WorkItem.assigned_to == me.id, WorkItem.created_by == me.id))
    query = query.filter(WorkItem.department_id.in_(department_ids(me)))
    limit = category_limit(me)
    if limit is not None:
        query = query.filter(WorkItem.category_id.in_(limit))
    return query


def find_item(item_id):
    return visible_items(current_employee()).filter(WorkItem.id == item_id).first()


def work_type_ids(name):
    """Subquery of every classification with this name, in any category. Filtering by "Meeting"
    therefore finds meetings logged under Development, Admin, Quick Solutions, and so on."""
    return (db.session.query(Classification.id)
            .filter(db.func.lower(Classification.name) == " ".join(name.split()).lower()))


def find_or_add_work_type(category, name):
    """The category's work type with this name, created if nobody has used it before.
    This is how each category's list grows: people type what they did, and it is offered next time.
    Capitals and extra spaces are ignored, so 'meeting' and ' Meeting ' are the same type.
    Returns (classification or None, problem)."""
    name = " ".join(name.split()) if isinstance(name, str) else ""
    if not name:
        return None, None
    if len(name) > 150:
        return None, "Keep the work type under 150 characters."
    for existing in category.classifications:
        if existing.name.casefold() == name.casefold():
            existing.is_active = True
            return existing, None
    # Already used in another category: keep that spelling, so "MEETING" and "Meeting" read the same everywhere.
    known = Classification.query.filter(db.func.lower(Classification.name) == name.lower()).first()
    if known:
        name = known.name
    work_type = Classification(category_id=category.id, name=name, display_order=len(category.classifications))
    db.session.add(work_type)
    db.session.flush()
    return work_type, None


def clean_custom_data(category, incoming, existing=None):
    """Keeps only this category's fields and checks them. Returns (data, problem)."""
    data = dict(existing or {})
    for field in category.custom_fields:
        if field.field_key in incoming:
            value = incoming[field.field_key]
            value = value.strip() if isinstance(value, str) else value
            if value in ("", None):
                data.pop(field.field_key, None)
                continue
            if field.field_type == "NUMBER":
                try:
                    value = float(value)
                except (TypeError, ValueError):
                    return None, f"{field.label} must be a number."
            elif field.field_type == "DATE":
                try:
                    value = datetime.fromisoformat(str(value)).date().isoformat()
                except ValueError:
                    return None, f"{field.label} must be a date."
            elif field.field_type == "SELECT" and value not in (field.options or []):
                return None, f"{field.label}: choose one of the listed options."
            else:
                value = str(value) if field.field_type == "TEXT" else value
            data[field.field_key] = value
        if field.is_required and field.field_key not in data:
            return None, f"{field.label} is required."
    return data, None


def item_json(item, detail=False):
    data = {
        "id": item.id,
        "number": item.number,
        "title": item.title,
        "description": item.description,
        "priority": item.priority,
        "category": {"id": item.category.id, "name": item.category.name},
        "classification": ({"id": item.classification.id, "name": item.classification.name}
                           if item.classification else None),
        "status": {"id": item.status.id, "name": item.status.name, "kind": item.status.kind},
        "created_by": {"id": item.creator.id, "name": item.creator.name},
        "assigned_to": {"id": item.assignee.id, "name": item.assignee.name} if item.assignee else None,
        "due_date": iso(item.due_date),
        "completed_at": iso(item.completed_at),
        "total_minutes": item.total_minutes,
        "custom_data": item.custom_data or {},
        "created_at": iso(item.created_at),
        "updated_at": iso(item.updated_at),
    }
    if detail:
        data["activity"] = [
            {"id": a.id, "employee": a.employee.name, "action": a.action,
             "old_value": a.old_value, "new_value": a.new_value, "created_at": iso(a.created_at)}
            for a in item.activity
        ]
        data["time_entries"] = [
            {"id": t.id, "employee": t.employee.name, "started_at": iso(t.started_at), "ended_at": iso(t.ended_at),
             "minutes": t.minutes, "entry_type": t.entry_type, "note": t.note}
            for t in item.time_entries
        ]
    return data


def check_assignee(me, assignee_id, department_id):
    """Returns (employee_id, problem). Employees can only give work to themselves."""
    if assignee_id in (None, ""):
        return None, None
    if not isinstance(assignee_id, int):
        return None, "Assigned employee is not valid."
    if assignee_id != me.id and not can_see_all(me):
        return None, "Only a manager can assign work to someone else."
    emp = db.session.get(Employee, assignee_id)
    if emp is None or not emp.is_active or department_id not in department_ids(emp):
        return None, "Assigned employee is not valid."
    return emp.id, None


# ---------- list ----------

@bp.get("")
@login_required()
def list_items():
    """Filters: mine=1, today=1 (not finished, or created/finished today), category_id, work_type, status_kind,
    assigned_to, from, to (dates on created_at), q (text in number or title)."""
    me = current_employee()
    args = request.args
    query = visible_items(me).join(Status, WorkItem.status_id == Status.id)

    if args.get("mine"):
        query = query.filter(WorkItem.assigned_to == me.id)
    if args.get("today"):
        midnight = datetime.combine(datetime.now().date(), time.min)
        query = query.filter(db.or_(Status.kind != "DONE", WorkItem.completed_at >= midnight,
                                    WorkItem.created_at >= midnight))
    if args.get("day"):
        # Everything logged or finished on one day: the "sheet" for that date.
        try:
            start = datetime.combine(parse_date(args["day"]).date(), time.min)
        except ValueError:
            return error("Dates must look like 2026-11-20.")
        end = start + timedelta(days=1)
        query = query.filter(db.or_(db.and_(WorkItem.created_at >= start, WorkItem.created_at < end),
                                    db.and_(WorkItem.completed_at >= start, WorkItem.completed_at < end)))
    if args.get("category_id", type=int):
        query = query.filter(WorkItem.category_id == args.get("category_id", type=int))
    if args.get("work_type"):
        query = query.filter(WorkItem.classification_id.in_(work_type_ids(args["work_type"])))
    if args.get("status_kind"):
        query = query.filter(Status.kind == args["status_kind"])
    if args.get("assigned_to", type=int):
        query = query.filter(WorkItem.assigned_to == args.get("assigned_to", type=int))
    try:
        if args.get("from"):
            query = query.filter(WorkItem.created_at >= parse_date(args["from"]))
        if args.get("to"):
            query = query.filter(WorkItem.created_at < parse_date(args["to"]) + timedelta(days=1))
    except ValueError:
        return error("Dates must look like 2026-11-20.")
    if args.get("q"):
        like = f"%{args['q'].strip()}%"
        query = query.filter(db.or_(WorkItem.title.ilike(like), WorkItem.number.ilike(like)))

    items = query.order_by(WorkItem.created_at.desc(), WorkItem.id.desc()).limit(MAX_ROWS).all()
    return jsonify([item_json(i) for i in items])


# ---------- create ----------

@bp.post("")
@login_required()
def create_item():
    me = current_employee()
    data = request.get_json(silent=True) or {}

    category_id = data.get("category_id")
    category = (Category.query.filter_by(id=category_id).with_for_update().first()
                if isinstance(category_id, int) else None)
    if category is None or not category.is_active:
        return error("Choose a category.")
    if not can_use_category(me, category):
        return error("You do not have access to this category.", 403)

    title = (data.get("title") or "").strip()
    if not title:
        return error("Describe what you worked on.")
    if len(title) > 255:
        return error("Keep the first line under 255 characters and put the rest in the description.")

    priority = data.get("priority") or "MEDIUM"
    if priority not in PRIORITIES:
        return error("Priority must be LOW, MEDIUM, HIGH or CRITICAL.")

    classification_id = data.get("classification_id") or None
    if classification_id:
        cls = db.session.get(Classification, classification_id) if isinstance(classification_id, int) else None
        if cls is None or cls.category_id != category.id or not cls.is_active:
            return error("That work type does not belong to this category.")
    if "work_type" in data:
        work_type, problem = find_or_add_work_type(category, data["work_type"])
        if problem:
            return error(problem)
        classification_id = work_type.id if work_type else None

    initial = next((s for s in category.statuses if s.is_initial), None) or (category.statuses[0] if category.statuses else None)
    if initial is None:
        return error("This category has no statuses yet. Ask an admin to add one.")

    # The one-line daily log can set these three at once, like a row in a spreadsheet:
    # status (e.g. already Completed), time spent, and the day the work was done.
    status = initial
    if data.get("status_id") is not None:
        status = next((s for s in category.statuses if s.id == data["status_id"]), None)
        if status is None:
            return error("That status does not belong to this category.")

    minutes = data.get("minutes") or 0
    if isinstance(minutes, bool) or not isinstance(minutes, int) or not 0 <= minutes <= 24 * 60:
        return error("Time must be between 1 minute and 24 hours.")

    when = datetime.now()
    if data.get("work_date"):
        try:
            work_day = datetime.fromisoformat(str(data["work_date"])).date()
        except ValueError:
            return error("Date must look like 2026-11-20.")
        if work_day > when.date():
            return error("Work cannot be logged for a future date.")
        when = datetime.combine(work_day, when.time())

    # No assignee given: the work belongs to whoever logged it.
    assignee_id, problem = check_assignee(me, data.get("assigned_to", me.id), category.department_id)
    if problem:
        return error(problem)

    custom_data, problem = clean_custom_data(category, data.get("custom_data") or {})
    if problem:
        return error(problem)

    try:
        due_date = parse_date(data.get("due_date"))
    except (ValueError, TypeError):
        return error("Due date must look like 2026-11-20.")

    number = f"{category.ticket_prefix}-{category.next_number:04d}"
    category.next_number += 1

    item = WorkItem(
        number=number, department_id=category.department_id, category_id=category.id,
        classification_id=classification_id, status_id=status.id, title=title,
        description=(data.get("description") or "").strip() or None, priority=priority,
        created_by=me.id, assigned_to=assignee_id, due_date=due_date, custom_data=custom_data,
        created_at=when, completed_at=when if status.kind == "DONE" else None, total_minutes=minutes,
    )
    db.session.add(item)
    log(item, "CREATED", new=number)
    if minutes:
        db.session.add(TimeEntry(work_item=item, employee_id=me.id, entry_type="MANUAL",
                                 started_at=when, ended_at=when, minutes=minutes))
        log(item, "TIME", new=f"{minutes}m entered manually")
    db.session.commit()
    return jsonify(item_json(item)), 201


# ---------- read one ----------

@bp.get("/<int:item_id>")
@login_required()
def get_item(item_id):
    item = find_item(item_id)
    if item is None:
        return error("Work item not found.", 404)
    return jsonify(item_json(item, detail=True))


# ---------- update ----------

@bp.patch("/<int:item_id>")
@login_required()
def update_item(item_id):
    me = current_employee()
    item = find_item(item_id)
    if item is None:
        return error("Work item not found.", 404)
    data = request.get_json(silent=True) or {}
    problem = apply_changes(me, item, data)
    if problem:
        db.session.rollback()
        return error(problem)
    db.session.commit()
    return jsonify(item_json(item, detail=True))


def apply_changes(me, item, data):
    """Applies the request to the item and writes the activity log. Returns an error message or None."""
    if "status_id" in data and data["status_id"] != item.status_id:
        status = db.session.get(Status, data["status_id"]) if isinstance(data["status_id"], int) else None
        if status is None or status.category_id != item.category_id:
            return "That status does not belong to this category."
        log(item, "STATUS", old=item.status.name, new=status.name)
        item.status = status
        item.completed_at = datetime.now() if status.kind == "DONE" else None
        if status.kind == "DONE":
            # Finishing the work stops any timer still running on it.
            for entry in running_entries(work_item_id=item.id):
                close_entry(entry)
                log(item, "TIME", new=f"{entry.minutes}m by timer")

    if "assigned_to" in data and data["assigned_to"] != item.assigned_to:
        assignee_id, problem = check_assignee(me, data["assigned_to"], item.department_id)
        if problem:
            return problem
        old = item.assignee.name if item.assignee else "Nobody"
        new = db.session.get(Employee, assignee_id).name if assignee_id else "Nobody"
        log(item, "ASSIGNED", old=old, new=new)
        item.assigned_to = assignee_id

    if "priority" in data and data["priority"] != item.priority:
        if data["priority"] not in PRIORITIES:
            return "Priority must be LOW, MEDIUM, HIGH or CRITICAL."
        log(item, "PRIORITY", old=item.priority, new=data["priority"])
        item.priority = data["priority"]

    edited = []
    if "title" in data:
        title = (data["title"] or "").strip()
        if not title or len(title) > 255:
            return "The first line is required and must be under 255 characters."
        if title != item.title:
            item.title = title
            edited.append("title")
    if "description" in data:
        description = (data["description"] or "").strip() or None
        if description != item.description:
            item.description = description
            edited.append("description")
    if "classification_id" in data and data["classification_id"] != item.classification_id:
        cls_id = data["classification_id"] or None
        if cls_id:
            cls = db.session.get(Classification, cls_id) if isinstance(cls_id, int) else None
            if cls is None or cls.category_id != item.category_id:
                return "That work type does not belong to this category."
        item.classification_id = cls_id
        edited.append("work type")
    if "work_type" in data:
        work_type, problem = find_or_add_work_type(item.category, data["work_type"])
        if problem:
            return problem
        new_id = work_type.id if work_type else None
        if new_id != item.classification_id:
            item.classification_id = new_id
            edited.append("work type")
    if "due_date" in data:
        try:
            due_date = parse_date(data["due_date"])
        except (ValueError, TypeError):
            return "Due date must look like 2026-11-20."
        if due_date != item.due_date:
            item.due_date = due_date
            edited.append("due date")
    if "custom_data" in data:
        custom_data, problem = clean_custom_data(item.category, data["custom_data"] or {}, item.custom_data)
        if problem:
            return problem
        if custom_data != (item.custom_data or {}):
            item.custom_data = custom_data
            edited.append("details")
    if edited:
        log(item, "EDITED", new=", ".join(edited))
    return None
