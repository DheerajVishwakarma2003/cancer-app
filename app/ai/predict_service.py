"""
OnchoLens AI Prediction Service
Model: oncolens_cnn (MobileNetV2-based binary classifier)
Input : 224x224x3 float32
Output: sigmoid scalar → 0 = No Cancer, 1 = Cancer Detected
"""
import os
import io
import logging
import numpy as np
from PIL import Image, UnidentifiedImageError

logger = logging.getLogger(__name__)

# Lazy-load the model once at first prediction
_model = None
_model_path = None


def _get_model():
    global _model, _model_path
    if _model is not None:
        return _model

    import tensorflow as tf

    path = os.environ.get("MODEL_PATH", "app/ai/cancer_model.keras")
    if not os.path.isabs(path):
        path = os.path.join(os.getcwd(), path)

    if not os.path.exists(path):
        raise FileNotFoundError(f"Model not found at {path}")

    logger.info(f"Loading OnchoLens model from {path} …")
    _model = tf.keras.models.load_model(path)
    _model_path = path
    logger.info("Model loaded successfully.")
    return _model


def preprocess_image(image_bytes: bytes) -> np.ndarray:
    """
    Decode raw image bytes → (1, 224, 224, 3) float32 array.
    Pixels are normalised to [0, 1] (MobileNetV2-style preprocessing
    is baked into the model's augmentation Sequential layer).
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except UnidentifiedImageError:
        raise ValueError("Uploaded file is not a valid image.")

    img = img.resize((224, 224), Image.LANCZOS)
    arr = np.array(img, dtype=np.float32) / 255.0          # [0,1]
    return np.expand_dims(arr, axis=0)                      # (1,224,224,3)


def _risk_label(prob: float) -> dict:
    """Map sigmoid probability to human-readable risk tier."""
    if prob >= 0.80:
        return {"label": "High Risk",   "color": "#ef4444", "tier": "high"}
    if prob >= 0.50:
        return {"label": "Moderate Risk","color": "#f97316","tier": "moderate"}
    if prob >= 0.30:
        return {"label": "Low Risk",    "color": "#eab308","tier": "low"}
    return     {"label": "Benign",      "color": "#22c55e","tier": "benign"}


def predict(image_bytes: bytes) -> dict:
    """
    Run inference on raw image bytes.

    Returns
    -------
    dict with keys:
        prediction  : "Cancer Detected" | "No Cancer Detected"
        confidence  : float  (0–100, rounded to 2 dp)
        probability : float  (raw sigmoid output, 0–1)
        risk_level  : str
        risk_color  : str
        risk_tier   : str
    """
    model = _get_model()
    arr   = preprocess_image(image_bytes)

    raw: float = float(model.predict(arr, verbose=0)[0][0])

    # raw is P(cancer)
    cancer_prob = raw
    confidence  = round(max(raw, 1 - raw) * 100, 2)

    detected    = cancer_prob >= 0.50
    risk        = _risk_label(cancer_prob)

    return {
        "prediction":  "Cancer Detected" if detected else "No Cancer Detected",
        "confidence":  confidence,
        "probability": round(cancer_prob, 6),
        "risk_level":  risk["label"],
        "risk_color":  risk["color"],
        "risk_tier":   risk["tier"],
        "detected":    detected,
    }


def warmup():
    """Pre-load the model so the first real request is fast."""
    try:
        model = _get_model()
        dummy = np.zeros((1, 224, 224, 3), dtype=np.float32)
        model.predict(dummy, verbose=0)
        logger.info("Model warm-up complete.")
    except Exception as exc:
        logger.error(f"Model warm-up failed: {exc}")
