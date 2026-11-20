"""All tables. Nothing here knows about a specific department or category:
"Development", "Quick Solutions" etc. are rows, not code."""
from datetime import datetime

from . import db

# Allowed values for the plain string columns below.
STATUS_KINDS = ("OPEN", "ACTIVE", "DONE")
FIELD_TYPES = ("TEXT", "NUMBER", "DATE", "SELECT")
ROLES = ("EMPLOYEE", "MANAGER", "ADMIN")
PRIORITIES = ("LOW", "MEDIUM", "HIGH", "CRITICAL")
ENTRY_TYPES = ("TIMER", "MANUAL")


# ---------- Configuration ----------

class Department(db.Model):
    __tablename__ = "departments"
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(50), nullable=False, unique=True)
    name = db.Column(db.String(150), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    categories = db.relationship("Category", back_populates="department", order_by="Category.display_order")


class Category(db.Model):
    __tablename__ = "categories"
    __table_args__ = (db.UniqueConstraint("department_id", "code"),)
    id = db.Column(db.Integer, primary_key=True)
    department_id = db.Column(db.ForeignKey("departments.id"), nullable=False)
    code = db.Column(db.String(50), nullable=False)
    name = db.Column(db.String(150), nullable=False)
    ticket_prefix = db.Column(db.String(10), nullable=False)  # work item numbers: DEV-0001, QS-0001
    next_number = db.Column(db.Integer, nullable=False, default=1)
    display_order = db.Column(db.Integer, nullable=False, default=0)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    department = db.relationship("Department", back_populates="categories")
    classifications = db.relationship("Classification", back_populates="category", order_by="Classification.display_order")
    statuses = db.relationship("Status", back_populates="category", order_by="Status.display_order")
    custom_fields = db.relationship("CustomField", back_populates="category", order_by="CustomField.display_order")


class Classification(db.Model):
    """A category's own issue list. parent_id allows any depth. A category may have none."""
    __tablename__ = "classifications"
    id = db.Column(db.Integer, primary_key=True)
    category_id = db.Column(db.ForeignKey("categories.id"), nullable=False)
    parent_id = db.Column(db.ForeignKey("classifications.id"))
    name = db.Column(db.String(150), nullable=False)
    display_order = db.Column(db.Integer, nullable=False, default=0)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    category = db.relationship("Category", back_populates="classifications")


class Status(db.Model):
    """A category's workflow step. Reports count by `kind`, never by name."""
    __tablename__ = "statuses"
    id = db.Column(db.Integer, primary_key=True)
    category_id = db.Column(db.ForeignKey("categories.id"), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    kind = db.Column(db.String(10), nullable=False)  # STATUS_KINDS
    color = db.Column(db.String(20))
    display_order = db.Column(db.Integer, nullable=False, default=0)
    is_initial = db.Column(db.Boolean, nullable=False, default=False)

    category = db.relationship("Category", back_populates="statuses")


class CustomField(db.Model):
    """Extra form field for one category. Values are stored in WorkItem.custom_data[field_key]."""
    __tablename__ = "custom_fields"
    __table_args__ = (db.UniqueConstraint("category_id", "field_key"),)
    id = db.Column(db.Integer, primary_key=True)
    category_id = db.Column(db.ForeignKey("categories.id"), nullable=False)
    field_key = db.Column(db.String(100), nullable=False)
    label = db.Column(db.String(150), nullable=False)
    field_type = db.Column(db.String(10), nullable=False, default="TEXT")  # FIELD_TYPES
    options = db.Column(db.JSON)  # list of choices, SELECT only
    is_required = db.Column(db.Boolean, nullable=False, default=False)
    display_order = db.Column(db.Integer, nullable=False, default=0)

    category = db.relationship("Category", back_populates="custom_fields")


# ---------- People ----------

# Extra departments an employee can work in, besides their home department.
# A manager with rows here sees the work of all those departments.
employee_departments = db.Table(
    "employee_departments",
    db.Column("employee_id", db.ForeignKey("employees.id"), primary_key=True),
    db.Column("department_id", db.ForeignKey("departments.id"), primary_key=True),
)

# Categories an employee is limited to. No rows = every category of their departments.
employee_categories = db.Table(
    "employee_categories",
    db.Column("employee_id", db.ForeignKey("employees.id"), primary_key=True),
    db.Column("category_id", db.ForeignKey("categories.id"), primary_key=True),
)

class Employee(db.Model):
    __tablename__ = "employees"
    id = db.Column(db.Integer, primary_key=True)
    employee_code = db.Column(db.String(50), unique=True)
    name = db.Column(db.String(150), nullable=False)
    email = db.Column(db.String(150), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    phone = db.Column(db.String(20))
    designation = db.Column(db.String(100))
    department_id = db.Column(db.ForeignKey("departments.id"), nullable=False)
    manager_id = db.Column(db.ForeignKey("employees.id"))
    role = db.Column(db.String(10), nullable=False, default="EMPLOYEE")  # ROLES
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now)

    department = db.relationship("Department")
    extra_departments = db.relationship("Department", secondary=employee_departments)
    categories = db.relationship("Category", secondary=employee_categories)


# ---------- Work ----------

class WorkItem(db.Model):
    __tablename__ = "work_items"
    __table_args__ = (
        db.Index("idx_work_assigned_status", "assigned_to", "status_id"),
        db.Index("idx_work_category_created", "category_id", "created_at"),
    )
    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.String(50), nullable=False, unique=True)
    department_id = db.Column(db.ForeignKey("departments.id"), nullable=False)
    category_id = db.Column(db.ForeignKey("categories.id"), nullable=False)
    classification_id = db.Column(db.ForeignKey("classifications.id"))
    status_id = db.Column(db.ForeignKey("statuses.id"), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    priority = db.Column(db.String(10), nullable=False, default="MEDIUM")  # PRIORITIES
    created_by = db.Column(db.ForeignKey("employees.id"), nullable=False)
    assigned_to = db.Column(db.ForeignKey("employees.id"))
    due_date = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)
    total_minutes = db.Column(db.Integer, nullable=False, default=0)
    custom_data = db.Column(db.JSON, nullable=False, default=dict)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.now, onupdate=datetime.now)

    category = db.relationship("Category")
    classification = db.relationship("Classification")
    status = db.relationship("Status")
    creator = db.relationship("Employee", foreign_keys=[created_by])
    assignee = db.relationship("Employee", foreign_keys=[assigned_to])
    time_entries = db.relationship("TimeEntry", back_populates="work_item", order_by="TimeEntry.started_at")
    activity = db.relationship("ActivityLog", back_populates="work_item", order_by="ActivityLog.created_at")


class TimeEntry(db.Model):
    """ended_at IS NULL means the timer is still running."""
    __tablename__ = "time_entries"
    __table_args__ = (db.Index("idx_time_employee_started", "employee_id", "started_at"),)
    id = db.Column(db.Integer, primary_key=True)
    work_item_id = db.Column(db.ForeignKey("work_items.id"), nullable=False, index=True)
    employee_id = db.Column(db.ForeignKey("employees.id"), nullable=False)
    started_at = db.Column(db.DateTime, nullable=False, default=datetime.now)
    ended_at = db.Column(db.DateTime)
    minutes = db.Column(db.Integer, nullable=False, default=0)
    entry_type = db.Column(db.String(10), nullable=False, default="MANUAL")  # ENTRY_TYPES
    note = db.Column(db.Text)

    work_item = db.relationship("WorkItem", back_populates="time_entries")
    employee = db.relationship("Employee")


class ActivityLog(db.Model):
    __tablename__ = "activity_log"
    id = db.Column(db.Integer, primary_key=True)
    work_item_id = db.Column(db.ForeignKey("work_items.id"), nullable=False, index=True)
    employee_id = db.Column(db.ForeignKey("employees.id"), nullable=False)
    action = db.Column(db.String(50), nullable=False)
    old_value = db.Column(db.Text)
    new_value = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now)

    work_item = db.relationship("WorkItem", back_populates="activity")
    employee = db.relationship("Employee")
