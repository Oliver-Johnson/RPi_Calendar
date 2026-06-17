# Pi-Schedule

A Flask + SQLite calendar, task management, and job-hunting app designed to run permanently on a Raspberry Pi. Manages calendar events (with Outlook sync), prioritised tasks with scheduled time blocks, and an automated job scraper that feeds validated listings into a separate job-applier pipeline.

## Features

- **Calendar** — Month, Week, and Day views; manual events plus Outlook sync via Microsoft Graph API
- **Tasks** — Create tasks with priority (High/Medium/Low), due dates, estimated duration, recurrence rules, and sub-tasks
- **Scheduled Blocks** — Assign calendar time blocks to tasks; track scheduled vs. completed minutes
- **Job Searches** — Define keyword searches (DuckDuckGo) and direct job board URLs to spider
- **Job Scraper** — Runs on a schedule; verifies listings are active (heuristic keyword scoring + deadline extraction), deduplicates, and stores results
- **Job Applier Integration** — Each verified listing is POSTed to a configurable webhook (`JOB_APPLIER_URL`) for automated downstream processing
- **Local-first** — Everything runs on your network; SQLite database, no cloud dependency beyond optional Outlook sync

## Setup (Raspberry Pi)

```bash
git clone <repo-url> ~/pi-schedule
cd ~/pi-schedule
cp .env.example .env   # edit with your settings (see below)
bash setup_pi.sh
```

`setup_pi.sh` creates a Python virtual environment, installs dependencies, and registers a **systemd service** (`pi-schedule.service`) that starts on boot.

## Running

| Action | Command |
|--------|---------|
| Start service | `sudo systemctl start pi-schedule` |
| Stop service | `sudo systemctl stop pi-schedule` |
| Check status | `sudo systemctl status pi-schedule` |
| View logs | `journalctl -u pi-schedule -f` |

The app listens on port **5000** and is accessible at `http://<pi-ip>:5000`.

### Local development

```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python run.py
```

## Environment Variables (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | Flask session secret |
| `AZURE_CLIENT_ID` | Outlook sync | Azure app client ID |
| `AZURE_CLIENT_SECRET` | Outlook sync | Azure app client secret |
| `AZURE_TENANT_ID` | Outlook sync | Azure directory tenant ID |
| `AZURE_REDIRECT_URI` | Outlook sync | e.g. `http://<pi-ip>:5000/auth/callback` |
| `JOB_APPLIER_URL` | Job pipeline | Webhook URL for the job-applier service |

## Outlook Sync Setup

1. Go to [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**
   - Redirect URI: `http://<your-pi-ip>:5000/auth/callback`
2. Copy **Application (client) ID** → `AZURE_CLIENT_ID` and **Directory (tenant) ID** → `AZURE_TENANT_ID`
3. Under **Certificates & secrets**, create a new client secret → `AZURE_CLIENT_SECRET`
4. Under **API permissions**, add **Microsoft Graph → Delegated → Calendars.Read** and grant admin consent

## Job Scraper

The scraper runs automatically via APScheduler. It processes two source types:

- **Keyword searches** — queries DuckDuckGo and verifies each result URL is an active job posting
- **Job boards** — spiders a direct board URL for job links, then cross-references against active keyword searches

Verified listings are saved to the database and (if `JOB_APPLIER_URL` is set) forwarded to the job-applier webhook with title, company, description, location, salary, and deadline.

## Deploy Scripts (local only, gitignored)

Three helper scripts exist locally for deploying to the Pi over SSH — they are **not committed** to the repo:

| Script | Purpose |
|--------|---------|
| `check_pi.py` | Verify Pi is reachable and service is running |
| `deploy_to_pi.py` | Sync code to the Pi and restart the service |
| `finish_deploy.py` | Post-deploy checks |

Set the `PI_PASS` environment variable before running them:

```bash
PI_PASS=yourpassword python deploy_to_pi.py
```

## Project Structure

```
├── app/
│   ├── __init__.py        # Flask app factory + APScheduler
│   ├── models.py          # Task, Event, ScheduledBlock, JobSearch, JobBoard, JobListing
│   ├── routes_api.py      # REST API endpoints
│   ├── routes_auth.py     # OAuth2 / Outlook auth routes
│   └── sync.py            # Microsoft Graph sync logic
├── scripts/
│   └── scraper.py         # Job scraper (DuckDuckGo + board spidering)
├── static/
│   ├── css/app.css
│   └── js/                # Vanilla JS SPA (calendar, tasks, jobs views)
├── templates/
│   └── index.html         # SPA shell
├── run.py                 # Entry point
├── setup_pi.sh            # Pi systemd service installer
└── requirements.txt
```

## Tech Stack

- **Backend**: Python, Flask, SQLAlchemy, SQLite, Flask-APScheduler
- **Frontend**: Vanilla JavaScript, Tailwind CSS (CDN), Lucide Icons (CDN)
- **Scraping**: Scrapling (adaptive HTTP + headless browser), BeautifulSoup, DuckDuckGo Search
- **Outlook integration**: MSAL, Microsoft Graph API
