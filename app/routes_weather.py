import os
import time
import requests
from flask import Blueprint, jsonify

weather_bp = Blueprint('weather', __name__)

# ---------------------------------------------------------------------------
# WMO weather code → (emoji, description)
# ---------------------------------------------------------------------------
_WMO_MAP = {
    0:  ('☀️',  'Clear sky'),
    1:  ('🌤️', 'Mainly clear'),
    2:  ('⛅',  'Partly cloudy'),
    3:  ('☁️',  'Overcast'),
    45: ('🌫️', 'Foggy'),
    48: ('🌫️', 'Icy fog'),
    51: ('🌦️', 'Light drizzle'),
    53: ('🌦️', 'Drizzle'),
    55: ('🌦️', 'Heavy drizzle'),
    56: ('🌧️', 'Freezing drizzle'),
    57: ('🌧️', 'Heavy freezing drizzle'),
    61: ('🌧️', 'Light rain'),
    63: ('🌧️', 'Rain'),
    65: ('🌧️', 'Heavy rain'),
    66: ('🌧️', 'Freezing rain'),
    67: ('🌧️', 'Heavy freezing rain'),
    71: ('❄️',  'Light snow'),
    73: ('❄️',  'Snow'),
    75: ('❄️',  'Heavy snow'),
    77: ('🌨️', 'Snow grains'),
    80: ('🌦️', 'Light showers'),
    81: ('🌦️', 'Showers'),
    82: ('🌦️', 'Heavy showers'),
    85: ('🌨️', 'Snow showers'),
    86: ('🌨️', 'Heavy snow showers'),
    95: ('⛈️',  'Thunderstorm'),
    96: ('⛈️',  'Thunderstorm with hail'),
    99: ('⛈️',  'Thunderstorm with heavy hail'),
}


def _wmo(code):
    """Return (emoji, description) for a WMO weather code."""
    if code is None:
        return ('🌡️', 'Unknown')
    # Try exact match, then fall back to range buckets
    if code in _WMO_MAP:
        return _WMO_MAP[code]
    if code <= 3:
        return ('⛅', 'Partly cloudy')
    if code <= 48:
        return ('🌫️', 'Foggy')
    if code <= 67:
        return ('🌧️', 'Rainy')
    if code <= 77:
        return ('❄️', 'Snowy')
    if code <= 82:
        return ('🌦️', 'Showers')
    return ('⛈️', 'Thunderstorm')


# ---------------------------------------------------------------------------
# Simple in-memory cache
# ---------------------------------------------------------------------------
_cache = {'data': None, 'ts': 0}
_CACHE_TTL = 30 * 60  # 30 minutes


def _get_cached_or_fetch():
    now = time.time()
    if _cache['data'] and (now - _cache['ts']) < _CACHE_TTL:
        return _cache['data'], True  # (data, from_cache)

    lat = os.getenv('WEATHER_LAT', '51.5074')
    lon = os.getenv('WEATHER_LON', '-0.1278')

    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m"
        f"&hourly=temperature_2m,weather_code"
        f"&daily=temperature_2m_max,temperature_2m_min,weather_code"
        f"&timezone=auto&forecast_days=3"
    )

    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    raw = resp.json()

    data = _parse_open_meteo(raw)
    _cache['data'] = data
    _cache['ts'] = now
    return data, False


def _parse_open_meteo(raw):
    import datetime

    cur_raw = raw.get('current', {})
    code = cur_raw.get('weather_code')
    emoji, desc = _wmo(code)

    current = {
        'temperature': cur_raw.get('temperature_2m'),
        'feels_like':  cur_raw.get('apparent_temperature'),
        'wind_speed':  cur_raw.get('wind_speed_10m'),
        'weather_code': code,
        'description': desc,
        'icon_emoji':  emoji,
    }

    # Hourly — next 6 hours from now
    hourly_raw = raw.get('hourly', {})
    hourly_times = hourly_raw.get('time', [])
    hourly_temps = hourly_raw.get('temperature_2m', [])
    hourly_codes = hourly_raw.get('weather_code', [])

    now_str = cur_raw.get('time', '')  # e.g. "2026-04-19T10:00"
    try:
        now_dt = datetime.datetime.fromisoformat(now_str)
    except (ValueError, TypeError):
        now_dt = datetime.datetime.now()

    hourly = []
    for t, temp, wcode in zip(hourly_times, hourly_temps, hourly_codes):
        try:
            dt = datetime.datetime.fromisoformat(t)
        except ValueError:
            continue
        if dt <= now_dt:
            continue
        h_emoji, _ = _wmo(wcode)
        hourly.append({
            'time':      dt.strftime('%H:%M'),
            'temp':      temp,
            'weather_code': wcode,
            'icon_emoji': h_emoji,
        })
        if len(hourly) >= 6:
            break

    # Daily — 3 days
    daily_raw = raw.get('daily', {})
    daily_dates   = daily_raw.get('time', [])
    daily_max     = daily_raw.get('temperature_2m_max', [])
    daily_min     = daily_raw.get('temperature_2m_min', [])
    daily_codes   = daily_raw.get('weather_code', [])

    daily = []
    for date_str, t_max, t_min, wcode in zip(daily_dates, daily_max, daily_min, daily_codes):
        try:
            dt = datetime.date.fromisoformat(date_str)
        except ValueError:
            continue
        d_emoji, d_desc = _wmo(wcode)
        daily.append({
            'date':        date_str,
            'date_short':  dt.strftime('%a'),   # Mon, Tue, Wed
            'temp_max':    t_max,
            'temp_min':    t_min,
            'weather_code': wcode,
            'description': d_desc,
            'icon_emoji':  d_emoji,
        })
        if len(daily) >= 3:
            break

    return {
        'current':   current,
        'hourly':    hourly,
        'daily':     daily,
        'cached_at': datetime.datetime.now().isoformat(timespec='seconds'),
    }


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@weather_bp.route('/weather')
def get_weather():
    """Proxy Open-Meteo weather, cached 30 min in memory."""
    try:
        data, from_cache = _get_cached_or_fetch()
        response = jsonify(data)
        response.headers['X-Cache'] = 'HIT' if from_cache else 'MISS'
        return response
    except requests.RequestException as exc:
        # Serve stale cache if available
        if _cache['data']:
            stale = dict(_cache['data'])
            stale['_stale'] = True
            return jsonify(stale), 200
        return jsonify({'error': f'Weather API unavailable: {exc}'}), 502
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500
