from flask import Flask, render_template
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
import os
import secrets

load_dotenv()

db = SQLAlchemy()


def create_app():
    app = Flask(
        __name__,
        template_folder='../templates',
        static_folder='../static'
    )

    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY') or secrets.token_hex(32)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///schedule.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)

    from app.routes_api import api_bp
    from app.routes_auth import auth_bp

    app.register_blueprint(api_bp, url_prefix='/api')
    app.register_blueprint(auth_bp, url_prefix='/auth')

    @app.route('/')
    def index():
        return render_template('index.html')

    with app.app_context():
        from app import models  # noqa: F401
        db.create_all()
        _run_migrations(db)

    return app


def _run_migrations(database):
    """Add columns that db.create_all() won't add to existing tables."""
    migrations = [
        "ALTER TABLE events ADD COLUMN calendar_id INTEGER REFERENCES outlook_calendars(id)",
        "ALTER TABLE events ADD COLUMN calendar_name VARCHAR(200)",
        "ALTER TABLE events ADD COLUMN description TEXT",
        "ALTER TABLE events ADD COLUMN is_all_day BOOLEAN DEFAULT 0",
        "ALTER TABLE tasks ADD COLUMN estimated_duration INTEGER",
        "ALTER TABLE tasks ADD COLUMN min_block_size INTEGER",
        "ALTER TABLE tasks ADD COLUMN max_block_size INTEGER",
        "ALTER TABLE events ADD COLUMN excluded_from_schedule BOOLEAN DEFAULT 0",
        "ALTER TABLE scheduled_blocks ADD COLUMN is_pinned BOOLEAN DEFAULT 0",
    ]
    for sql in migrations:
        try:
            database.session.execute(database.text(sql))
            database.session.commit()
        except Exception:
            database.session.rollback()  # Column already exists
