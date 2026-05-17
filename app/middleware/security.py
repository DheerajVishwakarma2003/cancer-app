"""
middleware/security.py — Request rate limiting, file validation, logging
"""
import time
import logging
import os
from functools import wraps
from flask import request, jsonify, g
from collections import defaultdict

logger = logging.getLogger(__name__)

# ── Simple in-process rate limiter ────────────────────────────────────────
# In production, replace with Redis-backed limiter (Flask-Limiter + Redis)
_request_counts = defaultdict(list)
RATE_LIMIT_WINDOW = 60   # seconds
RATE_LIMIT_MAX    = 100  # requests per window per IP


def rate_limited(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        ip  = request.remote_addr or "unknown"
        now = time.time()
        # Purge old entries
        _request_counts[ip] = [t for t in _request_counts[ip] if now - t < RATE_LIMIT_WINDOW]
        if len(_request_counts[ip]) >= RATE_LIMIT_MAX:
            logger.warning(f"Rate limit hit for IP {ip}")
            return jsonify({"error": "Too many requests. Please slow down."}), 429
        _request_counts[ip].append(now)
        return f(*args, **kwargs)
    return decorated


# ── File validation helper ─────────────────────────────────────────────────
ALLOWED_MIME_TYPES = {
    "image/png", "image/jpeg", "image/webp",
    "image/bmp", "image/tiff",
}
MAX_FILE_SIZE = 16 * 1024 * 1024  # 16 MB


def validate_image_upload(file_storage) -> tuple[bool, str]:
    """
    Returns (is_valid, error_message).
    Validates MIME type by reading magic bytes (not trusting Content-Type header).
    """
    if not file_storage or not file_storage.filename:
        return False, "No file provided"

    # Read magic bytes
    header = file_storage.stream.read(12)
    file_storage.stream.seek(0)

    magic_map = {
        b"\x89PNG":       "image/png",
        b"\xff\xd8\xff":  "image/jpeg",
        b"RIFF":          "image/webp",  # RIFF....WEBP
        b"BM":            "image/bmp",
        b"\x49\x49\x2a": "image/tiff",  # little-endian TIFF
        b"\x4d\x4d\x00": "image/tiff",  # big-endian TIFF
    }

    detected = None
    for magic, mime in magic_map.items():
        if header.startswith(magic):
            detected = mime
            break

    # WebP special check
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        detected = "image/webp"

    if detected not in ALLOWED_MIME_TYPES:
        return False, f"Unsupported file type. Allowed: PNG, JPG, WEBP, BMP, TIFF"

    return True, ""


# ── Request timing logger ──────────────────────────────────────────────────
def log_request_time(app):
    @app.before_request
    def before():
        g.start_time = time.time()

    @app.after_request
    def after(response):
        duration = time.time() - getattr(g, "start_time", time.time())
        logger.debug(f"{request.method} {request.path} → {response.status_code} ({duration*1000:.1f}ms)")
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"]        = "DENY"
        response.headers["X-XSS-Protection"]       = "1; mode=block"
        response.headers["Referrer-Policy"]        = "strict-origin-when-cross-origin"
        return response
