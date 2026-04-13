from flask import Blueprint, redirect, request, session, jsonify, url_for, current_app
from app.sync import (
    get_msal_app, fetch_outlook_calendars, sync_outlook_events,
    SCOPES, load_token_cache, save_token_cache, get_token_silent,
)
import os

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login')
def login():
    """Start the OAuth2 authorization code flow."""
    client_id = os.getenv('AZURE_CLIENT_ID')
    if not client_id:
        return jsonify({'error': 'Outlook sync not configured. Set AZURE_CLIENT_ID in .env'}), 501

    msal_app = get_msal_app()
    auth_url = msal_app.get_authorization_request_url(
        scopes=SCOPES,
        redirect_uri=os.getenv('AZURE_REDIRECT_URI'),
        prompt='consent',  # Force fresh consent to pick up new scopes
    )
    current_app.logger.info(f'[AUTH] Login redirect, scopes={SCOPES}')
    return redirect(auth_url)


@auth_bp.route('/callback')
def callback():
    """Handle the OAuth2 callback — discover calendars and trigger sync."""
    code = request.args.get('code')
    if not code:
        error = request.args.get('error_description', 'No authorization code received')
        return jsonify({'error': error}), 400

    cache = load_token_cache()
    msal_app = get_msal_app(cache)
    result = msal_app.acquire_token_by_authorization_code(
        code,
        scopes=SCOPES,
        redirect_uri=os.getenv('AZURE_REDIRECT_URI'),
    )

    if 'access_token' in result:
        token = result['access_token']
        save_token_cache(cache)  # Persist so token survives restarts
        current_app.logger.info(f'[AUTH] Token acquired, scopes: {result.get("scope")}')

        session['access_token'] = token
        try:
            # Discover all available calendars first
            fetch_outlook_calendars(token)
            # Then sync events from enabled calendars
            count = sync_outlook_events(token)
            return redirect(url_for('index') + f'?synced={count}')
        except Exception as e:
            current_app.logger.error(f'[AUTH] Sync error: {e}')
            return jsonify({'error': str(e)}), 500
    else:
        error_detail = result.get('error_description', result.get('error', 'Authentication failed'))
        current_app.logger.error(f'[AUTH] Token acquisition FAILED: {error_detail}')
        return jsonify({'error': error_detail}), 400


@auth_bp.route('/sync', methods=['POST'])
def sync():
    """Sync Outlook events using the stored access token."""
    token = get_token_silent() or session.get('access_token')
    if not token:
        return jsonify({'error': 'Not authenticated', 'auth_url': '/auth/login'}), 401

    try:
        # Refresh calendar list, then sync events
        fetch_outlook_calendars(token)
        count = sync_outlook_events(token)
        return jsonify({'synced': count})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
