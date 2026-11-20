"""Start fresh: deletes EVERYTHING in the database named in .env, creates all tables again
and loads the DE department setup plus the first admin user.

    python reset_db.py

It asks you to type the database name before it deletes anything.
"""
import sys

from flask_migrate import upgrade

from app import create_app, db
from seed import seed

app = create_app()
with app.app_context():
    name = db.engine.url.database
    print(f"This will delete ALL tables and data in the database '{name}'.")
    if input("Type the database name to continue: ").strip() != name:
        sys.exit("Cancelled. Nothing was changed.")

    db.reflect()        # find every table that exists, including alembic's own
    db.drop_all()
    db.metadata.clear()
    print("Old tables removed.")

    upgrade()           # create all tables
    seed()              # DE department, categories, statuses, admin user
    print("Fresh database is ready.")
