import os, uuid, datetime, hmac, hashlib
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.utils.jwt_helpers import current_user
from app.utils.db import db_insert, db_select

sub_bp = Blueprint("subscription", __name__)

PLANS = {
    "doctor_basic":   {"name": "Doctor Basic",   "amount": 99900,  "currency": "INR"},
    "doctor_pro":     {"name": "Doctor Pro",      "amount": 249900, "currency": "INR"},
    "patient_basic":  {"name": "Patient Basic",   "amount": 29900,  "currency": "INR"},
    "patient_pro":    {"name": "Patient Pro",     "amount": 79900,  "currency": "INR"},
}


def _razorpay():
    try:
        import razorpay
        client = razorpay.Client(
            auth=(os.getenv("RAZORPAY_KEY_ID"), os.getenv("RAZORPAY_KEY_SECRET"))
        )
        return client
    except Exception:
        return None


@sub_bp.get("/plans")
def list_plans():
    return jsonify(PLANS)


@sub_bp.post("/create")
@jwt_required()
def create_order():
    identity = current_user()
    data     = request.get_json(silent=True) or {}
    plan_id  = data.get("plan_id")

    if plan_id not in PLANS:
        return jsonify({"error": "Invalid plan"}), 400

    plan   = PLANS[plan_id]
    rz     = _razorpay()

    if rz:
        try:
            order = rz.order.create({
                "amount":   plan["amount"],
                "currency": plan["currency"],
                "receipt":  f"rcpt_{uuid.uuid4().hex[:8]}",
            })
            order_id = order["id"]
        except Exception as exc:
            return jsonify({"error": f"Razorpay error: {exc}"}), 502
    else:
        # Mock for development (no Razorpay creds)
        order_id = f"order_mock_{uuid.uuid4().hex[:12]}"

    return jsonify({
        "order_id":  order_id,
        "amount":    plan["amount"],
        "currency":  plan["currency"],
        "plan_name": plan["name"],
        "key_id":    os.getenv("RAZORPAY_KEY_ID", "rzp_test_mock"),
    })


@sub_bp.post("/verify")
@jwt_required()
def verify_payment():
    identity = current_user()
    data     = request.get_json(silent=True) or {}

    order_id   = data.get("razorpay_order_id", "")
    payment_id = data.get("razorpay_payment_id", "")
    signature  = data.get("razorpay_signature", "")
    plan_id    = data.get("plan_id", "")

    secret = os.getenv("RAZORPAY_KEY_SECRET", "")
    if secret:
        generated = hmac.new(
            secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(generated, signature):
            return jsonify({"error": "Payment verification failed"}), 400

    now = datetime.datetime.utcnow()
    record = {
        "id":         str(uuid.uuid4()),
        "user_id":    identity["id"],
        "plan_id":    plan_id,
        "order_id":   order_id,
        "payment_id": payment_id,
        "status":     "active",
        "created_at": now.isoformat(),
        "expires_at": (now + datetime.timedelta(days=30)).isoformat(),
    }
    db_insert("subscriptions", record)
    return jsonify({"message": "Subscription activated", "subscription": record})


@sub_bp.get("/history")
@jwt_required()
def history():
    identity = current_user()
    rows = db_select("subscriptions", {"user_id": identity["id"]})
    return jsonify(rows)
