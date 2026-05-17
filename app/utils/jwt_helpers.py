"""
JWT helpers — compatible with flask-jwt-extended 4.7+
Identity is stored as a JSON string; decoded back to dict on access.
"""
import json
from flask_jwt_extended import create_access_token as _create, get_jwt_identity as _get


def make_token(user_id: str, role: str, email: str) -> str:
    identity = json.dumps({"id": user_id, "role": role, "email": email})
    return _create(identity=identity)


def current_user() -> dict:
    raw = _get()
    try:
        return json.loads(raw)
    except Exception:
        return {"id": raw, "role": "patient", "email": ""}
