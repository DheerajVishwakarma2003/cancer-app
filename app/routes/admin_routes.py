from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.utils.db import db_select, db_update, db_insert
from app.utils.jwt_helpers import current_user
import uuid, datetime

admin_bp = Blueprint("admin", __name__)


def _require_admin():
    identity = current_user()
    if identity.get("role") != "admin":
        return None, (jsonify({"error": "Admin access required"}), 403)
    return identity, None


# ── Users ─────────────────────────────────────────────────────────────────────
@admin_bp.get("/users")
@jwt_required()
def list_users():
    _, err = _require_admin()
    if err: return err
    users = db_select("users") or []
    for u in users:
        u.pop("password_hash", None)
    return jsonify(users)


# ── Doctor approval ───────────────────────────────────────────────────────────
@admin_bp.put("/doctors/<doc_id>/approve")
@jwt_required()
def approve_doctor(doc_id):
    _, err = _require_admin()
    if err: return err
    db_update("doctors", {"user_id": doc_id}, {"is_approved": True})
    db_update("users",   {"id": doc_id},      {"is_verified": True})
    return jsonify({"message": "Doctor approved"})


@admin_bp.put("/doctors/<doc_id>/reject")
@jwt_required()
def reject_doctor(doc_id):
    _, err = _require_admin()
    if err: return err
    db_update("doctors", {"user_id": doc_id}, {"is_approved": False})
    db_update("users",   {"id": doc_id},      {"is_verified": False})
    return jsonify({"message": "Doctor rejected"})


# ── Suspend / Unsuspend user ───────────────────────────────────────────────────
@admin_bp.put("/users/<uid>/suspend")
@jwt_required()
def suspend_user(uid):
    admin, err = _require_admin()
    if err: return err
    # Prevent self-suspend
    if uid == admin["id"]:
        return jsonify({"error": "You cannot suspend your own account"}), 400
    db_update("users", {"id": uid}, {"is_active": False})
    return jsonify({"message": "User suspended"})


@admin_bp.put("/users/<uid>/unsuspend")
@jwt_required()
def unsuspend_user(uid):
    _, err = _require_admin()
    if err: return err
    db_update("users", {"id": uid}, {"is_active": True})
    return jsonify({"message": "User unsuspended"})


# ── Role change ────────────────────────────────────────────────────────────────
@admin_bp.put("/users/<uid>/role")
@jwt_required()
def change_role(uid):
    admin, err = _require_admin()
    if err: return err
    if uid == admin["id"]:
        return jsonify({"error": "Cannot change your own role"}), 400
    data = request.get_json(silent=True) or {}
    role = data.get("role")
    if role not in ("doctor", "patient", "admin"):
        return jsonify({"error": "Invalid role"}), 400
    db_update("users", {"id": uid}, {"role": role})
    return jsonify({"message": f"Role changed to {role}"})


# ── Platform stats ─────────────────────────────────────────────────────────────
@admin_bp.get("/stats")
@jwt_required()
def platform_stats():
    _, err = _require_admin()
    if err: return err
    users  = db_select("users")  or []
    docs   = db_select("doctors") or []
    pats   = db_select("patients") or []
    preds  = db_select("ai_predictions") or []
    apts   = db_select("appointments") or []
    subs   = db_select("subscriptions") or []
    return jsonify({
        "total_users":        len(users),
        "total_doctors":      len(docs),
        "total_patients":     len(pats),
        "total_predictions":  len(preds),
        "total_appointments": len(apts),
        "total_subscriptions":len(subs),
        "active_subscriptions": len([s for s in subs if s.get("status") == "active"]),
        "detected_cases":     len([p for p in preds if p.get("detected")]),
    })


# ── Subscriptions (admin view) ─────────────────────────────────────────────────
@admin_bp.get("/subscriptions")
@jwt_required()
def list_subscriptions():
    _, err = _require_admin()
    if err: return err
    subs = db_select("subscriptions") or []

    PLAN_NAMES = {
        "doctor_basic":  "Doctor Basic",
        "doctor_pro":    "Doctor Pro",
        "patient_basic": "Patient Basic",
        "patient_pro":   "Patient Pro",
    }
    PLAN_PRICES = {
        "doctor_basic": 99900, "doctor_pro": 249900,
        "patient_basic": 29900, "patient_pro": 79900,
    }

    # Enrich with user info
    for s in subs:
        if s.get("user_id"):
            u = db_select("users", {"id": s["user_id"]})
            if u:
                s["user_name"]  = u[0].get("name", "—")
                s["user_email"] = u[0].get("email", "—")
                s["user_role"]  = u[0].get("role",  "—")
        s["plan_name"] = PLAN_NAMES.get(s.get("plan_id", ""), s.get("plan_id", "—"))
        s["amount"]    = PLAN_PRICES.get(s.get("plan_id", ""), 0)

    return jsonify(subs)


@admin_bp.put("/subscriptions/<sub_id>/cancel")
@jwt_required()
def cancel_subscription(sub_id):
    _, err = _require_admin()
    if err: return err
    db_update("subscriptions", {"id": sub_id}, {"status": "cancelled"})
    return jsonify({"message": "Subscription cancelled"})


# ── AI predictions (admin view) ────────────────────────────────────────────────
@admin_bp.get("/predictions")
@jwt_required()
def list_predictions():
    _, err = _require_admin()
    if err: return err
    preds = db_select("ai_predictions") or []
    return jsonify(preds)
