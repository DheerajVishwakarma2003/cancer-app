from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.utils.jwt_helpers import make_token, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from app.utils.db import db_insert, db_select, db_update
import uuid, datetime, re

auth_bp = Blueprint("auth", __name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validate_email(email: str) -> bool:
    return bool(EMAIL_RE.match(email or ""))


@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password", "")
    role     = data.get("role", "patient")
    name     = (data.get("name") or "").strip()

    if not _validate_email(email):
        return jsonify({"error": "Invalid email address"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    if role not in ("doctor", "patient"):
        return jsonify({"error": "Invalid role"}), 400

    existing = db_select("users", {"email": email})
    if existing:
        return jsonify({"error": "Email already registered"}), 409

    user_id = str(uuid.uuid4())
    hashed  = generate_password_hash(password)
    now     = datetime.datetime.utcnow().isoformat()

    user_row = {
        "id": user_id,
        "email": email,
        "password_hash": hashed,
        "role": role,
        "name": name,
        "created_at": now,
        "is_active": True,
        "is_verified": role == "patient",  # doctors need admin verification
    }
    db_insert("users", user_row)

    if role == "doctor":
        db_insert("doctors", {"user_id": user_id, "name": name, "email": email,
                               "is_approved": False, "created_at": now})
    else:
        db_insert("patients", {"user_id": user_id, "name": name, "email": email,
                                "created_at": now})

    token = make_token(user_id, role, email)
    return jsonify({"message": "Registered successfully", "token": token,
                    "role": role, "user_id": user_id}), 201


@auth_bp.post("/login")
def login():
    data     = request.get_json(silent=True) or {}
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password", "")

    rows = db_select("users", {"email": email})
    if not rows:
        return jsonify({"error": "Invalid credentials"}), 401

    user = rows[0]
    if not user.get("is_active"):
        return jsonify({"error": "Account suspended"}), 403
    if not check_password_hash(user.get("password_hash", ""), password):
        return jsonify({"error": "Invalid credentials"}), 401

    token = make_token(user["id"], user["role"], email)
    return jsonify({
        "token": token,
        "role":  user["role"],
        "name":  user.get("name"),
        "user_id": user["id"],
    })


@auth_bp.post("/reset-password")
@jwt_required()
def reset_password():
    current = current_user()
    data    = request.get_json(silent=True) or {}
    new_pw  = data.get("new_password", "")
    if len(new_pw) < 8:
        return jsonify({"error": "Password too short"}), 400
    db_update("users", {"id": current["id"]},
              {"password_hash": generate_password_hash(new_pw)})
    return jsonify({"message": "Password updated"})


@auth_bp.get("/me")
@jwt_required()
def me():
    identity = current_user()
    rows = db_select("users", {"id": identity["id"]})
    if not rows:
        return jsonify({"error": "User not found"}), 404
    u = rows[0]
    u.pop("password_hash", None)
    return jsonify(u)


# ── One-time admin setup (only works when NO admin exists yet) ────────────────
@auth_bp.post("/setup-admin")
def setup_admin():
    """
    POST /api/auth/setup-admin
    Body: { "email": "...", "password": "...", "name": "...", "setup_key": "..." }

    Only works if:
      1. ADMIN_SETUP_KEY env var is set
      2. No admin account exists yet in the database
    """
    import os
    setup_key = os.getenv("ADMIN_SETUP_KEY", "")
    if not setup_key:
        return jsonify({"error": "Admin setup is disabled. Set ADMIN_SETUP_KEY in .env to enable."}), 403

    data = request.get_json(silent=True) or {}
    if data.get("setup_key") != setup_key:
        return jsonify({"error": "Invalid setup key"}), 403

    email    = (data.get("email")    or "").strip().lower()
    password =  data.get("password") or ""
    name     = (data.get("name")     or "Super Admin").strip()

    if not _validate_email(email):
        return jsonify({"error": "Invalid email"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    # Block if an admin already exists
    all_users = db_select("users") or []
    if any(u.get("role") == "admin" for u in all_users):
        return jsonify({"error": "An admin account already exists. Use login instead."}), 409

    # Check email not taken
    if db_select("users", {"email": email}):
        return jsonify({"error": "Email already registered"}), 409

    user_id = str(uuid.uuid4())
    import datetime as _dt
    db_insert("users", {
        "id":            user_id,
        "email":         email,
        "password_hash": generate_password_hash(password),
        "role":          "admin",
        "name":          name,
        "is_active":     True,
        "is_verified":   True,
        "created_at":    _dt.datetime.utcnow().isoformat(),
    })

    from app.utils.jwt_helpers import make_token
    token = make_token(user_id, "admin", email)
    return jsonify({
        "message": "Admin account created successfully!",
        "token":   token,
        "role":    "admin",
        "user_id": user_id,
    }), 201
