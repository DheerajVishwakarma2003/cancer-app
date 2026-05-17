"""
tests/test_api.py — OnchoLens API Test Suite
Run: python -m pytest tests/ -v
"""
import io
import os
import sys
import json
import pytest
import numpy as np
from PIL import Image
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

os.environ.setdefault("FLASK_ENV",        "development")
os.environ.setdefault("FLASK_SECRET_KEY", "test-secret")
os.environ.setdefault("JWT_SECRET_KEY",   "test-jwt-secret")


def make_png_bytes(width=224, height=224) -> bytes:
    arr = (np.random.rand(height, width, 3) * 255).astype(np.uint8)
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def app():
    from app import create_app
    application = create_app("development")
    application.config["TESTING"] = True
    yield application


@pytest.fixture
def client(app):
    return app.test_client()


def _register(client, email, role):
    with patch("app.routes.auth_routes.db_select", return_value=[]), \
         patch("app.routes.auth_routes.db_insert", return_value={}):
        res = client.post("/api/auth/register", json={
            "name": "Test User", "email": email,
            "password": "testpass123", "role": role,
        })
    return res.get_json().get("token", "")


@pytest.fixture
def doctor_token(client):
    return _register(client, "doc@test.com", "doctor")


@pytest.fixture
def patient_token(client):
    return _register(client, "pat@test.com", "patient")


# ── Auth Tests ────────────────────────────────────────────────────────────────

class TestAuth:
    def test_register_doctor(self, client):
        with patch("app.routes.auth_routes.db_select", return_value=[]), \
             patch("app.routes.auth_routes.db_insert", return_value={}):
            res = client.post("/api/auth/register", json={
                "name": "Dr Smith", "email": "smith@test.com",
                "password": "securepass1", "role": "doctor",
            })
        assert res.status_code == 201
        data = res.get_json()
        assert "token" in data
        assert data["role"] == "doctor"

    def test_register_patient(self, client):
        with patch("app.routes.auth_routes.db_select", return_value=[]), \
             patch("app.routes.auth_routes.db_insert", return_value={}):
            res = client.post("/api/auth/register", json={
                "name": "Jane", "email": "jane@test.com",
                "password": "securepass1", "role": "patient",
            })
        assert res.status_code == 201

    def test_register_invalid_email(self, client):
        res = client.post("/api/auth/register", json={
            "email": "not-an-email", "password": "pass1234", "role": "patient",
        })
        assert res.status_code == 400

    def test_register_short_password(self, client):
        res = client.post("/api/auth/register", json={
            "email": "x@test.com", "password": "abc", "role": "patient",
        })
        assert res.status_code == 400

    def test_register_invalid_role(self, client):
        with patch("app.routes.auth_routes.db_select", return_value=[]):
            res = client.post("/api/auth/register", json={
                "email": "x@test.com", "password": "pass1234", "role": "superadmin",
            })
        assert res.status_code == 400

    def test_register_duplicate_email(self, client):
        existing = [{"id": "123", "email": "dup@test.com"}]
        with patch("app.routes.auth_routes.db_select", return_value=existing):
            res = client.post("/api/auth/register", json={
                "email": "dup@test.com", "password": "pass1234", "role": "patient",
            })
        assert res.status_code == 409

    def test_login_wrong_password(self, client):
        from werkzeug.security import generate_password_hash
        user_row = [{
            "id": "u1", "email": "u@test.com",
            "password_hash": generate_password_hash("correct_pass"),
            "role": "patient", "is_active": True,
        }]
        with patch("app.routes.auth_routes.db_select", return_value=user_row):
            res = client.post("/api/auth/login", json={
                "email": "u@test.com", "password": "wrong_pass",
            })
        assert res.status_code == 401

    def test_login_success(self, client):
        from werkzeug.security import generate_password_hash
        user_row = [{
            "id": "u1", "email": "u@test.com",
            "password_hash": generate_password_hash("mypassword"),
            "role": "doctor", "is_active": True, "name": "Test",
        }]
        with patch("app.routes.auth_routes.db_select", return_value=user_row):
            res = client.post("/api/auth/login", json={
                "email": "u@test.com", "password": "mypassword",
            })
        assert res.status_code == 200
        assert "token" in res.get_json()

    def test_login_suspended(self, client):
        from werkzeug.security import generate_password_hash
        user_row = [{
            "id": "u1", "email": "u@test.com",
            "password_hash": generate_password_hash("mypassword"),
            "role": "patient", "is_active": False,
        }]
        with patch("app.routes.auth_routes.db_select", return_value=user_row):
            res = client.post("/api/auth/login", json={
                "email": "u@test.com", "password": "mypassword",
            })
        assert res.status_code == 403


# ── AI Prediction Tests ───────────────────────────────────────────────────────

class TestAIPrediction:
    def test_predict_no_image(self, client, doctor_token):
        res = client.post("/api/doctors/predict-cancer",
                          headers={"Authorization": f"Bearer {doctor_token}"})
        assert res.status_code == 400

    def test_predict_requires_auth(self, client):
        data = {"image": (io.BytesIO(make_png_bytes()), "scan.png")}
        res = client.post("/api/doctors/predict-cancer", data=data,
                          content_type="multipart/form-data")
        assert res.status_code == 401

    def test_predict_patient_forbidden(self, client, patient_token):
        data = {"image": (io.BytesIO(make_png_bytes()), "scan.png")}
        res = client.post(
            "/api/doctors/predict-cancer",
            headers={"Authorization": f"Bearer {patient_token}"},
            data=data, content_type="multipart/form-data",
        )
        assert res.status_code == 403

    def test_predict_valid_positive(self, client, doctor_token):
        mock_model = MagicMock()
        mock_model.predict.return_value = np.array([[0.92]])
        with patch("app.ai.predict_service._get_model", return_value=mock_model), \
             patch("app.routes.doctor_routes.db_insert", return_value={}):
            data = {"image": (io.BytesIO(make_png_bytes()), "scan.png")}
            res = client.post(
                "/api/doctors/predict-cancer",
                headers={"Authorization": f"Bearer {doctor_token}"},
                data=data, content_type="multipart/form-data",
            )
        assert res.status_code == 200
        body = res.get_json()
        assert body["detected"] is True
        assert body["prediction"] == "Cancer Detected"
        assert body["confidence"] > 50
        assert "risk_level" in body

    def test_predict_valid_negative(self, client, doctor_token):
        mock_model = MagicMock()
        mock_model.predict.return_value = np.array([[0.08]])
        with patch("app.ai.predict_service._get_model", return_value=mock_model), \
             patch("app.routes.doctor_routes.db_insert", return_value={}):
            data = {"image": (io.BytesIO(make_png_bytes()), "scan.png")}
            res = client.post(
                "/api/doctors/predict-cancer",
                headers={"Authorization": f"Bearer {doctor_token}"},
                data=data, content_type="multipart/form-data",
            )
        assert res.status_code == 200
        body = res.get_json()
        assert body["detected"] is False
        assert body["prediction"] == "No Cancer Detected"


# ── Predict Service Unit Tests ────────────────────────────────────────────────

class TestPredictService:
    def test_preprocess_shape(self):
        from app.ai.predict_service import preprocess_image
        arr = preprocess_image(make_png_bytes())
        assert arr.shape == (1, 224, 224, 3)
        assert arr.dtype == np.float32

    def test_preprocess_normalised(self):
        from app.ai.predict_service import preprocess_image
        arr = preprocess_image(make_png_bytes())
        assert arr.min() >= 0.0
        assert arr.max() <= 1.0

    def test_preprocess_invalid(self):
        from app.ai.predict_service import preprocess_image
        with pytest.raises(ValueError):
            preprocess_image(b"not an image")

    def test_risk_high(self):
        from app.ai.predict_service import _risk_label
        assert _risk_label(0.92)["tier"] == "high"

    def test_risk_moderate(self):
        from app.ai.predict_service import _risk_label
        assert _risk_label(0.65)["tier"] == "moderate"

    def test_risk_low(self):
        from app.ai.predict_service import _risk_label
        assert _risk_label(0.35)["tier"] == "low"

    def test_risk_benign(self):
        from app.ai.predict_service import _risk_label
        assert _risk_label(0.10)["tier"] == "benign"

    def test_predict_keys(self):
        from app.ai.predict_service import predict
        mock_model = MagicMock()
        mock_model.predict.return_value = np.array([[0.75]])
        with patch("app.ai.predict_service._get_model", return_value=mock_model):
            result = predict(make_png_bytes())
        required = {"prediction", "confidence", "probability", "risk_level", "risk_tier", "detected"}
        assert required.issubset(result.keys())
        assert 0 <= result["confidence"] <= 100
        assert 0 <= result["probability"] <= 1


# ── Doctor API Tests ──────────────────────────────────────────────────────────

class TestDoctorAPI:
    def test_list_doctors_public(self, client):
        with patch("app.routes.doctor_routes.db_select", return_value=[]):
            res = client.get("/api/doctors")
        assert res.status_code == 200
        assert isinstance(res.get_json(), list)

    def test_predict_history_requires_auth(self, client):
        res = client.get("/api/doctors/predict-history")
        assert res.status_code == 401

    def test_predict_history_returns_list(self, client, doctor_token):
        with patch("app.routes.doctor_routes.db_select", return_value=[]):
            res = client.get("/api/doctors/predict-history",
                             headers={"Authorization": f"Bearer {doctor_token}"})
        assert res.status_code == 200
        assert isinstance(res.get_json(), list)

    def test_profile_requires_auth(self, client):
        res = client.get("/api/doctors/profile")
        assert res.status_code == 401

    def test_update_profile(self, client, doctor_token):
        with patch("app.routes.doctor_routes.db_update", return_value={}):
            with patch("app.routes.doctor_routes.db_select", return_value=[{}]):
                res = client.put("/api/doctors/profile",
                                 headers={"Authorization": f"Bearer {doctor_token}"},
                                 json={"name": "Dr Updated", "specialization": "Oncology"})
        assert res.status_code == 200


# ── Patient API Tests ─────────────────────────────────────────────────────────

class TestPatientAPI:
    def test_book_missing_fields(self, client, patient_token):
        res = client.post("/api/patients/appointments",
                          headers={"Authorization": f"Bearer {patient_token}"},
                          json={"reason": "Check-up"})
        assert res.status_code == 400

    def test_book_success(self, client, patient_token):
        with patch("app.routes.patient_routes.db_insert", return_value={}):
            res = client.post("/api/patients/appointments",
                              headers={"Authorization": f"Bearer {patient_token}"},
                              json={"doctor_id": "doc-123",
                                    "slot": "2026-06-01T10:00:00",
                                    "reason": "Check"})
        assert res.status_code == 201

    def test_prescriptions_list(self, client, patient_token):
        with patch("app.routes.patient_routes.db_select", return_value=[]):
            res = client.get("/api/patients/prescriptions",
                             headers={"Authorization": f"Bearer {patient_token}"})
        assert res.status_code == 200


# ── Subscription Tests ────────────────────────────────────────────────────────

class TestSubscription:
    def test_plans_public(self, client):
        res = client.get("/api/subscription/plans")
        assert res.status_code == 200
        plans = res.get_json()
        assert "doctor_basic" in plans
        assert "patient_pro"  in plans

    def test_invalid_plan(self, client, doctor_token):
        res = client.post("/api/subscription/create",
                          headers={"Authorization": f"Bearer {doctor_token}"},
                          json={"plan_id": "invalid"})
        assert res.status_code == 400

    def test_create_order(self, client, doctor_token):
        res = client.post("/api/subscription/create",
                          headers={"Authorization": f"Bearer {doctor_token}"},
                          json={"plan_id": "doctor_basic"})
        assert res.status_code == 200
        data = res.get_json()
        assert "order_id" in data
        assert "amount"   in data

    def test_history_requires_auth(self, client):
        res = client.get("/api/subscription/history")
        assert res.status_code == 401


# ── Admin Tests ───────────────────────────────────────────────────────────────

class TestAdminAPI:
    def test_stats_requires_admin(self, client, doctor_token):
        with patch("app.routes.admin_routes.db_select", return_value=[]):
            res = client.get("/api/admin/stats",
                             headers={"Authorization": f"Bearer {doctor_token}"})
        assert res.status_code == 403

    def test_stats_requires_auth(self, client):
        res = client.get("/api/admin/stats")
        assert res.status_code == 401


# ── Page Routes ───────────────────────────────────────────────────────────────

class TestPageRoutes:
    def test_home(self, client):
        res = client.get("/")
        assert res.status_code == 200
        assert b"OnchoLens" in res.data

    def test_login(self, client):
        res = client.get("/login")
        assert res.status_code == 200

    def test_signup(self, client):
        res = client.get("/signup")
        assert res.status_code == 200

    def test_pricing(self, client):
        res = client.get("/pricing")
        assert res.status_code == 200

    def test_predict_page(self, client):
        res = client.get("/doctor/predict")
        assert res.status_code == 200


# ── Report Service ────────────────────────────────────────────────────────────

class TestReportService:
    def test_report_fields(self):
        from app.services.report_service import generate_prediction_report
        data = {
            "record_id":   "abc123",
            "prediction":  "Cancer Detected",
            "confidence":  94.5,
            "probability": 0.945,
            "risk_level":  "High Risk",
            "risk_tier":   "high",
            "detected":    True,
        }
        report = generate_prediction_report(data, "Dr. Smith", "John Doe")
        assert "OnchoLens"       in report
        assert "Cancer Detected" in report
        assert "94.5"            in report
        assert "DISCLAIMER"      in report

    def test_report_is_string(self):
        from app.services.report_service import generate_prediction_report
        result = generate_prediction_report({}, "Dr. X", "Patient Y")
        assert isinstance(result, str)
        assert len(result) > 200
