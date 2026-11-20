"""Who can use what. One place for the rules, used by every route.

- ADMIN: everything.
- Everyone else: their home department plus any extra departments they were given,
  and inside those either every category or only the categories ticked for them.
- MANAGER sees all work in the departments and categories they have access to.
- EMPLOYEE sees only work they logged or are assigned to.
"""
from .models import Category, Department


def department_ids(emp):
    """Ids of the departments this employee has access to (home + extra)."""
    return {emp.department_id} | {d.id for d in emp.extra_departments}


def category_limit(emp):
    """Set of category ids the employee is limited to, or None when not limited."""
    if emp.role == "ADMIN" or not emp.categories:
        return None
    return {c.id for c in emp.categories}


def can_use_category(emp, category):
    if emp.role == "ADMIN":
        return True
    if category.department_id not in department_ids(emp):
        return False
    limit = category_limit(emp)
    return limit is None or category.id in limit


def allowed_departments(emp):
    query = Department.query.order_by(Department.name)
    if emp.role != "ADMIN":
        query = query.filter(Department.id.in_(department_ids(emp)))
    return query.all()


def access_json(emp):
    """The access part of an employee, for the API."""
    extra = sorted(emp.extra_departments, key=lambda d: d.name.lower())
    return {
        "department_ids": [emp.department_id] + [d.id for d in extra if d.id != emp.department_id],
        "department_names": [emp.department.name] + [d.name for d in extra if d.id != emp.department_id],
        "category_ids": sorted(c.id for c in emp.categories),
        "category_names": sorted(c.name for c in emp.categories),
    }


def set_access(emp, data, db):
    """Applies department_id / department_ids / category_ids from a request. Returns an error message or None."""
    if "department_id" in data:
        if not isinstance(data["department_id"], int) or db.session.get(Department, data["department_id"]) is None:
            return "Department not found."
        emp.department_id = data["department_id"]

    if "department_ids" in data:
        ids = data["department_ids"] or []
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
            return "Departments are not valid."
        departments = Department.query.filter(Department.id.in_(ids)).all() if ids else []
        if len(departments) != len(set(ids)):
            return "Department not found."
        emp.extra_departments = [d for d in departments if d.id != emp.department_id]

    allowed = {emp.department_id} | {d.id for d in emp.extra_departments}
    if "category_ids" in data:
        ids = data["category_ids"] or []
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
            return "Categories are not valid."
        categories = Category.query.filter(Category.id.in_(ids)).all() if ids else []
        if len(categories) != len(set(ids)):
            return "Category not found."
        if any(c.department_id not in allowed for c in categories):
            return "A chosen category belongs to a department this person has no access to."
        emp.categories = categories
    else:
        # Departments changed: drop categories that are no longer inside them.
        emp.categories = [c for c in emp.categories if c.department_id in allowed]
    return None
