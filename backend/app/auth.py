import re
from functools import wraps

from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt_identity, verify_jwt_in_request
from werkzeug.security import check_password_hash, generate_password_hash

from . import db
from .access import access_json
from .models import Employee

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def error(message, code=400):
    return jsonify(error=message), code


def current_employee():
    """The logged-in employee. Call only inside a @login_required route."""
    return db.session.get(Employee, int(get_jwt_identity()))


def login_required(*roles):
    """@login_required() lets any logged-in employee in.
    @login_required("ADMIN") or ("MANAGER", "ADMIN") limits the route to those roles."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            emp = current_employee()
            if emp is None or not emp.is_active:
                return error("Your account is not active.", 401)
            if roles and emp.role not in roles:
                return error("You do not have permission to do this.", 403)
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def employee_json(emp):
    return {
        "id": emp.id,
        "employee_code": emp.employee_code,
        "name": emp.name,
        "email": emp.email,
        "phone": emp.phone,
        "designation": emp.designation,
        "department_id": emp.department_id,
        "department_name": emp.department.name,
        "manager_id": emp.manager_id,
        "role": emp.role,
        "is_active": emp.is_active,
        **access_json(emp),
    }


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    emp = Employee.query.filter(db.func.lower(Employee.email) == email).first()
    if emp is None or not emp.is_active or not check_password_hash(emp.password_hash, password):
        return error("Wrong email or password.", 401)
    return jsonify(token=create_access_token(identity=str(emp.id)), employee=employee_json(emp))


@bp.get("/me")
@login_required()
def me():
    return jsonify(employee_json(current_employee()))


# ---------- my profile: every employee can keep their own details and password up to date ----------

# Everything about themselves a person can fill in: field -> (label, longest allowed).
PROFILE_FIELDS = {
    "name": ("Name", 150),
    "email": ("Email", 150),
    "employee_code": ("Employee ID", 50),
    "phone": ("Phone", 20),
    "designation": ("Designation", 100),
}
MIN_PASSWORD = 8


def profile_problem(me, data):
    """Applies the request to the employee. Returns an error message or None."""
    for field, (label, longest) in PROFILE_FIELDS.items():
        if field in data:
            value = (data[field] or "").strip() if isinstance(data[field], str) else ""
            if len(value) > longest:
                return f"{label} must be {longest} characters or fewer."
            setattr(me, field, value or None)
    if not me.name:
        return "Name is required."
    if not me.email or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", me.email):
        return "Enter a valid email address. It is what you sign in with."
    me.email = me.email.lower()

    if "manager_id" in data:
        manager_id = data["manager_id"] or None
        if manager_id is not None:
            manager = db.session.get(Employee, manager_id) if isinstance(manager_id, int) else None
            if manager is None or not manager.is_active or manager.id == me.id:
                return "Choose a valid reporting manager."
        me.manager_id = manager_id

    with db.session.no_autoflush:
        others = Employee.query.filter(Employee.id != me.id)
        if others.filter(db.func.lower(Employee.email) == me.email).first():
            return "Another employee already uses this email."
        if me.employee_code and others.filter(Employee.employee_code == me.employee_code).first():
            return "Another employee already has this Employee ID."
    return None


@bp.patch("/me")
@login_required()
def update_me():
    """Change your own details: name, email, Employee ID, phone, designation, reporting manager.
    Role, departments and categories are not here on purpose: they decide what a person can see,
    so anyone able to edit their own could make themselves an admin. Those stay on the Team page."""
    me = current_employee()
    problem = profile_problem(me, request.get_json(silent=True) or {})
    if problem:
        db.session.rollback()
        return error(problem)
    db.session.commit()
    return jsonify(employee_json(me))


@bp.post("/me/password")
@login_required()
def change_my_password():
    """Body: {"current_password": "...", "new_password": "..."}. The current password is asked
    again so that nobody else can change it from a computer left signed in."""
    me = current_employee()
    data = request.get_json(silent=True) or {}
    current, new = data.get("current_password") or "", data.get("new_password") or ""
    if not isinstance(current, str) or not check_password_hash(me.password_hash, current):
        return error("Your current password is not correct.")
    if not isinstance(new, str) or len(new) < MIN_PASSWORD:
        return error(f"The new password must be at least {MIN_PASSWORD} characters.")
    if new == current:
        return error("The new password must be different from the current one.")
    me.password_hash = generate_password_hash(new)
    db.session.commit()
    return jsonify(ok=True)
