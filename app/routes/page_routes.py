from flask import Blueprint, render_template, send_from_directory
import os

page_bp = Blueprint("pages", __name__)

# ── Public ──────────────────────────────────────────────────────────────────
@page_bp.get("/")
def index(): return render_template("index.html")

@page_bp.get("/login")
def login(): return render_template("login.html")

@page_bp.get("/signup")
def signup(): return render_template("signup.html")

@page_bp.get("/pricing")
def pricing(): return render_template("pricing.html")

@page_bp.get("/billing")
def billing(): return render_template("billing.html")

@page_bp.get("/forgot-password")
def forgot_password(): return render_template("forgot-password.html")

# ── Doctor ───────────────────────────────────────────────────────────────────
@page_bp.get("/doctor/dashboard")
def doctor_dashboard(): return render_template("doctor/dashboard.html")

@page_bp.get("/doctor/predict")
def doctor_predict(): return render_template("doctor/predict.html")

@page_bp.get("/doctor/appointments")
def doctor_appointments(): return render_template("doctor/appointments.html")

@page_bp.get("/doctor/patients")
def doctor_patients(): return render_template("doctor/patients.html")

@page_bp.get("/doctor/prescriptions")
def doctor_prescriptions_page(): return render_template("doctor/prescriptions.html")

@page_bp.get("/doctor/profile")
def doctor_profile(): return render_template("doctor/profile.html")

# ── Patient ───────────────────────────────────────────────────────────────────
@page_bp.get("/patient/dashboard")
def patient_dashboard(): return render_template("patient/dashboard.html")

@page_bp.get("/patient/doctors")
def patient_doctors(): return render_template("patient/doctors.html")

@page_bp.get("/patient/appointments")
def patient_appointments(): return render_template("patient/appointments.html")

@page_bp.get("/patient/prescriptions")
def patient_prescriptions_page(): return render_template("patient/prescriptions.html")

@page_bp.get("/patient/history")
def patient_history(): return render_template("patient/history.html")

@page_bp.get("/patient/profile")
def patient_profile(): return render_template("patient/profile.html")

# ── Admin ─────────────────────────────────────────────────────────────────────
@page_bp.get("/admin/dashboard")
def admin_dashboard(): return render_template("admin/dashboard.html")

@page_bp.get("/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(os.path.join(os.getcwd(), "uploads"), filename)

@page_bp.get("/setup-admin")
def setup_admin_page():
    return render_template("setup-admin.html")
