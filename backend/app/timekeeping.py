"""Time rules shared by the timer routes and the work item routes."""
from datetime import datetime

from . import db
from .models import TimeEntry


def recalc_total(item):
    """work_items.total_minutes is always the sum of its time entries."""
    db.session.flush()
    item.total_minutes = (db.session.query(db.func.coalesce(db.func.sum(TimeEntry.minutes), 0))
                          .filter(TimeEntry.work_item_id == item.id).scalar())


def close_entry(entry, now=None):
    """Stops a running timer. Anything under a minute still counts as one minute."""
    entry.ended_at = now or datetime.now()
    seconds = (entry.ended_at - entry.started_at).total_seconds()
    entry.minutes = max(1, round(seconds / 60))
    recalc_total(entry.work_item)
    return entry


def running_entries(**where):
    return TimeEntry.query.filter(TimeEntry.ended_at.is_(None)).filter_by(**where).all()
