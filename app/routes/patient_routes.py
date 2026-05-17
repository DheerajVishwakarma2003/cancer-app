import uuid, datetime
from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required, verify_jwt_in_request
from app.utils.db import db_insert, db_select, db_update
from app.utils.jwt_helpers import current_user

patient_bp = Blueprint("patients", __name__)


# ── Profile ───────────────────────────────────────────────────────────────────
@patient_bp.get("/profile")
@jwt_required()
def get_profile():
    identity = current_user()
    rows = db_select("patients", {"user_id": identity["id"]})
    return jsonify(rows[0] if rows else {})


@patient_bp.put("/profile")
@jwt_required()
def update_profile():
    identity = current_user()
    data = request.get_json(silent=True) or {}
    safe = {k: v for k, v in data.items() if k in (
        "name", "phone", "dob", "address", "blood_group",
        "gender", "height", "weight", "allergies", "conditions", "emergency_contact"
    )}
    db_update("patients", {"user_id": identity["id"]}, safe)
    if "name" in safe:
        db_update("users", {"id": identity["id"]}, {"name": safe["name"]})
    return jsonify({"message": "Profile updated"})


# ── Appointments ──────────────────────────────────────────────────────────────
@patient_bp.post("/appointments")
@jwt_required()
def book_appointment():
    identity  = current_user()
    data      = request.get_json(silent=True) or {}
    doctor_id = data.get("doctor_id")
    slot      = data.get("slot")
    if not doctor_id or not slot:
        return jsonify({"error": "doctor_id and slot are required"}), 400

    doc_rows    = db_select("doctors", {"user_id": doctor_id})
    doctor_name = doc_rows[0]["name"] if doc_rows else None
    pat_rows    = db_select("patients", {"user_id": identity["id"]})
    patient_name= pat_rows[0]["name"] if pat_rows else None

    record = {
        "id":           str(uuid.uuid4()),
        "patient_id":   identity["id"],
        "doctor_id":    doctor_id,
        "doctor_name":  doctor_name,
        "patient_name": patient_name,
        "slot":         slot,
        "reason":       data.get("reason", ""),
        "status":       "pending",
        "created_at":   datetime.datetime.utcnow().isoformat(),
    }
    db_insert("appointments", record)
    return jsonify({"message": "Appointment booked", "id": record["id"]}), 201


@patient_bp.get("/appointments")
@jwt_required()
def list_appointments():
    identity = current_user()
    rows = db_select("appointments", {"patient_id": identity["id"]})
    for a in rows:
        if a.get("doctor_id") and not a.get("doctor_name"):
            d = db_select("doctors", {"user_id": a["doctor_id"]})
            a["doctor_name"] = d[0]["name"] if d else None
    return jsonify(rows)


@patient_bp.put("/appointments/<apt_id>/cancel")
@jwt_required()
def cancel_appointment(apt_id):
    identity = current_user()
    rows = db_select("appointments", {"id": apt_id, "patient_id": identity["id"]})
    if not rows:
        return jsonify({"error": "Appointment not found"}), 404
    if rows[0]["status"] != "pending":
        return jsonify({"error": "Only pending appointments can be cancelled"}), 400
    db_update("appointments", {"id": apt_id}, {"status": "cancelled"})
    return jsonify({"message": "Appointment cancelled"})


# ── Prescriptions ──────────────────────────────────────────────────────────────
@patient_bp.get("/prescriptions")
@jwt_required()
def list_prescriptions():
    identity = current_user()
    rows = db_select("prescriptions", {"patient_id": identity["id"]})
    for rx in rows:
        if rx.get("doctor_id") and not rx.get("doctor_name"):
            d = db_select("doctors", {"user_id": rx["doctor_id"]})
            rx["doctor_name"] = d[0]["name"] if d else None
    return jsonify(rows)


@patient_bp.get("/prescriptions/<rx_id>/download")
def download_prescription(rx_id):
    """
    Download prescription as text file.
    Accepts JWT via:
      1. Authorization header (normal API call)
      2. ?token=<jwt> query param (direct browser URL / window.open)
    """
    # Try header first, then query param
    token = request.args.get("token")
    if token:
        from flask import g
        import os
        os.environ.setdefault("JWT_SECRET_KEY", "jwt-secret-key")
        try:
            from flask_jwt_extended import decode_token
            decoded = decode_token(token)
            import json
            identity_raw = decoded.get("sub", "{}")
            try:
                identity = json.loads(identity_raw)
            except Exception:
                identity = {"id": identity_raw, "role": "patient"}
        except Exception:
            return jsonify({"error": "Invalid or expired token"}), 401
    else:
        try:
            verify_jwt_in_request()
            identity = current_user()
        except Exception:
            return jsonify({"error": "Missing token: include ?token=<jwt> or Authorization header"}), 401

    rows = db_select("prescriptions", {"id": rx_id, "patient_id": identity["id"]})
    if not rows:
        return jsonify({"error": "Prescription not found or access denied"}), 404

    rx   = rows[0]
    meds = rx.get("medications", [])

    lines = [
        "=" * 60,
        "         OnchoLens — Patient Prescription",
        "=" * 60,
        f"  Date      : {datetime.datetime.utcnow().strftime('%d %B %Y')}",
        f"  Doctor    : Dr. {rx.get('doctor_name', rx.get('doctor_id', '—'))}",
        f"  Patient   : {rx.get('patient_name', identity.get('id', '—'))}",
        "",
        "  MEDICATIONS",
        "  " + "-" * 56,
    ]
    for i, m in enumerate(meds, 1):
        lines.append(f"  {i}. {m.get('name', '—')}")
        if m.get("dosage"):    lines.append(f"     Dosage    : {m['dosage']}")
        if m.get("frequency"): lines.append(f"     Frequency : {m['frequency']}")
        if m.get("duration"):  lines.append(f"     Duration  : {m['duration']}")
        lines.append("")

    if rx.get("notes"):
        lines += ["  DOCTOR'S NOTES", "  " + "-" * 56, f"  {rx['notes']}", ""]

    lines += [
        "  " + "-" * 56,
        "  ⚠  Follow your doctor's instructions carefully.",
        "  ⚠  Do not self-medicate or alter dosages.",
        "=" * 60,
        "  OnchoLens Healthcare AI Platform — oncolens.com",
        "=" * 60,
    ]

    return Response(
        "\n".join(lines),
        mimetype="text/plain",
        headers={"Content-Disposition": f"attachment; filename=prescription_{rx_id[:8]}.txt"}
    )


# ── AI predictions (patient view) ──────────────────────────────────────────────
@patient_bp.get("/predictions")
@jwt_required()
def my_predictions():
    identity = current_user()
    return jsonify(db_select("ai_predictions", {"patient_id": identity["id"]}))


# ── Patient: download their own AI scan report ────────────────────────────────
@patient_bp.get("/predictions/<pred_id>/download")
def download_prediction_report(pred_id):
    """
    Accepts ?token=<jwt> for window.open() browser downloads.
    """
    import json as _json
    token = request.args.get("token")
    if token:
        try:
            from flask_jwt_extended import decode_token
            decoded  = decode_token(token)
            raw      = decoded.get("sub", "{}")
            try:    identity = _json.loads(raw)
            except: identity = {"id": raw, "role": "patient"}
        except Exception:
            return jsonify({"error": "Invalid or expired token"}), 401
    else:
        try:
            verify_jwt_in_request()
            identity = current_user()
        except Exception:
            return jsonify({"error": "Missing token"}), 401

    rows = db_select("ai_predictions", {"id": pred_id, "patient_id": identity["id"]})
    if not rows:
        return jsonify({"error": "Record not found or access denied"}), 404

    r   = rows[0]
    now = datetime.datetime.utcnow()
    sep = "=" * 62

    lines = [
        sep,
        "     OnchoLens AI Cancer Scan Report — Patient Copy",
        "     Powered by OnchoLens CNN (MobileNetV2)",
        sep,
        "",
        f"  Report Date  : {now.strftime('%d %B %Y, %H:%M UTC')}",
        f"  Record ID    : {r.get('id', 'N/A')}",
        "",
        "─" * 62,
        "  PREDICTION RESULTS",
        "─" * 62,
        "",
        f"  Result       : {r.get('prediction', '—')}",
        f"  Detected     : {'YES ⚠️' if r.get('detected') else 'NO ✅'}",
        f"  Confidence   : {r.get('confidence', 0)}%",
        f"  Probability  : {round((r.get('probability', 0) or 0) * 100, 2)}%",
        f"  Risk Level   : {r.get('risk_level', '—')}",
        f"  Risk Tier    : {(r.get('risk_tier') or '').upper()}",
        "",
        "─" * 62,
        "  ⚠️  IMPORTANT — PLEASE READ",
        "─" * 62,
        "",
        "  This AI report is a decision-support tool only.",
        "  It must NOT replace a professional medical consultation.",
        "  Please share this report with your doctor for proper",
        "  diagnosis and treatment planning.",
        "",
        sep,
        f"  © {now.year} OnchoLens Healthcare AI Platform",
        sep,
    ]

    return Response(
        "\n".join(lines),
        mimetype="text/plain",
        headers={"Content-Disposition": f"attachment; filename=my_scan_report_{pred_id[:8]}.txt"}
    )
