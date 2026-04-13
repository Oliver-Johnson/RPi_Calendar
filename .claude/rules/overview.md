---
description: Context for RPi_Calendar — loaded when working in this area
globs:
  - "RPi_Calendar/**"
alwaysApply: false
---

# RPi_Calendar (Pi-Schedule) — Project Overview

## Purpose

A local-first calendar and task management SPA designed to run on a Raspberry Pi. Syncs calendar events from Microsoft Outlook via the Graph API. Also includes job search tracking with automated scraping.

## Stack

- **Backend**: Python, Flask, SQLAlchemy, SQLite (`instance/schedule.db`)
- **Frontend**: Vanilla JavaScript SPA, Tailwind CSS (CDN), Lucide Icons (CDN)
- **Auth/Sync**: MSAL (Microsoft Authentication Library), Microsoft Graph API
- **Scheduler**: Flask-APScheduler (background job scraping every 6h)
- **Deployment**: Docker (`Dockerfile`, `docker-compose.yml`) or systemd via `setup_pi.sh`

## Architecture

Single-page application served from `templates/index.html`. All navigation is client-side via JS. Backend exposes two Flask blueprints:
- `/api/*` — CRUD REST API (`routes_api.py`)
- `/auth/*` — OAuth2 flow for Outlook (`routes_auth.py`)

Database is SQLite. Schema is managed by `db.create_all()` + `_run_migrations()` in `app/__init__.py` — migrations are raw ALTER TABLE statements that silently fail if the column already exists.

## Key Files

| File | Purpose |
|------|---------|
| `app/__init__.py` | Flask app factory, DB init, migrations, scheduler setup |
| `app/models.py` | SQLAlchemy models |
| `app/routes_api.py` | All CRUD API endpoints |
| `app/routes_auth.py` | OAuth2 callback, token storage, sync triggers |
| `app/sync.py` | Microsoft Graph API calls (read + write events) |
| `static/js/app.js` | SPA router and initialization |
| `static/js/api.js` | Fetch wrapper for all backend calls |
| `static/js/calendar.js` | Month/Week/Day calendar views |
| `static/js/tasks.js` | Task management UI with priority grouping |
| `static/js/insights.js` | Insights/analytics view |
| `static/js/timer.js` | Pomodoro/work timer |
| `static/js/agency.js` | Job agency tracking UI |
| `static/js/jobs.js` | Job listings UI |
| `scripts/scraper.py` | DuckDuckGo job scraper (runs every 6h) |
| `run.py` | Entry point: `create_app()` then `app.run()` |

## Models

- **Task** — priority (High/Medium/Low), status (Pending/Done), optional `estimated_duration`, `min_block_size`, `max_block_size` for scheduling, recurrence support, parent/child task hierarchy
- **Event** — calendar events; `source` is `'Manual'` or `'Outlook'`; `outlook_id` unique key for upsert sync; `excluded_from_schedule` flag
- **OutlookCalendar** — cached list of user's Outlook calendars; `is_enabled` controls which are synced
- **ScheduledBlock** — time blocks assigned to a Task; `is_pinned` prevents auto-rescheduling; tracks `actual_duration` for completion
- **JobSearch** — named search query for job scraping
- **JobBoard** — job board URLs
- **JobListing** — individual jobs found; status: New/Applied/Rejected

## Important Patterns

### Migrations
`_run_migrations()` in `app/__init__.py` runs raw `ALTER TABLE` SQL at startup. This is how new columns are added to existing SQLite DBs. Always add new columns here (not just to the model) — `db.create_all()` only creates missing tables, not missing columns.

### OAuth Token Storage
Outlook tokens are stored in the Flask session (not DB). Session-based auth means tokens are lost on server restart. Users must re-auth after restart.

### Sync Flow
1. `/auth/login` → redirect to Microsoft
2. `/auth/callback` → exchange code for token, store in session
3. `/api/sync` → calls `sync_outlook_events()` using session token
4. Sync window: **now → +30 days** (not historical)
5. Sync is upsert: events matched by `outlook_id`

### Graph API Authority
Uses `/common` authority (not tenant-specific) to support both work/school and personal Outlook.com accounts.

### Write-back to Outlook
`sync.py` supports bidirectional sync: `create_outlook_event()`, `update_outlook_event()`, `delete_outlook_event()` — called from `routes_api.py` when events are created/modified/deleted.

### Scheduler
APScheduler runs `scripts/scraper.py::run_scraper()` every 6 hours in the background. Guard in `__init__.py` prevents double-start in Flask debug mode (checks `WERKZEUG_RUN_MAIN`).

### Frontend JS Structure
- `app.js` handles SPA routing — call `renderPage(name)` to switch views
- `api.js` provides a thin `apiFetch(path, options)` wrapper with error handling
- All JS modules are loaded via `<script>` tags in `index.html`; no bundler

## Environment Variables (`.env`)

```
SECRET_KEY=           # Flask session key
AZURE_CLIENT_ID=      # Azure app registration client ID
AZURE_CLIENT_SECRET=  # Azure app registration client secret
AZURE_TENANT_ID=      # Azure tenant ID (used for reference; authority is /common)
AZURE_REDIRECT_URI=   # e.g. http://<pi-ip>:5000/auth/callback
```

## Non-Obvious Things

- `JobSearch.to_dict()` returns `query` as the JSON key (not `search_term`) — kept for frontend compatibility
- `Task.get_time_summary()` makes a DB query; `to_dict()` calls it, so listing many tasks is N+1. Keep this in mind for bulk endpoints.
- The scraper uses DuckDuckGo (not a paid API); `scrapling.md` documents scraping approach/issues
- `migrate_db.py` is a standalone script for manual migrations; prefer the `_run_migrations()` pattern for automated ones
- Docker uses a single container; no separate worker — the scheduler runs in the same Flask process
