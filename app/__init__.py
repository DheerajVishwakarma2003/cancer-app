import os
import logging
from flask import Flask
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from config import config

jwt = JWTManager()


def create_app(env: str = None) -> Flask:
    env = env or os.getenv("FLASK_ENV", "development")
    app = Flask(
        __name__,
        template_folder="templates",   # app/templates/
        static_folder="static",        # app/static/
        static_url_path="/static",
    )
    app.config.from_object(config.get(env, config["default"]))

    # Extensions
    jwt.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

    # Logging
    logging.basicConfig(
        level=logging.DEBUG if app.config.get("DEBUG") else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
    )

    # Ensure upload dir exists
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    # Register blueprints
    from app.routes.auth_routes         import auth_bp
    from app.routes.doctor_routes       import doctor_bp
    from app.routes.patient_routes      import patient_bp
    from app.routes.admin_routes        import admin_bp
    from app.routes.subscription_routes import sub_bp
    from app.routes.page_routes         import page_bp

    app.register_blueprint(page_bp)
    app.register_blueprint(auth_bp,   url_prefix="/api/auth")
    app.register_blueprint(doctor_bp, url_prefix="/api/doctors")
    app.register_blueprint(patient_bp,url_prefix="/api/patients")
    app.register_blueprint(admin_bp,  url_prefix="/api/admin")
    app.register_blueprint(sub_bp,    url_prefix="/api/subscription")

    # JWT error handlers
    @jwt.expired_token_loader
    def expired(_h, _p):
        return {"error": "Token expired"}, 401

    @jwt.invalid_token_loader
    def invalid(reason):
        return {"error": f"Invalid token: {reason}"}, 401

    @jwt.unauthorized_loader
    def missing(reason):
        return {"error": f"Missing token: {reason}"}, 401

    # Warm-up AI model (non-blocking)
    try:
        from app.ai.predict_service import warmup
        warmup()
    except Exception as exc:
        app.logger.warning(f"AI warm-up skipped: {exc}")

    return app
