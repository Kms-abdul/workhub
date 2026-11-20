from functools import wraps

from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt_identity, verify_jwt_in_request
from werkzeug.security import check_password_hash

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
