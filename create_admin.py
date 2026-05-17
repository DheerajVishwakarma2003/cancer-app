"""
create_admin.py — Run once to create the admin account
Usage:  python create_admin.py
        python create_admin.py --email admin@mysite.com --password MyPass@99
"""
import sys
import uuid
import argparse
import datetime

# Make sure project root is on path
import os
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from werkzeug.security import generate_password_hash


def create_admin(email: str, password: str, name: str):
    from app.utils.db import db_select, db_insert

    # Check if already exists
    existing = db_select("users", {"email": email})
    if existing:
        # If exists but not admin, upgrade role
        if existing[0].get("role") != "admin":
            from app.utils.db import db_update
            db_update("users", {"email": email}, {"role": "admin", "is_verified": True})
            print(f"✅ Existing user '{email}' upgraded to admin role.")
        else:
            print(f"ℹ️  Admin account '{email}' already exists.")
        return

    user_id = str(uuid.uuid4())
    record  = {
        "id":            user_id,
        "email":         email,
        "password_hash": generate_password_hash(password),
        "role":          "admin",
        "name":          name,
        "is_active":     True,
        "is_verified":   True,
        "created_at":    datetime.datetime.utcnow().isoformat(),
    }

    db_insert("users", record)
    print(f"✅ Admin account created!")
    print(f"   Email    : {email}")
    print(f"   Password : {password}")
    print(f"   User ID  : {user_id}")
    print(f"\n   Login at : http://localhost:5000/login")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create OnchoLens admin account")
    parser.add_argument("--email",    default="admin@oncolens.com", help="Admin email")
    parser.add_argument("--password", default="Admin@123",          help="Admin password")
    parser.add_argument("--name",     default="Super Admin",        help="Admin display name")
    args = parser.parse_args()

    if len(args.password) < 8:
        print("❌ Password must be at least 8 characters.")
        sys.exit(1)

    create_admin(args.email, args.password, args.name)
