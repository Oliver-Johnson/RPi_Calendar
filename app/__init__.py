from flask import Flask, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_apscheduler import APScheduler
from dotenv import load_dotenv
import os
load_dotenv()

db = SQLAlchemy()
scheduler = APScheduler()


def create_app():
    app = Flask(
        __name__,
        template_folder='../templates',
        static_folder='../static'
    )

    secret_key = os.getenv('SECRET_KEY')
    if not secret_key:
        raise ValueError(
            "SECRET_KEY is not set. Add SECRET_KEY=<random-hex> to your .env file. "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    app.config['SECRET_KEY'] = secret_key
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///schedule.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SCHEDULER_API_ENABLED'] = False

    db.init_app(app)
    scheduler.init_app(app)

    from app.routes_api import api_bp
    from app.routes_auth import auth_bp
    from app.routes_weather import weather_bp
    from app.routes_ai import ai_bp
    from app.routes_notes import notes_bp

    app.register_blueprint(api_bp, url_prefix='/api')
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(weather_bp, url_prefix='/api')
    app.register_blueprint(ai_bp, url_prefix='/api/ai')
    app.register_blueprint(notes_bp, url_prefix='/api/notes')

    @app.route('/')
    def index():
        return render_template('index.html')

    with app.app_context():
        from app import models  # noqa: F401
        db.create_all()
        _run_migrations(db)
        
        # Register Background Scraper
        try:
            from scripts.scraper import run_scraper
            scheduler.add_job(id='automated_job_scraper', func=run_scraper, trigger='interval', hours=6)
        except Exception as e:
            print(f"Failed to initialize scheduler: {e}")

    # Only start the scheduler once (prevents double-starting with Flask debug reloader)
    if not app.debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        scheduler.start()

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
        "ALTER TABLE job_listings ADD COLUMN deadline VARCHAR(100)",
        "ALTER TABLE notes ADD COLUMN updated_at DATETIME",
    ]
    for sql in migrations:
        try:
            database.session.execute(database.text(sql))
            database.session.commit()
        except Exception:
            database.session.rollback()  # Column already exists
