import os, io, uuid, datetime, logging
from flask import Blueprint, request, jsonify, current_app, Response
from flask_jwt_extended import jwt_required
from werkzeug.utils import secure_filename
from app.ai.predict_service import predict
from app.utils.db import db_insert, db_select, db_update
from app.utils.jwt_helpers import current_user
from app.services.report_service import generate_prediction_report

doctor_bp = Blueprint("doctors", __name__)
logger    = logging.getLogger(__name__)
ALLOWED   = {"png","jpg","jpeg","webp","bmp","tiff"}


def _allowed(fn):
    return "." in fn and fn.rsplit(".", 1)[1].lower() in ALLOWED


def _require_doctor():
    identity = current_user()
    if identity.get("role") not in ("doctor", "admin"):
        return None, (jsonify({"error": "Doctor access required"}), 403)
    return identity, None


# ── List approved doctors (public) ───────────────────────────────────────────
@doctor_bp.get("")
def list_doctors():
    """
    Returns approved doctors. In development with no DB configured,
    returns sample seed data so the Find Doctors page works.
    """
    rows = db_select("doctors", {"is_approved": True})

    # If nothing in DB (dev / no Supabase), return seed data so the page works
    if not rows:
        rows = _seed_doctors()

    # Enrich each doctor with clean fields
    enriched = []
    for d in rows:
        enriched.append({
            "id":             d.get("id", str(uuid.uuid4())),
            "user_id":        d.get("user_id", d.get("id", "")),
            "name":           d.get("name", ""),
            "email":          d.get("email", ""),
            "specialization": d.get("specialization", "General Physician"),
            "bio":            d.get("bio", ""),
            "experience":     d.get("experience", 0),
            "fee":            d.get("fee", 0),
            "languages":      d.get("languages", ""),
            "address":        d.get("address", ""),
            "is_approved":    True,
        })
    return jsonify(enriched)


def _seed_doctors():
    """Sample doctors for development / demo when no DB is connected."""
    return [
        {
            "id": "seed-001", "user_id": "seed-001",
            "name": "Priya Sharma", "specialization": "Oncology",
            "bio": "Specialist in cancer diagnostics with 12 years of experience in clinical oncology.",
            "experience": 12, "fee": 800, "languages": "English, Hindi",
            "is_approved": True,
        },
        {
            "id": "seed-002", "user_id": "seed-002",
            "name": "Rajesh Kumar", "specialization": "Radiology",
            "bio": "Expert radiologist specialising in CT and MRI scan interpretation.",
            "experience": 9, "fee": 600, "languages": "English, Tamil",
            "is_approved": True,
        },
        {
            "id": "seed-003", "user_id": "seed-003",
            "name": "Aisha Patel", "specialization": "General Physician",
            "bio": "Experienced general physician providing holistic primary care.",
            "experience": 7, "fee": 400, "languages": "English, Gujarati, Hindi",
            "is_approved": True,
        },
        {
            "id": "seed-004", "user_id": "seed-004",
            "name": "Vikram Nair", "specialization": "Pathology",
            "bio": "Certified pathologist with expertise in biopsy analysis and histopathology.",
            "experience": 15, "fee": 700, "languages": "English, Malayalam",
            "is_approved": True,
        },
        {
            "id": "seed-005", "user_id": "seed-005",
            "name": "Meena Joshi", "specialization": "Oncology",
            "bio": "Dedicated oncologist focused on early detection and patient-centred care.",
            "experience": 10, "fee": 900, "languages": "English, Marathi, Hindi",
            "is_approved": True,
        },
        {
            "id": "seed-006", "user_id": "seed-006",
            "name": "Suresh Reddy", "specialization": "Dermatology",
            "bio": "Dermatologist skilled in skin cancer screening and diagnosis.",
            "experience": 8, "fee": 500, "languages": "English, Telugu",
            "is_approved": True,
        },
    ]


# ── Doctor profile ────────────────────────────────────────────────────────────
@doctor_bp.get("/profile")
@jwt_required()
def get_profile():
    identity, err = _require_doctor()
    if err: return err
    rows = db_select("doctors", {"user_id": identity["id"]})
    return jsonify(rows[0] if rows else {})


@doctor_bp.put("/profile")
@jwt_required()
def update_profile():
    identity, err = _require_doctor()
    if err: return err
    data = request.get_json(silent=True) or {}
    safe = {k: v for k, v in data.items() if k in (
        "name", "phone", "specialization", "bio", "address",
        "experience", "fee", "languages", "schedule"
    )}
    db_update("doctors", {"user_id": identity["id"]}, safe)
    if "name" in safe:
        db_update("users", {"id": identity["id"]}, {"name": safe["name"]})
    return jsonify({"message": "Profile updated"})


# ── Patients (from doctor's appointments) ─────────────────────────────────────
@doctor_bp.get("/patients")
@jwt_required()
def get_patients():
    identity, err = _require_doctor()
    if err: return err
    # First try patients linked via appointments
    apts = db_select("appointments", {"doctor_id": identity["id"]})
    patient_ids = list({a["patient_id"] for a in apts if a.get("patient_id")})
    patients = []
    for pid in patient_ids:
        rows = db_select("patients", {"user_id": pid})
        if rows:
            patients.append(rows[0])
    # Fallback: return ALL patients so dropdown is never empty
    if not patients:
        patients = db_select("patients") or []
    return jsonify(patients)


# ── AI Cancer Prediction ──────────────────────────────────────────────────────
@doctor_bp.post("/predict-cancer")
@jwt_required()
def predict_cancer():
    identity, err = _require_doctor()
    if err: return err

    if "image" not in request.files:
        return jsonify({"error": "No image file provided"}), 400
    file = request.files["image"]
    if not file or not file.filename:
        return jsonify({"error": "Empty file"}), 400
    if not _allowed(file.filename):
        return jsonify({"error": "Unsupported file type"}), 415

    image_bytes = file.read()
    if len(image_bytes) > current_app.config["MAX_CONTENT_LENGTH"]:
        return jsonify({"error": "File too large (max 16 MB)"}), 413

    try:
        result = predict(image_bytes)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception:
        logger.exception("Prediction failed")
        return jsonify({"error": "Prediction service error"}), 500

    filename  = secure_filename(f"{uuid.uuid4()}_{file.filename}")
    save_path = os.path.join(current_app.config["UPLOAD_FOLDER"], filename)
    try:
        with open(save_path, "wb") as f:
            f.write(image_bytes)
        image_url = f"/uploads/{filename}"
    except Exception:
        image_url = None

    patient_id   = request.form.get("patient_id")
    patient_name = request.form.get("patient_name", "")
    # Auto-lookup patient name if not provided
    if patient_id and not patient_name:
        p_rows = db_select("patients", {"user_id": patient_id})
        if p_rows:
            patient_name = p_rows[0].get("name", "")
    record = {
        "id":           str(uuid.uuid4()),
        "doctor_id":    identity["id"],
        "patient_id":   patient_id,
        "patient_name": patient_name,
        "image_url":    image_url,
        "prediction":   result["prediction"],
        "confidence":   result["confidence"],
        "probability":  result["probability"],
        "risk_level":   result["risk_level"],
        "risk_tier":    result["risk_tier"],
        "detected":     result["detected"],
        "created_at":   datetime.datetime.utcnow().isoformat(),
    }
    try:
        db_insert("ai_predictions", record)
    except Exception:
        logger.warning("Could not persist prediction")

    return jsonify({**result, "record_id": record["id"], "image_url": image_url})


@doctor_bp.get("/predict-history")
@jwt_required()
def prediction_history():
    identity, err = _require_doctor()
    if err: return err
    return jsonify(db_select("ai_predictions", {"doctor_id": identity["id"]}))


@doctor_bp.get("/predict-report/<record_id>")
@jwt_required()
def download_report(record_id):
    identity, err = _require_doctor()
    if err: return err
    rows = db_select("ai_predictions", {"id": record_id, "doctor_id": identity["id"]})
    if not rows:
        return jsonify({"error": "Record not found"}), 404
    text = generate_prediction_report(rows[0], f"Doctor ({identity['id'][:8]})")
    return Response(text, mimetype="text/plain",
        headers={"Content-Disposition": f"attachment; filename=oncolens_report_{record_id[:8]}.txt"})


# ── Appointments ──────────────────────────────────────────────────────────────
@doctor_bp.get("/appointments")
@jwt_required()
def get_appointments():
    identity, err = _require_doctor()
    if err: return err
    rows = db_select("appointments", {"doctor_id": identity["id"]})
    for a in rows:
        if a.get("patient_id") and not a.get("patient_name"):
            p = db_select("patients", {"user_id": a["patient_id"]})
            a["patient_name"] = p[0]["name"] if p else None
    return jsonify(rows)


@doctor_bp.put("/appointments/<apt_id>")
@jwt_required()
def update_appointment(apt_id):
    identity, err = _require_doctor()
    if err: return err
    data   = request.get_json(silent=True) or {}
    status = data.get("status")
    notes  = data.get("notes", "")
    if status not in ("confirmed", "cancelled", "completed"):
        return jsonify({"error": "Invalid status"}), 400
    update_data = {"status": status}
    if notes:
        update_data["notes"] = notes
    db_update("appointments", {"id": apt_id, "doctor_id": identity["id"]}, update_data)
    return jsonify({"message": "Appointment updated"})


# ── Prescriptions ──────────────────────────────────────────────────────────────
@doctor_bp.get("/prescriptions")
@jwt_required()
def get_prescriptions():
    identity, err = _require_doctor()
    if err: return err
    rows = db_select("prescriptions", {"doctor_id": identity["id"]})
    for rx in rows:
        if rx.get("patient_id") and not rx.get("patient_name"):
            p = db_select("patients", {"user_id": rx["patient_id"]})
            rx["patient_name"] = p[0]["name"] if p else None
    return jsonify(rows)


@doctor_bp.post("/prescriptions")
@jwt_required()
def create_prescription():
    identity, err = _require_doctor()
    if err: return err
    data       = request.get_json(silent=True) or {}
    patient_id = data.get("patient_id", "").strip()
    if not patient_id:
        return jsonify({"error": "patient_id required"}), 400

    record = {
        "id":             str(uuid.uuid4()),
        "doctor_id":      identity["id"],
        "patient_id":     patient_id,
        "appointment_id": data.get("appointment_id"),
        "medications":    data.get("medications", []),
        "notes":          data.get("notes", ""),
        "created_at":     datetime.datetime.utcnow().isoformat(),
    }
    db_insert("prescriptions", record)
    return jsonify({"message": "Prescription saved", "id": record["id"]}), 201


@doctor_bp.get("/prescriptions/<rx_id>/download")
@jwt_required()
def download_prescription(rx_id):
    identity, err = _require_doctor()
    if err: return err
    rows = db_select("prescriptions", {"id": rx_id, "doctor_id": identity["id"]})
    if not rows:
        return jsonify({"error": "Not found"}), 404
    rx   = rows[0]
    meds = rx.get("medications", [])
    lines = [
        "OnchoLens Prescription", "=" * 50,
        f"Date      : {datetime.datetime.utcnow().strftime('%Y-%m-%d')}",
        f"Patient   : {rx.get('patient_name', rx.get('patient_id', '—'))}",
        f"Doctor ID : {identity['id'][:8]}",
        "", "MEDICATIONS", "-" * 50,
    ]
    for m in meds:
        lines.append(f"• {m.get('name','—')}  {m.get('dosage','')}  {m.get('frequency','')}  {m.get('duration','')}")
    if rx.get("notes"):
        lines += ["", "NOTES", "-" * 50, rx["notes"]]
    lines += ["", "=" * 50, "OnchoLens Healthcare AI Platform"]
    return Response("\n".join(lines), mimetype="text/plain",
        headers={"Content-Disposition": f"attachment; filename=prescription_{rx_id[:8]}.txt"})


# ── Doctor prescription download (token via query param supported) ─────────────
@doctor_bp.get("/prescriptions/<rx_id>/download-file")
def download_prescription_file(rx_id):
    """
    Supports ?token=<jwt> for window.open() browser downloads.
    """
    token = request.args.get("token")
    if token:
        try:
            from flask_jwt_extended import decode_token
            import json as _json
            decoded  = decode_token(token)
            raw      = decoded.get("sub", "{}")
            try:    identity = _json.loads(raw)
            except: identity = {"id": raw, "role": "doctor"}
        except Exception:
            return jsonify({"error": "Invalid or expired token"}), 401
    else:
        from flask_jwt_extended import verify_jwt_in_request
        try:
            verify_jwt_in_request()
            identity = current_user()
        except Exception:
            return jsonify({"error": "Missing token"}), 401

    if identity.get("role") not in ("doctor", "admin"):
        return jsonify({"error": "Doctor access required"}), 403

    rows = db_select("prescriptions", {"id": rx_id, "doctor_id": identity["id"]})
    if not rows:
        return jsonify({"error": "Not found"}), 404

    rx   = rows[0]
    meds = rx.get("medications", [])
    lines = [
        "=" * 60,
        "         OnchoLens — Doctor Prescription Copy",
        "=" * 60,
        f"  Date      : {datetime.datetime.utcnow().strftime('%d %B %Y')}",
        f"  Patient   : {rx.get('patient_name', rx.get('patient_id', '—'))}",
        f"  Doctor ID : {identity['id'][:8]}",
        "",
        "  MEDICATIONS", "  " + "-" * 56,
    ]
    for i, m in enumerate(meds, 1):
        lines.append(f"  {i}. {m.get('name','—')}")
        if m.get("dosage"):    lines.append(f"     Dosage    : {m['dosage']}")
        if m.get("frequency"): lines.append(f"     Frequency : {m['frequency']}")
        if m.get("duration"):  lines.append(f"     Duration  : {m['duration']}")
        lines.append("")
    if rx.get("notes"):
        lines += ["  NOTES", "  " + "-" * 56, f"  {rx['notes']}", ""]
    lines += ["=" * 60, "  OnchoLens Healthcare AI Platform", "=" * 60]

    return Response("\n".join(lines), mimetype="text/plain",
        headers={"Content-Disposition": f"attachment; filename=prescription_{rx_id[:8]}.txt"})
