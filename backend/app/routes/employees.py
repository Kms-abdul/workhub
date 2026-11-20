from flask import Blueprint, jsonify, request
from werkzeug.security import generate_password_hash

from .. import db
from ..auth import current_employee, employee_json, error, login_required
from ..access import department_ids, set_access
from ..models import ROLES, Employee

bp = Blueprint("employees", __name__, url_prefix="/api/employees")

TEXT_FIELDS = ("employee_code", "name", "email", "phone", "designation")
MIN_PASSWORD = 8


def apply_fields(emp, data):
    """Copies allowed fields from the request onto the employee. Returns an error message or None."""
    for field in TEXT_FIELDS:
        if field in data:
            value = (data[field] or "").strip()
            setattr(emp, field, value or None)
    if emp.email:
        emp.email = emp.email.lower()
    if not emp.name or not emp.email:
        return "Name and email are required."

    if "role" in data:
        if data["role"] not in ROLES:
            return "Role must be EMPLOYEE, MANAGER or ADMIN."
        emp.role = data["role"]
    problem = set_access(emp, data, db)
    if problem:
        return problem
    if "manager_id" in data:
        manager_id = data["manager_id"] or None
        if manager_id and (manager_id == emp.id or db.session.get(Employee, manager_id) is None):
            return "Reporting manager is not valid."
        emp.manager_id = manager_id
    if "is_active" in data:
        emp.is_active = bool(data["is_active"])
    if data.get("password"):
        if len(data["password"]) < MIN_PASSWORD:
            return f"Password must be at least {MIN_PASSWORD} characters."
        emp.password_hash = generate_password_hash(data["password"])

    clash = Employee.query.filter(Employee.id != emp.id).filter(
        db.or_(Employee.email == emp.email,
               db.and_(Employee.employee_code.isnot(None), Employee.employee_code == emp.employee_code))
    ).first()
    if clash:
        return "Another employee already has this email or employee code."
    return None


@bp.get("")
@login_required()
def list_employees():
    """ADMIN sees everyone. MANAGER sees the people of every department they have access to.
    EMPLOYEE sees active colleagues of those departments."""
    me = current_employee()
    query = Employee.query.order_by(Employee.name)
    if me.role != "ADMIN":
        query = query.filter(Employee.department_id.in_(department_ids(me)))
    if me.role == "EMPLOYEE":
        query = query.filter_by(is_active=True)
    return jsonify([employee_json(e) for e in query])


@bp.post("")
@login_required("ADMIN")
def create_employee():
    data = request.get_json(silent=True) or {}
    if not data.get("password"):
        return error("Password is required for a new employee.")
    emp = Employee(department_id=current_employee().department_id, role="EMPLOYEE")
    with db.session.no_autoflush:
        problem = apply_fields(emp, data)
    if problem:
        return error(problem)
    db.session.add(emp)
    db.session.commit()
    return jsonify(employee_json(emp)), 201


@bp.patch("/<int:employee_id>")
@login_required("ADMIN")
def update_employee(employee_id):
    emp = db.session.get(Employee, employee_id)
    if emp is None:
        return error("Employee not found.", 404)
    data = request.get_json(silent=True) or {}
    if emp.id == current_employee().id and (
        data.get("is_active") is False or data.get("role", "ADMIN") != "ADMIN"
    ):
        return error("You cannot deactivate yourself or remove your own admin role.")
    with db.session.no_autoflush:
        problem = apply_fields(emp, data)
    if problem:
        db.session.rollback()
        return error(problem)
    db.session.commit()
    return jsonify(employee_json(emp))
