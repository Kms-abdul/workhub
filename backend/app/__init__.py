from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text

from .config import Config

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()


def create_app(config=Config):
    app = Flask(__name__)
    app.config.from_object(config)
    if not app.config["SQLALCHEMY_DATABASE_URI"]:
        raise RuntimeError("Database settings are missing. Copy backend/.env.example to backend/.env and fill it in.")
    if not app.config["SECRET_KEY"] or len(app.config["SECRET_KEY"]) < 32:
        raise RuntimeError("SECRET_KEY must be set in backend/.env and be at least 32 characters.")

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    CORS(app)

    from . import auth, models
    from .routes import config_routes, employees, reports, time_entries, work_items

    app.register_blueprint(auth.bp)
    app.register_blueprint(config_routes.bp)
    app.register_blueprint(employees.bp)
    app.register_blueprint(work_items.bp)
    app.register_blueprint(time_entries.bp)
    app.register_blueprint(reports.bp)

    # Missing, expired or broken token: same JSON shape as every other error.
    @jwt.unauthorized_loader
    @jwt.invalid_token_loader
    def not_logged_in(reason):
        return jsonify(error="Please log in."), 401

    @jwt.expired_token_loader
    def token_expired(header, payload):
        return jsonify(error="Your session has expired. Please log in again."), 401

    @app.get("/api/health")
    def health():
        db.session.execute(text("SELECT 1"))
        return jsonify(
            status="ok",
            departments=models.Department.query.count(),
            categories=models.Category.query.count(),
        )

    return app
