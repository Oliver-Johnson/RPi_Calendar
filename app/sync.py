import msal
import requests
import os
import sys
from datetime import datetime, timedelta, timezone
from app import db
from app.models import Event, OutlookCalendar

GRAPH_API_ENDPOINT = 'https://graph.microsoft.com/v1.0'


def log(msg):
    """Debug logger that flushes immediately (unbuffered)."""
    print(msg, file=sys.stderr, flush=True)


def get_msal_app():
    # Use /common authority so Graph can route personal Outlook.com
    # accounts to the consumer calendar service (not tenant Exchange).
    return msal.ConfidentialClientApplication(
        client_id=os.getenv('AZURE_CLIENT_ID'),
        client_credential=os.getenv('AZURE_CLIENT_SECRET'),
        authority='https://login.microsoftonline.com/common',
    )


def fetch_outlook_calendars(access_token):
    """Fetch all calendars from Microsoft Graph and upsert into local DB.
    Returns list of OutlookCalendar dicts."""
    log('[SYNC] Fetching calendar list from Graph API...')

    headers = {'Authorization': f'Bearer {access_token}'}
    response = requests.get(
        f'{GRAPH_API_ENDPOINT}/me/calendars',
        headers=headers,
        params={
            '$select': 'id,name,color,isDefaultCalendar,owner',
            '$top': '100',
        },
    )
    log(f'[SYNC] /me/calendars status: {response.status_code}')

    if response.status_code != 200:
        try:
            error_msg = response.json().get('error', {}).get('message', response.text[:300])
        except Exception:
            error_msg = response.text[:500] if response.text else 'Empty response'
        raise Exception(f'Failed to list calendars ({response.status_code}): {error_msg}')

    calendars_data = response.json().get('value', [])
    log(f'[SYNC] Found {len(calendars_data)} calendars')

    results = []
    for cal in calendars_data:
        outlook_cal_id = cal['id']
        existing = OutlookCalendar.query.filter_by(outlook_cal_id=outlook_cal_id).first()

        if existing:
            existing.name = cal.get('name', 'Unnamed')
            existing.owner_name = cal.get('owner', {}).get('name')
            existing.color = cal.get('color')
            existing.is_default = cal.get('isDefaultCalendar', False)
            results.append(existing)
        else:
            new_cal = OutlookCalendar(
                outlook_cal_id=outlook_cal_id,
                name=cal.get('name', 'Unnamed'),
                owner_name=cal.get('owner', {}).get('name'),
                color=cal.get('color'),
                is_default=cal.get('isDefaultCalendar', False),
                # Auto-enable only the default calendar
                is_enabled=cal.get('isDefaultCalendar', False),
            )
            db.session.add(new_cal)
            results.append(new_cal)

    db.session.commit()
    log(f'[SYNC] Upserted {len(results)} calendars')
    return [c.to_dict() for c in results]


def sync_outlook_events(access_token):
    """Fetch events from all enabled Outlook calendars and upsert into local DB."""
    log('[SYNC] Starting multi-calendar sync...')

    # Compute local UTC offset for the Prefer header so Outlook returns local times
    local_offset = datetime.now(timezone.utc).astimezone().strftime('%z')  # e.g. '+0100'
    tz_name = datetime.now(timezone.utc).astimezone().tzname() or 'UTC'

    headers = {
        'Authorization': f'Bearer {access_token}',
        'Prefer': f'outlook.timezone="{tz_name}"',
    }

    enabled_cals = OutlookCalendar.query.filter_by(is_enabled=True).all()

    if not enabled_cals:
        log('[SYNC] No calendars enabled, skipping sync')
        return 0

    now = datetime.now()
    end = now + timedelta(days=30)
    total_new = 0

    for cal in enabled_cals:
        log(f'[SYNC] Fetching events from: {cal.name}')

        url = f'{GRAPH_API_ENDPOINT}/me/calendars/{cal.outlook_cal_id}/calendarView'
        params = {
            'startDateTime': now.strftime('%Y-%m-%dT%H:%M:%S'),
            'endDateTime': end.strftime('%Y-%m-%dT%H:%M:%S'),
            '$top': '100',
            '$orderby': 'start/dateTime',
            '$select': 'id,subject,start,end,bodyPreview,isAllDay',
        }

        response = requests.get(url, headers=headers, params=params)
        log(f'[SYNC] "{cal.name}" status: {response.status_code}')

        if response.status_code != 200:
            log(f'[SYNC] WARNING: Skipping "{cal.name}" (status {response.status_code})')
            continue

        events_data = response.json().get('value', [])
        log(f'[SYNC] "{cal.name}": {len(events_data)} events')

        for item in events_data:
            outlook_id = item['id']
            subject = item.get('subject', '(No Subject)')
            body_preview = item.get('bodyPreview', '') or ''
            is_all_day = item.get('isAllDay', False)
            start_str = item['start']['dateTime']
            end_str = item['end']['dateTime']

            start_time = datetime.fromisoformat(start_str.rstrip('Z'))
            end_time = datetime.fromisoformat(end_str.rstrip('Z'))

            existing = Event.query.filter_by(outlook_id=outlook_id).first()

            if existing:
                existing.title = subject
                existing.start_time = start_time
                existing.end_time = end_time
                existing.calendar_id = cal.id
                existing.calendar_name = cal.name
                existing.description = body_preview
                existing.is_all_day = is_all_day
            else:
                event = Event(
                    title=subject,
                    start_time=start_time,
                    end_time=end_time,
                    source='Outlook',
                    outlook_id=outlook_id,
                    calendar_id=cal.id,
                    calendar_name=cal.name,
                    description=body_preview,
                    is_all_day=is_all_day,
                )
                db.session.add(event)
                total_new += 1

        cal.last_synced_at = now

    db.session.commit()
    log(f'[SYNC] Complete! {total_new} new events across {len(enabled_cals)} calendars')
    return total_new


# ── Outlook Write Operations ──────────────────────────────────────────────────

def _extract_error(response):
    """Pull a human-readable error from a Graph API error response."""
    try:
        return response.json().get('error', {}).get('message', response.text[:300])
    except Exception:
        return response.text[:500] if response.text else 'Empty response'


def build_outlook_event_payload(event_data):
    """Convert local event data dict to Microsoft Graph event payload."""
    payload = {
        'subject': event_data.get('title', '(No Subject)'),
    }

    desc = event_data.get('description', '')
    if desc:
        payload['body'] = {
            'contentType': 'text',
            'content': desc,
        }

    is_all_day = event_data.get('is_all_day', False)

    # Normalise start/end to datetime objects
    raw_start = event_data.get('start_time')
    raw_end = event_data.get('end_time')
    start_dt = datetime.fromisoformat(raw_start) if isinstance(raw_start, str) else raw_start
    end_dt = datetime.fromisoformat(raw_end) if isinstance(raw_end, str) else raw_end

    if is_all_day:
        payload['isAllDay'] = True
        payload['start'] = {'dateTime': start_dt.strftime('%Y-%m-%dT00:00:00'), 'timeZone': 'UTC'}
        payload['end'] = {'dateTime': end_dt.strftime('%Y-%m-%dT00:00:00'), 'timeZone': 'UTC'}
    else:
        payload['start'] = {'dateTime': start_dt.isoformat(), 'timeZone': 'UTC'}
        payload['end'] = {'dateTime': end_dt.isoformat(), 'timeZone': 'UTC'}

    return payload


def create_outlook_event(access_token, calendar_outlook_id, event_data):
    """Create an event in an Outlook calendar via Graph API.
    Returns the Graph API response dict (includes 'id')."""
    log(f'[SYNC] Creating event in Outlook calendar...')

    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
    }
    payload = build_outlook_event_payload(event_data)

    response = requests.post(
        f'{GRAPH_API_ENDPOINT}/me/calendars/{calendar_outlook_id}/events',
        headers=headers,
        json=payload,
    )
    log(f'[SYNC] Create event status: {response.status_code}')

    if response.status_code not in (200, 201):
        error_msg = _extract_error(response)
        raise Exception(f'Failed to create Outlook event ({response.status_code}): {error_msg}')

    return response.json()


def update_outlook_event(access_token, outlook_event_id, event_data):
    """Update an existing Outlook event via PATCH /me/events/{id}."""
    log(f'[SYNC] Updating Outlook event...')

    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
    }
    payload = build_outlook_event_payload(event_data)

    response = requests.patch(
        f'{GRAPH_API_ENDPOINT}/me/events/{outlook_event_id}',
        headers=headers,
        json=payload,
    )
    log(f'[SYNC] Update event status: {response.status_code}')

    if response.status_code != 200:
        error_msg = _extract_error(response)
        raise Exception(f'Failed to update Outlook event ({response.status_code}): {error_msg}')

    return response.json()


def delete_outlook_event(access_token, outlook_event_id):
    """Delete an Outlook event via DELETE /me/events/{id}."""
    log(f'[SYNC] Deleting Outlook event...')

    headers = {'Authorization': f'Bearer {access_token}'}

    response = requests.delete(
        f'{GRAPH_API_ENDPOINT}/me/events/{outlook_event_id}',
        headers=headers,
    )
    log(f'[SYNC] Delete event status: {response.status_code}')

    # 204 = deleted, 404 = already gone — both are fine
    if response.status_code not in (204, 404):
        error_msg = _extract_error(response)
        raise Exception(f'Failed to delete Outlook event ({response.status_code}): {error_msg}')

    return response.status_code
