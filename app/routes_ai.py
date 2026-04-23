from flask import Blueprint, request, jsonify
from app import db
from app.models import Event, Task, ScheduledBlock
from sqlalchemy.orm import joinedload
from datetime import datetime, timedelta, date

ai_bp = Blueprint('ai', __name__)

VALID_PRIORITIES = ('High', 'Medium', 'Low')
VALID_STATUSES = ('Pending', 'In Progress', 'Completed')


def _today_range():
    today = date.today()
    start = datetime(today.year, today.month, today.day, 0, 0, 0)
    end = datetime(today.year, today.month, today.day, 23, 59, 59)
    return start, end


def _week_range(start_str=None):
    if start_str:
        try:
            week_start = datetime.strptime(start_str, '%Y-%m-%d').date()
        except ValueError:
            week_start = date.today()
            # Go back to Monday
            week_start -= timedelta(days=week_start.weekday())
    else:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    return week_start, week_end


def _parse_datetime(val):
    """Parse ISO datetime or date string."""
    if not val:
        return None
    for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M', '%Y-%m-%d'):
        try:
            return datetime.strptime(val, fmt)
        except ValueError:
            continue
    return None


# ── Today ─────────────────────────────────────────────────────────────────────

@ai_bp.route('/today', methods=['GET'])
def get_today():
    start, end = _today_range()
    events = Event.query.filter(
        Event.start_time >= start,
        Event.start_time <= end
    ).order_by(Event.start_time).all()

    tasks = Task.query.options(joinedload(Task.scheduled_blocks)).filter(
        Task.status != 'Completed'
    ).order_by(Task.due_date).all()

    blocks = ScheduledBlock.query.filter(
        ScheduledBlock.start_time >= start,
        ScheduledBlock.start_time <= end
    ).order_by(ScheduledBlock.start_time).all()

    return jsonify({
        'date': date.today().isoformat(),
        'events': [e.to_dict() for e in events],
        'tasks': [t.to_dict() for t in tasks],
        'scheduled_blocks': [b.to_dict() for b in blocks],
    })


# ── Events ────────────────────────────────────────────────────────────────────

@ai_bp.route('/events', methods=['GET'])
def get_events():
    date_str = request.args.get('date')
    start_str = request.args.get('start')
    end_str = request.args.get('end')

    if date_str:
        try:
            d = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': 'Invalid date format, use YYYY-MM-DD'}), 400
        start = datetime(d.year, d.month, d.day, 0, 0, 0)
        end = datetime(d.year, d.month, d.day, 23, 59, 59)
    elif start_str:
        start = _parse_datetime(start_str)
        end = _parse_datetime(end_str) if end_str else start + timedelta(days=1)
        if not start:
            return jsonify({'error': 'Invalid start format'}), 400
    else:
        start, end = _today_range()

    events = Event.query.filter(
        Event.start_time >= start,
        Event.start_time <= end
    ).order_by(Event.start_time).all()

    return jsonify({'events': [e.to_dict() for e in events]})


@ai_bp.route('/events', methods=['POST'])
def create_event():
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'title is required'}), 400

    # Accept either start_time (ISO) or date + optional time components
    start_time = _parse_datetime(data.get('start_time'))
    end_time = _parse_datetime(data.get('end_time'))

    if not start_time and data.get('date'):
        # Build from date field
        start_time = _parse_datetime(data['date'])

    if not start_time:
        return jsonify({'error': 'start_time or date is required'}), 400

    if not end_time:
        end_time = start_time + timedelta(hours=1)

    event = Event(
        title=title,
        start_time=start_time,
        end_time=end_time,
        source='Manual',
        description=data.get('description'),
        is_all_day=bool(data.get('is_all_day', False)),
    )
    db.session.add(event)
    db.session.commit()
    return jsonify(event.to_dict()), 201


@ai_bp.route('/events/<int:event_id>', methods=['DELETE'])
def delete_event(event_id):
    event = Event.query.get_or_404(event_id)
    if event.source == 'Outlook':
        return jsonify({'error': 'Cannot delete Outlook-synced events via AI API'}), 400
    db.session.delete(event)
    db.session.commit()
    return '', 204


# ── Tasks ─────────────────────────────────────────────────────────────────────

@ai_bp.route('/tasks', methods=['GET'])
def get_tasks():
    status_filter = request.args.get('status', 'pending').lower()
    priority_filter = request.args.get('priority', '').strip()

    query = Task.query.options(joinedload(Task.scheduled_blocks))

    if status_filter == 'pending':
        query = query.filter(Task.status != 'Completed')
    elif status_filter == 'completed':
        query = query.filter(Task.status == 'Completed')
    # 'all' → no filter

    if priority_filter:
        canon = priority_filter.capitalize()
        if canon in VALID_PRIORITIES:
            query = query.filter(Task.priority == canon)

    priority_order = db.case(
        (Task.priority == 'High', 1),
        (Task.priority == 'Medium', 2),
        (Task.priority == 'Low', 3),
    )
    tasks = query.order_by(priority_order, Task.due_date).all()
    return jsonify({'tasks': [t.to_dict() for t in tasks]})


@ai_bp.route('/tasks', methods=['POST'])
def create_task():
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'title is required'}), 400

    priority = data.get('priority', 'Medium')
    if isinstance(priority, str):
        priority = priority.capitalize()
    if priority not in VALID_PRIORITIES:
        priority = 'Medium'

    due_date = _parse_datetime(data.get('due_date'))

    # Accept 'notes' as alias for 'description'
    description = data.get('description') or data.get('notes')

    task = Task(
        title=title,
        priority=priority,
        due_date=due_date,
        status='Pending',
        description=description,
    )
    db.session.add(task)
    db.session.commit()
    return jsonify(task.to_dict()), 201


@ai_bp.route('/tasks/<int:task_id>', methods=['PATCH'])
def update_task(task_id):
    task = Task.query.options(joinedload(Task.scheduled_blocks)).get_or_404(task_id)
    data = request.get_json() or {}

    if 'title' in data:
        title = (data['title'] or '').strip()
        if not title:
            return jsonify({'error': 'title cannot be empty'}), 400
        task.title = title

    if 'status' in data:
        status = data['status']
        if status not in VALID_STATUSES:
            return jsonify({'error': f'status must be one of {VALID_STATUSES}'}), 400
        task.status = status

    if 'priority' in data:
        priority = (data['priority'] or '').capitalize()
        if priority not in VALID_PRIORITIES:
            return jsonify({'error': f'priority must be one of {VALID_PRIORITIES}'}), 400
        task.priority = priority

    if 'due_date' in data:
        task.due_date = _parse_datetime(data['due_date'])

    if 'description' in data:
        task.description = data['description']

    db.session.commit()
    return jsonify(task.to_dict())


@ai_bp.route('/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    task = Task.query.get_or_404(task_id)
    db.session.delete(task)
    db.session.commit()
    return '', 204


# ── Week ──────────────────────────────────────────────────────────────────────

@ai_bp.route('/week', methods=['GET'])
def get_week():
    week_start, week_end = _week_range(request.args.get('start'))

    start_dt = datetime(week_start.year, week_start.month, week_start.day, 0, 0, 0)
    end_dt = datetime(week_end.year, week_end.month, week_end.day, 23, 59, 59)

    events = Event.query.filter(
        Event.start_time >= start_dt,
        Event.start_time <= end_dt
    ).order_by(Event.start_time).all()

    tasks = Task.query.options(joinedload(Task.scheduled_blocks)).filter(
        Task.due_date >= start_dt,
        Task.due_date <= end_dt
    ).order_by(Task.due_date).all()

    # Build per-day buckets
    days = []
    for i in range(7):
        d = week_start + timedelta(days=i)
        day_start = datetime(d.year, d.month, d.day, 0, 0, 0)
        day_end = datetime(d.year, d.month, d.day, 23, 59, 59)
        day_events = [e.to_dict() for e in events if day_start <= e.start_time <= day_end]
        day_tasks = [t.to_dict() for t in tasks if t.due_date and day_start <= t.due_date <= day_end]
        days.append({
            'date': d.isoformat(),
            'events': day_events,
            'tasks': day_tasks,
        })

    return jsonify({
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat(),
        'days': days,
    })
