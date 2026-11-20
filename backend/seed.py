"""Loads the DE department configuration and the first admin user.
Safe to run again: it does nothing if the DE department already exists.

No work types are loaded. Each category starts with an empty list, and the people
using it build their own list by typing new work types as they log work."""
import os

from werkzeug.security import generate_password_hash

from app import create_app, db
from app.models import Category, CustomField, Department, Employee, Status

DEV_FLOW = [("Backlog", "OPEN"), ("In Progress", "ACTIVE"), ("Code Review", "ACTIVE"),
            ("Testing", "ACTIVE"), ("Completed", "DONE")]
SUPPORT_FLOW = [("Open", "OPEN"), ("In Progress", "ACTIVE"), ("Waiting for Customer", "ACTIVE"),
                ("Escalated", "ACTIVE"), ("Resolved", "DONE"), ("Closed", "DONE")]
ADMIN_FLOW = [("Pending", "OPEN"), ("In Progress", "ACTIVE"), ("Completed", "DONE")]

KIND_COLORS = {"OPEN": "gray", "ACTIVE": "blue", "DONE": "green"}

# code, name, prefix, statuses, custom fields (key, label)
CATEGORIES = [
    ("DEV", "Development", "DEV", DEV_FLOW, [("project", "Project"), ("git_branch", "Git Branch")]),
    ("ADMIN", "Admin", "ADM", ADMIN_FLOW, []),
    ("ACADEMIC", "Academic ERP Support", "ACA", SUPPORT_FLOW, [("branch", "Branch")]),
    ("FINANCE", "Finance ERP Support", "FIN", SUPPORT_FLOW, [("branch", "Branch")]),
    ("QUICK", "Quick Solutions", "QS", SUPPORT_FLOW,
     [("branch", "Branch / Customer"), ("caller_name", "Caller Name"), ("phone", "Phone"),
      ("resolution", "Resolution")]),
]


def seed():
    if Department.query.filter_by(code="DE").first():
        print("DE department already exists. Nothing to do.")
        return

    de = Department(code="DE", name="Digital Engineering")
    db.session.add(de)

    for order, (code, name, prefix, flow, fields) in enumerate(CATEGORIES):
        cat = Category(department=de, code=code, name=name, ticket_prefix=prefix, display_order=order)
        for i, (status_name, kind) in enumerate(flow):
            cat.statuses.append(Status(name=status_name, kind=kind, color=KIND_COLORS[kind],
                                       display_order=i, is_initial=(i == 0)))
        for i, (key, label) in enumerate(fields):
            cat.custom_fields.append(CustomField(field_key=key, label=label, field_type="TEXT", display_order=i))
        db.session.add(cat)

    email = os.environ.get("ADMIN_EMAIL")
    password = os.environ.get("ADMIN_PASSWORD")
    if not email or not password:
        raise SystemExit("Set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env first.")
    db.session.add(Employee(name="Administrator", email=email, role="ADMIN", department=de,
                            password_hash=generate_password_hash(password)))

    db.session.commit()
    print(f"Seeded DE department with {len(CATEGORIES)} categories and admin user {email}.")


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        seed()
