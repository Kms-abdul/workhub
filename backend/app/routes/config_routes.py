"""Everything an admin can configure: departments, categories and, per category,
its issue list (classifications), workflow (statuses) and extra form fields (custom fields).
Reading is open to every logged-in employee; changing is ADMIN only."""
import re

from flask import Blueprint, jsonify, request

from .. import db
from ..access import allowed_departments, can_use_category
from ..auth import current_employee, error, login_required
from ..models import (FIELD_TYPES, STATUS_KINDS, Category, Classification, CustomField, Department,
                      Status, WorkItem)

bp = Blueprint("config", __name__, url_prefix="/api")

KIND_COLORS = {"OPEN": "gray", "ACTIVE": "blue", "DONE": "green"}
DEFAULT_STATUSES = [("Open", "OPEN"), ("In Progress", "ACTIVE"), ("Completed", "DONE")]


# ---------- helpers ----------

def body():
    return request.get_json(silent=True) or {}


def clean(value):
    return (value or "").strip() if isinstance(value, str) else ""


def slug(text, sep="_"):
    return re.sub(r"[^a-z0-9]+", sep, text.lower()).strip(sep)


def next_order(model, **where):
    highest = db.session.query(db.func.max(model.display_order)).filter_by(**where).scalar()
    return 0 if highest is None else highest + 1


def get_or_404(model, item_id):
    return db.session.get(model, item_id) if isinstance(item_id, int) else None


# ---------- JSON ----------

def classification_json(c):
    return {"id": c.id, "category_id": c.category_id, "parent_id": c.parent_id, "name": c.name,
            "display_order": c.display_order, "is_active": c.is_active}


def status_json(s):
    return {"id": s.id, "category_id": s.category_id, "name": s.name, "kind": s.kind, "color": s.color,
            "display_order": s.display_order, "is_initial": s.is_initial}


def field_json(f):
    return {"id": f.id, "category_id": f.category_id, "field_key": f.field_key, "label": f.label,
            "field_type": f.field_type, "options": f.options or [], "is_required": f.is_required,
            "display_order": f.display_order}


def category_json(c):
    return {"id": c.id, "department_id": c.department_id, "code": c.code, "name": c.name,
            "ticket_prefix": c.ticket_prefix, "display_order": c.display_order, "is_active": c.is_active,
            "classifications": [classification_json(x) for x in c.classifications],
            "statuses": [status_json(x) for x in c.statuses],
            "custom_fields": [field_json(x) for x in c.custom_fields]}


def department_json(d):
    return {"id": d.id, "code": d.code, "name": d.name, "is_active": d.is_active,
            "categories": [category_json(c) for c in d.categories]}


# ---------- read ----------

@bp.get("/config")
@login_required()
def get_config():
    """The whole configuration tree in one call, limited to the departments and categories
    this employee has access to. ADMIN gets everything."""
    me = current_employee()
    result = []
    for dept in allowed_departments(me):
        data = department_json(dept)
        allowed = {c.id for c in dept.categories if can_use_category(me, c)}
        data["categories"] = [c for c in data["categories"] if c["id"] in allowed]
        result.append(data)
    return jsonify(result)


@bp.get("/work-types")
@login_required()
def work_type_names():
    """One shared list of work type names, used for suggestions and filters everywhere.
    A type typed once by anyone (say "Meeting") is offered to everyone, in every category."""
    names = {}
    for (name,) in db.session.query(Classification.name).filter(Classification.is_active.is_(True)):
        names.setdefault(name.casefold(), name)
    return jsonify(sorted(names.values(), key=str.casefold))


# ---------- departments ----------

@bp.post("/departments")
@login_required("ADMIN")
def create_department():
    data = body()
    name, code = clean(data.get("name")), clean(data.get("code")).upper()
    if not name or not code:
        return error("Department name and code are required.")
    if Department.query.filter_by(code=code).first():
        return error("Another department already uses this code.")
    dept = Department(name=name, code=code)
    db.session.add(dept)
    db.session.commit()
    return jsonify(department_json(dept)), 201


@bp.patch("/departments/<int:item_id>")
@login_required("ADMIN")
def update_department(item_id):
    dept = get_or_404(Department, item_id)
    if dept is None:
        return error("Department not found.", 404)
    data = body()
    if "name" in data:
        if not clean(data["name"]):
            return error("Department name is required.")
        dept.name = clean(data["name"])
    if "is_active" in data:
        if not data["is_active"] and dept.id == current_employee().department_id:
            return error("You cannot deactivate your own department.")
        dept.is_active = bool(data["is_active"])
    db.session.commit()
    return jsonify(department_json(dept))


# ---------- categories ----------

def prefix_problem(prefix, category_id=None):
    if not re.fullmatch(r"[A-Z0-9]{2,10}", prefix):
        return "Number prefix must be 2 to 10 letters or digits, for example DEV or QS."
    clash = Category.query.filter(Category.ticket_prefix == prefix, Category.id != category_id).first()
    return "Another category already uses this number prefix." if clash else None


@bp.post("/categories")
@login_required("ADMIN")
def create_category():
    data = body()
    dept = get_or_404(Department, data.get("department_id"))
    name, prefix = clean(data.get("name")), clean(data.get("ticket_prefix")).upper()
    if dept is None:
        return error("Department not found.")
    if not name:
        return error("Category name is required.")
    problem = prefix_problem(prefix)
    if problem:
        return error(problem)
    code = slug(name).upper()
    if Category.query.filter_by(department_id=dept.id, code=code).first():
        return error("This department already has a category with this name.")

    cat = Category(department_id=dept.id, code=code, name=name, ticket_prefix=prefix,
                   display_order=next_order(Category, department_id=dept.id))
    # A new category starts with a basic workflow so it is usable at once; the admin can change it.
    for i, (status_name, kind) in enumerate(DEFAULT_STATUSES):
        cat.statuses.append(Status(name=status_name, kind=kind, color=KIND_COLORS[kind],
                                   display_order=i, is_initial=(i == 0)))
    db.session.add(cat)
    db.session.commit()
    return jsonify(category_json(cat)), 201


@bp.patch("/categories/<int:item_id>")
@login_required("ADMIN")
def update_category(item_id):
    cat = get_or_404(Category, item_id)
    if cat is None:
        return error("Category not found.", 404)
    data = body()
    if "name" in data:
        if not clean(data["name"]):
            return error("Category name is required.")
        cat.name = clean(data["name"])
    if "ticket_prefix" in data:
        prefix = clean(data["ticket_prefix"]).upper()
        problem = prefix_problem(prefix, cat.id)
        if problem:
            return error(problem)
        cat.ticket_prefix = prefix
    if "is_active" in data:
        cat.is_active = bool(data["is_active"])
    db.session.commit()
    return jsonify(category_json(cat))


# ---------- classifications (a category's own issue list) ----------

@bp.post("/classifications")
@login_required("ADMIN")
def create_classification():
    data = body()
    cat = get_or_404(Category, data.get("category_id"))
    name = clean(data.get("name"))
    if cat is None:
        return error("Category not found.")
    if not name:
        return error("Name is required.")
    parent_id = data.get("parent_id") or None
    if parent_id:
        parent = get_or_404(Classification, parent_id)
        if parent is None or parent.category_id != cat.id:
            return error("The parent must belong to the same category.")
    item = Classification(category_id=cat.id, parent_id=parent_id, name=name,
                          display_order=next_order(Classification, category_id=cat.id))
    db.session.add(item)
    db.session.commit()
    return jsonify(classification_json(item)), 201


@bp.patch("/classifications/<int:item_id>")
@login_required("ADMIN")
def update_classification(item_id):
    item = get_or_404(Classification, item_id)
    if item is None:
        return error("Item not found.", 404)
    data = body()
    if "name" in data:
        if not clean(data["name"]):
            return error("Name is required.")
        item.name = clean(data["name"])
    if "is_active" in data:
        item.is_active = bool(data["is_active"])
    db.session.commit()
    return jsonify(classification_json(item))


@bp.delete("/classifications/<int:item_id>")
@login_required("ADMIN")
def delete_classification(item_id):
    item = get_or_404(Classification, item_id)
    if item is None:
        return error("Item not found.", 404)
    if Classification.query.filter_by(parent_id=item.id).first():
        return error("Remove its sub-items first.")
    if WorkItem.query.filter_by(classification_id=item.id).first():
        return error("Work has been logged under this item. Untick Active to hide it instead.")
    db.session.delete(item)
    db.session.commit()
    return "", 204


# ---------- statuses (a category's workflow) ----------

def make_initial(status):
    Status.query.filter_by(category_id=status.category_id).update({"is_initial": False})
    status.is_initial = True


@bp.post("/statuses")
@login_required("ADMIN")
def create_status():
    data = body()
    cat = get_or_404(Category, data.get("category_id"))
    name, kind = clean(data.get("name")), data.get("kind")
    if cat is None:
        return error("Category not found.")
    if not name:
        return error("Status name is required.")
    if kind not in STATUS_KINDS:
        return error("Kind must be OPEN, ACTIVE or DONE.")
    status = Status(category_id=cat.id, name=name, kind=kind, color=KIND_COLORS[kind],
                    display_order=next_order(Status, category_id=cat.id))
    db.session.add(status)
    db.session.commit()
    return jsonify(status_json(status)), 201


@bp.patch("/statuses/<int:item_id>")
@login_required("ADMIN")
def update_status(item_id):
    status = get_or_404(Status, item_id)
    if status is None:
        return error("Status not found.", 404)
    data = body()
    if "name" in data:
        if not clean(data["name"]):
            return error("Status name is required.")
        status.name = clean(data["name"])
    if "kind" in data:
        if data["kind"] not in STATUS_KINDS:
            return error("Kind must be OPEN, ACTIVE or DONE.")
        status.kind = data["kind"]
        status.color = KIND_COLORS[status.kind]
    if data.get("is_initial"):
        make_initial(status)
    db.session.commit()
    return jsonify(status_json(status))


@bp.delete("/statuses/<int:item_id>")
@login_required("ADMIN")
def delete_status(item_id):
    status = get_or_404(Status, item_id)
    if status is None:
        return error("Status not found.", 404)
    if status.is_initial:
        return error("This is the starting status. Choose another starting status first.")
    if WorkItem.query.filter_by(status_id=status.id).first():
        return error("Some work is in this status. Move that work to another status first.")
    db.session.delete(status)
    db.session.commit()
    return "", 204


# ---------- custom fields (a category's extra form fields) ----------

def field_problem(field, data):
    if "label" in data:
        if not clean(data["label"]):
            return "Field label is required."
        field.label = clean(data["label"])
    if "field_type" in data:
        if data["field_type"] not in FIELD_TYPES:
            return "Field type must be TEXT, NUMBER, DATE or SELECT."
        field.field_type = data["field_type"]
    if "options" in data:
        options = data["options"] or []
        if not isinstance(options, list):
            return "Options must be a list."
        field.options = [clean(o) for o in options if isinstance(o, str) and clean(o)]
    if "is_required" in data:
        field.is_required = bool(data["is_required"])
    if field.field_type == "SELECT" and not field.options:
        return "A SELECT field needs at least one option."
    return None


@bp.post("/custom-fields")
@login_required("ADMIN")
def create_custom_field():
    data = body()
    cat = get_or_404(Category, data.get("category_id"))
    if cat is None:
        return error("Category not found.")
    key = slug(clean(data.get("label")))
    if not key:
        return error("Field label is required.")
    if CustomField.query.filter_by(category_id=cat.id, field_key=key).first():
        return error("This category already has a field with this label.")
    field = CustomField(category_id=cat.id, field_key=key, field_type="TEXT",
                        display_order=next_order(CustomField, category_id=cat.id))
    problem = field_problem(field, data)
    if problem:
        return error(problem)
    db.session.add(field)
    db.session.commit()
    return jsonify(field_json(field)), 201


@bp.patch("/custom-fields/<int:item_id>")
@login_required("ADMIN")
def update_custom_field(item_id):
    field = get_or_404(CustomField, item_id)
    if field is None:
        return error("Field not found.", 404)
    problem = field_problem(field, body())
    if problem:
        db.session.rollback()
        return error(problem)
    db.session.commit()
    return jsonify(field_json(field))


@bp.delete("/custom-fields/<int:item_id>")
@login_required("ADMIN")
def delete_custom_field(item_id):
    """Values already saved on work items stay in the database; the field just stops showing."""
    field = get_or_404(CustomField, item_id)
    if field is None:
        return error("Field not found.", 404)
    db.session.delete(field)
    db.session.commit()
    return "", 204


# ---------- ordering ----------

ORDERABLE = {"categories": (Category, "department_id"), "classifications": (Classification, "category_id"),
             "statuses": (Status, "category_id"), "custom-fields": (CustomField, "category_id")}


@bp.put("/order/<kind>")
@login_required("ADMIN")
def set_order(kind):
    """Body: {"ids": [3, 1, 2]}. Saves that order. All ids must share one parent."""
    if kind not in ORDERABLE:
        return error("Unknown list.", 404)
    model, parent_column = ORDERABLE[kind]
    ids = body().get("ids")
    if not isinstance(ids, list) or not ids:
        return error("ids must be a list.")
    items = model.query.filter(model.id.in_(ids)).all()
    if len(items) != len(set(ids)) or len({getattr(i, parent_column) for i in items}) != 1:
        return error("These items do not belong together.")
    position = {item_id: i for i, item_id in enumerate(ids)}
    for item in items:
        item.display_order = position[item.id]
    db.session.commit()
    return "", 204
