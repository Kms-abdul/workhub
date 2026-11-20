# WorkHub — Implementation Plan (simple version)

One work-item engine, configured from the database. DE is the first department; adding HR or IT later means adding rows, not code.

## 1. What we keep simple

| The long design said | This plan does | Why |
| --- | --- | --- |
| `companies` table | Skip | One company. Add later with one migration if ever needed. |
| Subcategories + work types + classification tree | One `classifications` table with `parent_id` | One table covers any depth. |
| `workflow_definitions` + `workflow_statuses` | One `statuses` table per category | One workflow per category is enough. |
| `support_ticket_details` + `custom_field_definitions` + `work_item_custom_values` | `custom_fields` table + one JSON column on `work_items` | Quick Solutions fields (branch, caller, resolution) become custom fields. No special ticket table. |
| `employee_category_assignments` | Skip | Any employee can log work in any category of their department. |
| 5 roles | 3 roles: `EMPLOYEE`, `MANAGER`, `ADMIN` | Enough for v1. |
| services / repositories layers | Routes + models only | Add layers when a file gets too big. |
| Projects, comments, attachments, notifications, attendance, AI summaries | Not in v1 | Phase 2+. |

## 2. Tech stack

- **Backend:** Flask, Flask-SQLAlchemy, Flask-Migrate (Alembic), Flask-JWT-Extended, Flask-CORS
- **Database:** MySQL 8
- **Frontend:** React + Vite, Tailwind CSS, React Router, Axios, TanStack Query, Recharts
- **Deploy:** Nginx (static frontend + proxy) → Gunicorn → Flask → MySQL

## 3. Database — 9 tables

```
departments      id, code, name, is_active
categories       id, department_id, code, name, ticket_prefix, display_order, is_active
classifications  id, category_id, parent_id (nullable), name, display_order, is_active
statuses         id, category_id, name, kind (OPEN | ACTIVE | DONE), color, display_order, is_initial
custom_fields    id, category_id, field_key, label,
                 field_type (TEXT | NUMBER | DATE | SELECT), options (JSON), is_required, display_order

employees        id, employee_code, name, email, password_hash, phone, designation,
                 department_id, manager_id (nullable), role (EMPLOYEE | MANAGER | ADMIN), is_active

work_items       id, number (e.g. DEV-0012, QS-0031), department_id, category_id,
                 classification_id (nullable), status_id, title, description,
                 priority (LOW | MEDIUM | HIGH | CRITICAL), created_by, assigned_to,
                 due_date, completed_at, total_minutes, custom_data (JSON),
                 created_at, updated_at

time_entries     id, work_item_id, employee_id, started_at, ended_at (NULL = timer running),
                 minutes, entry_type (TIMER | MANUAL), note

activity_log     id, work_item_id, employee_id, action, old_value, new_value, created_at
```

Three rules that make it dynamic without being complicated:

1. **`statuses.kind`** — every status belongs to OPEN, ACTIVE or DONE. Reports and dashboards count by `kind`, so the code never needs to know status names like "Code Review" or "Waiting for Customer".
2. **`custom_data` JSON** — the Add Work form reads `custom_fields` for the chosen category and renders the extra inputs; values are saved in one JSON column.
3. **No category names in code** — never `if category == "DEVELOPMENT"`. Everything comes from the tables above.

## 4. Seed data (DE department)

A `seed.py` script creates:

- Department: `DE — Digital Engineering`
- Categories: Development (`DEV`), Admin (`ADM`), Academic ERP Support (`ACA`), Finance ERP Support (`FIN`), Quick Solutions (`QS`)
- Classifications — each category has its own separate list, managed by the admin, and nothing is shared between categories:
  - Development: Frontend, Backend, Database, API, Testing, Deployment, …
  - Academic ERP Support: Admission, Attendance, GradeBook, Examination, …
  - Finance ERP Support: Fee Collection, Receipt, Concession, Accounts, …
  - Admin: Meetings, Documentation, Coordination, …
  - **Quick Solutions: none.** Anything can come in, so the employee types the problem in their own words. A category with no classifications simply shows no dropdown.
- Statuses per category:
  - Development: Backlog → In Progress → Code Review → Testing → Completed
  - Support / Quick Solutions: Open → In Progress → Waiting for Customer → Escalated → Resolved → Closed
  - Admin: Pending → In Progress → Completed
- Quick Solutions custom fields, all free text (no dropdowns): Branch / Customer, Caller Name, Phone, Resolution
- Development custom fields: Project, Git Branch
- One admin user

## 5. Folder structure

```
WorkTracker/
├── backend/
│   ├── app/
│   │   ├── __init__.py        # app factory, register blueprints
│   │   ├── config.py
│   │   ├── models.py          # all 9 models
│   │   ├── auth.py            # login, role decorator
│   │   └── routes/
│   │       ├── config_routes.py   # departments, categories, classifications, statuses, custom fields
│   │       ├── employees.py
│   │       ├── work_items.py
│   │       ├── time_entries.py
│   │       └── reports.py         # dashboard + reports
│   ├── migrations/
│   ├── seed.py
│   └── requirements.txt
└── frontend/
    └── src/
        ├── api/               # axios client + query hooks
        ├── components/        # Layout, WorkItemForm, DynamicFields, TimerButton, StatusBadge
        └── pages/             # Login, Dashboard, MyWork, AllWork, WorkItemDetail, Reports, Team, Admin
```

## 6. API

```
POST   /api/auth/login
GET    /api/auth/me

GET    /api/config                       # whole config tree in one call (cached on frontend)
CRUD   /api/departments | /categories | /classifications | /statuses | /custom-fields   (ADMIN)
CRUD   /api/employees                    (ADMIN)

GET    /api/work-items?mine=1&category_id=&status_kind=&assigned_to=&from=&to=
POST   /api/work-items
GET    /api/work-items/:id               # includes time entries + activity
PATCH  /api/work-items/:id               # status, assignee, fields → writes activity_log

POST   /api/work-items/:id/timer/start   # stops any other running timer for this employee
POST   /api/work-items/:id/timer/stop
POST   /api/work-items/:id/time          # manual entry

GET    /api/dashboard?date=
GET    /api/reports/daily?date=&employee_id=
GET    /api/reports/employees?from=&to=
GET    /api/reports/categories?from=&to=
GET    /api/reports/support?from=&to=&q= # counts by status, employee and branch; q = text search in the problem
```

## 7. Screens

| Screen | What it does |
| --- | --- |
| Login | Email + password |
| Dashboard | Today's cards (total / done / active / open), hours, per-category table, per-employee chart |
| **My Work** | Today's items, `+ Add Work` quick form, Start / Pause / Complete buttons. The daily screen. |
| All Work | Filterable table (category, status, employee, date). Quick Solutions is this screen filtered to `QS`, with a `+ Add Support Call` shortcut. That form is typing only: Problem (free text, required), Branch / Customer, Caller, Phone, Resolution. Category is preset, status starts at Open, and nothing has to be selected. |
| Work Item Detail | Fields, time entries, activity history |
| Reports | Daily, Employee, Category, Support — each with date filters |
| Team | Employee list (MANAGER sees team, ADMIN edits) |
| Admin | Departments, categories, classification tree, statuses, custom fields |

Roles: EMPLOYEE sees and edits own work · MANAGER sees the whole department and assigns · ADMIN also manages config and employees.

## 8. Build order

Each step ends with something you can click and test.

| # | Step | Done when |
| --- | --- | --- |
| 1 | **Project setup** — Flask app, MySQL, models, first migration, `seed.py`; Vite + Tailwind + layout with sidebar | Backend runs, DB has seeded DE config, frontend shows empty shell |
| 2 | **Auth + employees** — login, JWT, role decorator, employee CRUD | Admin logs in and creates an employee who can log in |
| 3 | **Config API + Admin screens** — CRUD for categories, classifications, statuses, custom fields | Admin adds a new category with its own statuses, no code change |
| 4 | **Work items + My Work** — dynamic Add Work form, list, status change, activity log | Employee adds work in under 30 seconds; form changes per category |
| 5 | **Time tracking** — timer start/stop, manual entry, `total_minutes` rollup | Timer runs across page reloads; manual time adds to the total |
| 6 | **All Work + Quick Solutions** — filter table, detail page, support call shortcut | Support call logged with branch, caller, resolution |
| 7 | **Dashboard** — cards, category table, charts | Numbers match the work entered |
| 8 | **Reports** — daily, employee, category, support | Manager gets a daily department report for any date |
| 9 | **Deploy** — Nginx + Gunicorn + MySQL on the server, backups | Team uses it from the office network |

Rough size for one developer: steps 1–3 about a week, 4–6 about two weeks, 7–9 about a week. Use it inside DE for two weeks before adding anything from the list below.

## 9. Access per person (added after v1 plan)

Two small link tables, set on the Team screen when adding or editing a person:

```
employee_departments   employee_id, department_id   # extra departments besides the home department
employee_categories    employee_id, category_id     # no rows = every category of their departments
```

| Role | Sees | Can log work in |
| --- | --- | --- |
| EMPLOYEE | Only work they logged or are assigned to | Their departments, limited to their ticked categories |
| MANAGER | All work, people and reports in their departments, limited to their ticked categories | Same |
| ADMIN | Everything | Everything |

The rules live in one file, `backend/app/access.py`, and every route uses them.

## 10. Later (not v1)

- Projects, comments, attachments
- Notifications, reminders, overdue escalation
- Per-category employee assignment and finer permissions
- Repeated-issue detection ("Branch X reported 14 fee issues this month")
- Attendance / working hours
- Second department (HR, IT) — config only
- AI weekly summaries
