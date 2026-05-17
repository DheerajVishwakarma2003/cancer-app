# 🔬 OnchoLens — AI-Powered Cancer Detection SaaS Platform

> **Production-grade Flask + Supabase + Razorpay + TensorFlow healthcare SaaS**

---

## 🏗 Architecture Overview

```
OnchoLens
├── Flask (Blueprint REST API)
├── Supabase (PostgreSQL + Auth + Storage)
├── OnchoLens CNN (MobileNetV2 cancer classifier)
├── Razorpay (subscription payments)
└── Vanilla JS / CSS frontend (dark/light mode)
```

### User Roles
| Role    | Capabilities |
|---------|-------------|
| **Admin**   | Manage users, approve doctors, view analytics |
| **Doctor**  | AI cancer prediction, patient management, appointments |
| **Patient** | Book appointments, view prescriptions, medical history |

---

## 🚀 Quick Start

### 1. Clone & setup
```bash
git clone <repo>
cd major-project
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your Supabase URL, keys, and Razorpay credentials
```

### 3. Set up Supabase
- Create a new project at https://supabase.com
- Run `supabase_schema.sql` in the SQL Editor
- Copy your `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` into `.env`

### 4. Run development server
```bash
python run.py
```
Open http://localhost:5000

---

## 🤖 AI Model

**Model**: `app/ai/cancer_model.keras`  
**Architecture**: MobileNetV2-based CNN (`oncolens_cnn`)  
**Input**: 224 × 224 × 3 RGB image  
**Output**: Sigmoid scalar → P(cancer)  

| Sigmoid Output | Interpretation | Risk Tier |
|---------------|---------------|-----------|
| 0.00 – 0.29   | Benign        | Benign    |
| 0.30 – 0.49   | Low concern   | Low Risk  |
| 0.50 – 0.79   | Suspicious    | Moderate  |
| 0.80 – 1.00   | High concern  | High Risk |

### Accepted formats
PNG, JPG/JPEG, WEBP, BMP, TIFF — max **16 MB**

---

## 🗄 API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register doctor or patient |
| `POST` | `/api/auth/login`    | Login, returns JWT |
| `GET`  | `/api/auth/me`       | Current user info |
| `POST` | `/api/auth/reset-password` | Update password |

### Doctor
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/doctors` | List approved doctors |
| `POST` | `/api/doctors/predict-cancer` | **Run AI prediction** (multipart) |
| `GET`  | `/api/doctors/predict-history` | Prediction history |
| `GET`  | `/api/doctors/predict-report/<id>` | Download report |
| `GET/PUT` | `/api/doctors/profile` | Get/update doctor profile |
| `GET`  | `/api/doctors/appointments` | View appointments |
| `PUT`  | `/api/doctors/appointments/<id>` | Update appointment status |

### Patient
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET/PUT` | `/api/patients/profile` | Get/update patient profile |
| `POST` | `/api/patients/appointments` | Book appointment |
| `GET`  | `/api/patients/appointments` | My appointments |
| `GET`  | `/api/patients/prescriptions` | My prescriptions |
| `GET`  | `/api/patients/predictions` | AI scans I appear in |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/admin/users` | All users |
| `GET`  | `/api/admin/stats` | Platform statistics |
| `PUT`  | `/api/admin/doctors/<id>/approve` | Approve doctor |
| `PUT`  | `/api/admin/users/<id>/suspend`   | Suspend user |

### Subscriptions
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/subscription/plans` | List all plans |
| `POST` | `/api/subscription/create` | Create Razorpay order |
| `POST` | `/api/subscription/verify` | Verify payment + activate |
| `GET`  | `/api/subscription/history` | Billing history |

---

## 💳 Razorpay Plans

| Plan ID | Target | Amount (INR) |
|---------|--------|-------------|
| `doctor_basic`  | Doctors  | ₹999/mo  |
| `doctor_pro`    | Doctors  | ₹2,499/mo |
| `patient_basic` | Patients | ₹299/mo  |
| `patient_pro`   | Patients | ₹799/mo  |

---

## 🐳 Docker Deployment

```bash
# Build and run
docker-compose up --build

# Production (with Nginx)
docker-compose -f docker-compose.prod.yml up -d
```

---

## 🧪 Running Tests

```bash
pip install pytest
python -m pytest tests/ -v
```

Test coverage includes:
- ✅ Auth (register, login, validation, duplicates)
- ✅ AI prediction (valid/invalid input, positive/negative results)
- ✅ Predict service unit tests (preprocess, risk labels, output schema)
- ✅ Doctor/Patient API endpoints
- ✅ Subscription flow (plan listing, order creation)
- ✅ Admin access control (role enforcement)
- ✅ Page route rendering
- ✅ Report generation service

---

## 📁 Project Structure

```
major-project/
├── app/
│   ├── __init__.py              # App factory
│   ├── ai/
│   │   ├── cancer_model.keras   # OnchoLens CNN model
│   │   └── predict_service.py   # Inference engine
│   ├── routes/
│   │   ├── auth_routes.py
│   │   ├── doctor_routes.py     # Includes /predict-cancer
│   │   ├── patient_routes.py
│   │   ├── admin_routes.py
│   │   ├── subscription_routes.py
│   │   └── page_routes.py
│   ├── services/
│   │   ├── report_service.py    # Clinical report generator
│   │   └── notification_service.py
│   ├── middleware/
│   │   └── security.py          # Rate limiting, headers, validation
│   ├── utils/
│   │   └── db.py                # Supabase CRUD helpers
│   └── templates/
│       ├── index.html           # Landing page
│       ├── login.html
│       ├── signup.html
│       ├── pricing.html
│       ├── billing.html
│       ├── doctor/
│       │   ├── dashboard.html
│       │   └── predict.html     # AI prediction UI
│       ├── patient/
│       │   ├── dashboard.html
│       │   └── doctors.html
│       └── admin/
│           └── dashboard.html
├── static/
│   ├── css/
│   │   ├── themes.css           # Design system + dark/light mode
│   │   ├── home.css
│   │   ├── login.css
│   │   ├── predict.css          # Prediction page styles
│   │   ├── pricing.css
│   │   ├── billing.css
│   │   ├── doctors.css
│   │   └── admin-dashboard.css
│   └── js/
│       ├── theme.js             # Dark/light mode + Auth helpers + Toast
│       ├── predict.js           # AI prediction UI logic
│       ├── doctor-dashboard.js
│       ├── admin-dashboard.js
│       ├── pricing.js           # Razorpay checkout
│       ├── billing.js
│       └── doctors.js
├── tests/
│   └── test_api.py              # Full test suite (40+ tests)
├── uploads/                     # Medical scan storage
├── config.py
├── run.py
├── requirements.txt
├── supabase_schema.sql          # DB schema + RLS policies
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## 🔐 Security

- **JWT** authentication on all protected endpoints
- **Role-based access control** (admin / doctor / patient enforced server-side)
- **Magic-byte file validation** (not trusting Content-Type headers)
- **Supabase Row-Level Security** on all tables
- **Security headers** on every response (X-Frame-Options, XSS protection, etc.)
- **Rate limiting** middleware (100 req/min per IP, Redis-ready)
- **Password hashing** with Werkzeug PBKDF2
- Never expose `password_hash` in API responses

---

## ⚠️ Clinical Disclaimer

OnchoLens AI predictions are **decision-support tools only**. They must always be reviewed and validated by a qualified medical professional. This platform does not constitute a medical diagnostic device.
