"""
services/notification_service.py — In-app notification helpers
"""
import uuid
import datetime
from app.utils.db import db_insert, db_select, db_update


def send_notification(user_id: str, title: str, message: str, notif_type: str = "info"):
    """Insert a notification record for a user."""
    record = {
        "id":         str(uuid.uuid4()),
        "user_id":    user_id,
        "title":      title,
        "message":    message,
        "type":       notif_type,
        "read":       False,
        "created_at": datetime.datetime.utcnow().isoformat(),
    }
    try:
        db_insert("notifications", record)
    except Exception:
        pass
    return record


def get_notifications(user_id: str, unread_only: bool = False):
    rows = db_select("notifications", {"user_id": user_id})
    if unread_only:
        rows = [r for r in rows if not r.get("read")]
    return sorted(rows, key=lambda r: r.get("created_at", ""), reverse=True)


def mark_read(notif_id: str):
    db_update("notifications", {"id": notif_id}, {"read": True})
