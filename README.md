# Pi-Schedule

A lightweight calendar and task management app designed to run on a Raspberry Pi, with Microsoft Outlook sync.

## Features

- **Priority Tasks** — Create, edit, and organize tasks by priority (High / Medium / Low)
- **Calendar Views** — Month, Week, and Day views with event management
- **Outlook Sync** — Pull calendar events from Microsoft Outlook via the Graph API
- **Local-first** — Runs entirely on your network with a SQLite database

## Quick Start

### On Raspberry Pi

```bash
git clone <repo-url> ~/pi-schedule
cd ~/pi-schedule
bash setup_pi.sh
```

The setup script installs dependencies, creates a virtual environment, and configures a systemd service that starts on boot.

### For Development

```bash
python -m venv venv
source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env       # then edit with your settings
python run.py
```

Open `http://localhost:5000` in your browser.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List tasks (filter: `?priority=High`, `?status=Pending`) |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/<id>` | Update task |
| DELETE | `/api/tasks/<id>` | Delete task |
| GET | `/api/events` | List events (filter: `?start=...&end=...`) |
| POST | `/api/events` | Create event |
| PUT | `/api/events/<id>` | Update event |
| DELETE | `/api/events/<id>` | Delete event |

## Azure App Registration (for Outlook Sync)

To sync with Outlook, you need to register an application in Azure:

1. Go to [Azure Portal](https://portal.azure.com) > **Microsoft Entra ID** > **App registrations**
2. Click **New registration**
   - **Name**: `Pi-Schedule`
   - **Supported account types**: Accounts in this organizational directory only (Single tenant)
   - **Redirect URI**: Select **Web** and enter `http://<your-pi-ip>:5000/auth/callback`
3. After registration, note these values from the **Overview** page:
   - **Application (client) ID** → `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → `AZURE_TENANT_ID`
4. Go to **Certificates & secrets** > **New client secret**
   - Copy the secret **Value** (not the ID) → `AZURE_CLIENT_SECRET`
5. Go to **API permissions** > **Add a permission**
   - Select **Microsoft Graph** > **Delegated permissions**
   - Add **Calendars.Read**
   - Click **Grant admin consent** (if you have admin access)
6. Update your `.env` file:
   ```
   AZURE_CLIENT_ID=<your-client-id>
   AZURE_CLIENT_SECRET=<your-client-secret>
   AZURE_TENANT_ID=<your-tenant-id>
   AZURE_REDIRECT_URI=http://<your-pi-ip>:5000/auth/callback
   ```

## Project Structure

```
├── app/
│   ├── __init__.py        # Flask app factory
│   ├── models.py          # Task and Event database models
│   ├── routes_api.py      # CRUD API endpoints
│   ├── routes_auth.py     # OAuth2 authentication routes
│   └── sync.py            # Microsoft Graph sync logic
├── static/
│   ├── css/app.css        # Custom styles
│   └── js/
│       ├── app.js         # SPA routing and initialization
│       ├── api.js         # API client
│       ├── calendar.js    # Calendar view (Month/Week/Day)
│       ├── tasks.js       # Task view with priority grouping
│       └── utils.js       # Date utilities
├── templates/
│   └── index.html         # SPA shell
├── run.py                 # Application entry point
├── setup_pi.sh            # Raspberry Pi deployment script
└── requirements.txt       # Python dependencies
```

## Tech Stack

- **Backend**: Python, Flask, SQLAlchemy, SQLite
- **Frontend**: Vanilla JavaScript, Tailwind CSS (CDN), Lucide Icons (CDN)
- **Integration**: MSAL (Microsoft Authentication Library), Microsoft Graph API
