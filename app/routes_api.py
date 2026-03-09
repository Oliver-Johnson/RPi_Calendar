from flask import Blueprint, request, jsonify, session
from app import db
from app.models import Task, Event, OutlookCalendar, ScheduledBlock
from datetime import datetime, timedelta

api_bp = Blueprint('api', __name__)

VALID_PRIORITIES = ('High', 'Medium', 'Low')
VALID_STATUSES = ('Pending', 'In Progress', 'Completed')
VALID_RECURRENCES = ('daily', 'weekly', 'monthly', 'yearly')


# ── Tasks ────────────────────────────────────────────────────────────────────

@api_bp.route('/tasks', methods=['GET'])
def get_tasks():
    priority = request.args.get('priority')
    status = request.args.get('status')

    query = Task.query
    if priority and priority in VALID_PRIORITIES:
        query = query.filter_by(priority=priority)
    if status and status in VALID_STATUSES:
        query = query.filter_by(status=status)

    priority_order = db.case(
        (Task.priority == 'High', 1),
        (Task.priority == 'Medium', 2),
        (Task.priority == 'Low', 3),
    )
    tasks = query.order_by(priority_order, Task.due_date).all()
    return jsonify([t.to_dict() for t in tasks])


@api_bp.route('/tasks', methods=['POST'])
def create_task():
    data = request.get_json()
    if not data or not data.get('title', '').strip():
        return jsonify({'error': 'Title is required'}), 400

    priority = data.get('priority', 'Medium')
    if priority not in VALID_PRIORITIES:
        return jsonify({'error': f'Priority must be one of {VALID_PRIORITIES}'}), 400

    status = data.get('status', 'Pending')
    if status not in VALID_STATUSES:
        return jsonify({'error': f'Status must be one of {VALID_STATUSES}'}), 400

    due_date = None
    if data.get('due_date'):
        try:
            due_date = datetime.fromisoformat(data['due_date'])
        except ValueError:
            return jsonify({'error': 'Invalid due_date format (use ISO 8601)'}), 400

    estimated_duration = data.get('estimated_duration')
    if estimated_duration is not None:
        try:
            estimated_duration = int(estimated_duration)
            if estimated_duration <= 0:
                return jsonify({'error': 'estimated_duration must be a positive number'}), 400
        except (ValueError, TypeError):
            return jsonify({'error': 'estimated_duration must be an integer (minutes)'}), 400

    min_block = _parse_optional_int(data, 'min_block_size')
    max_block = _parse_optional_int(data, 'max_block_size')

    recurrence_rule = data.get('recurrence_rule')
    if recurrence_rule and recurrence_rule not in VALID_RECURRENCES:
        return jsonify({'error': f'recurrence_rule must be one of {VALID_RECURRENCES}'}), 400

    recurrence_until = None
    if data.get('recurrence_until'):
        try:
            recurrence_until = datetime.fromisoformat(data['recurrence_until'])
        except ValueError:
            return jsonify({'error': 'Invalid recurrence_until format'}), 400

    task = Task(
        title=data['title'].strip(),
        priority=priority,
        due_date=due_date,
        status=status,
        estimated_duration=estimated_duration,
        min_block_size=min_block,
        max_block_size=max_block,
        recurrence_rule=recurrence_rule,
        recurrence_until=recurrence_until,
        description=data.get('description', '').strip() or None,
    )
    db.session.add(task)
    db.session.commit()
    return jsonify(task.to_dict()), 201


def _parse_optional_int(data, key):
    """Parse an optional integer field, returning None if absent/null."""
    val = data.get(key)
    if val is None:
        return None
    try:
        val = int(val)
        return val if val > 0 else None
    except (ValueError, TypeError):
        return None


def _generate_next_recurrence(task):
    """Generate the next instance of a recurring task."""
    if not task.recurrence_rule:
        return None

    # Determine base date to shift
    base_date = task.due_date if task.due_date else datetime.now()
    next_due = None

    if task.recurrence_rule == 'daily':
        next_due = base_date + timedelta(days=1)
    elif task.recurrence_rule == 'weekly':
        next_due = base_date + timedelta(days=7)
    elif task.recurrence_rule == 'monthly':
        # Simple month increment (handling Dec -> Jan)
        m = base_date.month % 12 + 1
        y = base_date.year + (base_date.month // 12)
        # Handle day overflow (e.g. Jan 31 -> Feb 28)
        import calendar
        d = min(base_date.day, calendar.monthrange(y, m)[1])
        next_due = base_date.replace(year=y, month=m, day=d)
    elif task.recurrence_rule == 'yearly':
        import calendar
        y = base_date.year + 1
        d = min(base_date.day, calendar.monthrange(y, base_date.month)[1])
        next_due = base_date.replace(year=y, day=d)

    # If it surpasses recurrence_until, do not spawn
    if task.recurrence_until and next_due > task.recurrence_until:
        return None
        
    next_task = Task(
        title=task.title,
        priority=task.priority,
        due_date=next_due,
        status='Pending',
        estimated_duration=task.estimated_duration,
        min_block_size=task.min_block_size,
        max_block_size=task.max_block_size,
        recurrence_rule=task.recurrence_rule,
        recurrence_until=task.recurrence_until,
        parent_task_id=task.parent_task_id or task.id
    )
    return next_task


@api_bp.route('/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    task = Task.query.get_or_404(task_id)
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    if 'title' in data:
        if not data['title'].strip():
            return jsonify({'error': 'Title cannot be empty'}), 400
        task.title = data['title'].strip()

    if 'priority' in data:
        if data['priority'] not in VALID_PRIORITIES:
            return jsonify({'error': f'Priority must be one of {VALID_PRIORITIES}'}), 400
        task.priority = data['priority']

    if 'status' in data:
        if data['status'] not in VALID_STATUSES:
            return jsonify({'error': f'Status must be one of {VALID_STATUSES}'}), 400
        old_status = task.status
        task.status = data['status']

        # Clean up future uncompleted, un-pinned blocks when task is marked Completed
        if data['status'] == 'Completed' and old_status != 'Completed':
            now = datetime.now()
            future_blocks = ScheduledBlock.query.filter(
                ScheduledBlock.task_id == task_id,
                ScheduledBlock.start_time > now,
                ScheduledBlock.is_completed == False,
                ScheduledBlock.is_pinned == False
            ).all()
            for block in future_blocks:
                db.session.delete(block)
            data['_cleaned_blocks'] = len(future_blocks)
            
            # Spawn next recurrence if applicable
            next_task = _generate_next_recurrence(task)
            if next_task:
                db.session.add(next_task)
                data['_spawned_recurrence'] = True

    if 'due_date' in data:
        if data['due_date'] is None:
            task.due_date = None
        else:
            try:
                task.due_date = datetime.fromisoformat(data['due_date'])
            except ValueError:
                return jsonify({'error': 'Invalid due_date format'}), 400

    if 'estimated_duration' in data:
        if data['estimated_duration'] is None:
            task.estimated_duration = None
        else:
            try:
                task.estimated_duration = int(data['estimated_duration'])
                if task.estimated_duration <= 0:
                    return jsonify({'error': 'estimated_duration must be a positive number'}), 400
            except (ValueError, TypeError):
                return jsonify({'error': 'estimated_duration must be an integer (minutes)'}), 400

    if 'min_block_size' in data:
        task.min_block_size = _parse_optional_int(data, 'min_block_size')
    if 'max_block_size' in data:
        task.max_block_size = _parse_optional_int(data, 'max_block_size')

    if 'recurrence_rule' in data:
        rule = data['recurrence_rule']
        if rule and rule not in VALID_RECURRENCES:
            return jsonify({'error': f'recurrence_rule must be one of {VALID_RECURRENCES}'}), 400
        task.recurrence_rule = rule or None

    if 'recurrence_until' in data:
        if data['recurrence_until'] is None:
            task.recurrence_until = None
        else:
            try:
                task.recurrence_until = datetime.fromisoformat(data['recurrence_until'])
            except ValueError:
                return jsonify({'error': 'Invalid recurrence_until format'}), 400

    if 'description' in data:
        task.description = data['description'].strip() if data['description'] else None

    db.session.commit()
    result = task.to_dict()
    if '_cleaned_blocks' in data:
        result['cleaned_blocks'] = data['_cleaned_blocks']
    if '_spawned_recurrence' in data:
        result['spawned_recurrence'] = data['_spawned_recurrence']
    return jsonify(result)


@api_bp.route('/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    task = Task.query.get_or_404(task_id)
    db.session.delete(task)
    db.session.commit()
    return '', 204


# ── Events ───────────────────────────────────────────────────────────────────

@api_bp.route('/events', methods=['GET'])
def get_events():
    start = request.args.get('start')
    end = request.args.get('end')

    query = Event.query
    if start:
        try:
            query = query.filter(Event.end_time >= datetime.fromisoformat(start))
        except ValueError:
            return jsonify({'error': 'Invalid start date format'}), 400
    if end:
        try:
            query = query.filter(Event.start_time <= datetime.fromisoformat(end))
        except ValueError:
            return jsonify({'error': 'Invalid end date format'}), 400

    events = query.order_by(Event.start_time).all()
    return jsonify([e.to_dict() for e in events])


@api_bp.route('/events', methods=['POST'])
def create_event():
    data = request.get_json()
    if not data or not data.get('title', '').strip():
        return jsonify({'error': 'Title is required'}), 400

    try:
        start_time = datetime.fromisoformat(data['start_time'])
        end_time = datetime.fromisoformat(data['end_time'])
    except (KeyError, ValueError):
        return jsonify({'error': 'start_time and end_time are required in ISO 8601 format'}), 400

    if end_time <= start_time:
        return jsonify({'error': 'end_time must be after start_time'}), 400

    calendar_id = data.get('calendar_id')

    # If user chose an Outlook calendar, create in Outlook first
    if calendar_id:
        token = session.get('access_token')
        if not token:
            return jsonify({'error': 'Not authenticated', 'auth_url': '/auth/login'}), 401

        cal = OutlookCalendar.query.get(calendar_id)
        if not cal:
            return jsonify({'error': 'Calendar not found'}), 404

        from app.sync import create_outlook_event
        try:
            result = create_outlook_event(token, cal.outlook_cal_id, data)
        except Exception as e:
            error_msg = str(e)
            if '401' in error_msg:
                return jsonify({'error': 'Token expired, please re-authenticate', 'auth_url': '/auth/login'}), 401
            return jsonify({'error': f'Outlook sync failed: {error_msg}'}), 502

        event = Event(
            title=data['title'].strip(),
            start_time=start_time,
            end_time=end_time,
            source='Outlook',
            outlook_id=result['id'],
            calendar_id=cal.id,
            calendar_name=cal.name,
            description=data.get('description', '').strip() or None,
            is_all_day=data.get('is_all_day', False),
        )
    else:
        event = Event(
            title=data['title'].strip(),
            start_time=start_time,
            end_time=end_time,
            source='Manual',
            description=data.get('description', '').strip() or None,
        )

    db.session.add(event)
    db.session.commit()
    return jsonify(event.to_dict()), 201


@api_bp.route('/events/<int:event_id>', methods=['PUT'])
def update_event(event_id):
    event = Event.query.get_or_404(event_id)
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    if 'title' in data:
        if not data['title'].strip():
            return jsonify({'error': 'Title cannot be empty'}), 400
        event.title = data['title'].strip()

    if 'start_time' in data:
        try:
            event.start_time = datetime.fromisoformat(data['start_time'])
        except ValueError:
            return jsonify({'error': 'Invalid start_time format'}), 400

    if 'end_time' in data:
        try:
            event.end_time = datetime.fromisoformat(data['end_time'])
        except ValueError:
            return jsonify({'error': 'Invalid end_time format'}), 400

    if 'description' in data:
        event.description = data['description'].strip() if data['description'] else None

    if event.end_time <= event.start_time:
        return jsonify({'error': 'end_time must be after start_time'}), 400

    # Sync changes to Outlook if this is an Outlook event
    if event.source == 'Outlook' and event.outlook_id:
        token = session.get('access_token')
        if not token:
            return jsonify({'error': 'Not authenticated – please log in to sync changes to Outlook', 'auth_url': '/auth/login'}), 401

        from app.sync import update_outlook_event
        try:
            update_outlook_event(token, event.outlook_id, {
                'title': event.title,
                'start_time': event.start_time,
                'end_time': event.end_time,
                'description': event.description or '',
                'is_all_day': event.is_all_day,
            })
        except Exception as e:
            error_msg = str(e)
            if '401' in error_msg:
                return jsonify({'error': 'Token expired, please re-authenticate', 'auth_url': '/auth/login'}), 401
            if '404' in error_msg:
                # Event was deleted in Outlook; remove locally too
                db.session.delete(event)
                db.session.commit()
                return jsonify({'error': 'Event no longer exists in Outlook (removed locally)'}), 404
            return jsonify({'error': f'Outlook sync failed: {error_msg}'}), 502

    db.session.commit()
    return jsonify(event.to_dict())


@api_bp.route('/events/<int:event_id>/toggle-schedule', methods=['POST'])
def toggle_event_schedule(event_id):
    """Toggle whether an event is excluded from schedule consideration."""
    event = Event.query.get_or_404(event_id)
    data = request.get_json() or {}
    if 'excluded_from_schedule' in data:
        event.excluded_from_schedule = bool(data['excluded_from_schedule'])
    else:
        event.excluded_from_schedule = not event.excluded_from_schedule
    db.session.commit()
    return jsonify(event.to_dict())


@api_bp.route('/events/<int:event_id>', methods=['DELETE'])
def delete_event(event_id):
    event = Event.query.get_or_404(event_id)

    # Delete from Outlook if applicable
    if event.source == 'Outlook' and event.outlook_id:
        token = session.get('access_token')
        if token:
            from app.sync import delete_outlook_event
            try:
                delete_outlook_event(token, event.outlook_id)
            except Exception as e:
                error_msg = str(e)
                if '401' in error_msg:
                    return jsonify({'error': 'Token expired, please re-authenticate', 'auth_url': '/auth/login'}), 401
                # If not a 404 (already deleted), report the error
                if '404' not in error_msg:
                    return jsonify({'error': f'Outlook delete failed: {error_msg}'}), 502

    db.session.delete(event)
    db.session.commit()
    return '', 204


# ── Outlook Calendars ─────────────────────────────────────────────────────

@api_bp.route('/calendars', methods=['GET'])
def get_calendars():
    """List all discovered Outlook calendars with their enabled state."""
    calendars = OutlookCalendar.query.order_by(
        OutlookCalendar.is_default.desc(),
        OutlookCalendar.name,
    ).all()
    return jsonify([c.to_dict() for c in calendars])


@api_bp.route('/calendars/<int:cal_id>/toggle', methods=['POST'])
def toggle_calendar(cal_id):
    """Toggle a calendar's enabled state for syncing."""
    cal = OutlookCalendar.query.get_or_404(cal_id)
    data = request.get_json()

    if data and 'is_enabled' in data:
        cal.is_enabled = bool(data['is_enabled'])
    else:
        cal.is_enabled = not cal.is_enabled

    db.session.commit()

    # If disabled, remove synced events from this calendar
    if not cal.is_enabled:
        Event.query.filter_by(calendar_id=cal.id, source='Outlook').delete()
        db.session.commit()

    return jsonify(cal.to_dict())


@api_bp.route('/calendars/refresh', methods=['POST'])
def refresh_calendars():
    """Re-fetch the calendar list from Microsoft Graph."""
    from app.sync import fetch_outlook_calendars

    token = session.get('access_token')
    if not token:
        return jsonify({'error': 'Not authenticated', 'auth_url': '/auth/login'}), 401

    try:
        calendars = fetch_outlook_calendars(token)
        return jsonify(calendars)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Scheduled Blocks ────────────────────────────────────────────────────────

@api_bp.route('/scheduled-blocks', methods=['GET'])
def get_scheduled_blocks():
    """List scheduled blocks, optionally filtered by date range or task."""
    start = request.args.get('start')
    end = request.args.get('end')
    task_id = request.args.get('task_id')

    query = ScheduledBlock.query
    if start:
        try:
            query = query.filter(ScheduledBlock.end_time >= datetime.fromisoformat(start))
        except ValueError:
            return jsonify({'error': 'Invalid start date format'}), 400
    if end:
        try:
            query = query.filter(ScheduledBlock.start_time <= datetime.fromisoformat(end))
        except ValueError:
            return jsonify({'error': 'Invalid end date format'}), 400
    if task_id:
        try:
            query = query.filter_by(task_id=int(task_id))
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid task_id — must be an integer'}), 400

    blocks = query.order_by(ScheduledBlock.start_time).all()
    return jsonify([b.to_dict() for b in blocks])


@api_bp.route('/scheduled-blocks', methods=['POST'])
def create_scheduled_block():
    """Schedule a time block for a task."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    task_id = data.get('task_id')
    if not task_id:
        return jsonify({'error': 'task_id is required'}), 400

    task = Task.query.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404

    try:
        start_time = datetime.fromisoformat(data['start_time'])
        end_time = datetime.fromisoformat(data['end_time'])
    except (KeyError, ValueError):
        return jsonify({'error': 'start_time and end_time are required in ISO 8601 format'}), 400

    if end_time <= start_time:
        return jsonify({'error': 'end_time must be after start_time'}), 400

    block = ScheduledBlock(
        task_id=task_id,
        start_time=start_time,
        end_time=end_time,
        is_pinned=bool(data.get('is_pinned', False)),
    )
    db.session.add(block)
    db.session.commit()
    return jsonify(block.to_dict()), 201


@api_bp.route('/scheduled-blocks/<int:block_id>', methods=['PUT'])
def update_scheduled_block(block_id):
    """Update a scheduled block's times."""
    block = ScheduledBlock.query.get_or_404(block_id)
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    if 'start_time' in data:
        try:
            block.start_time = datetime.fromisoformat(data['start_time'])
        except ValueError:
            return jsonify({'error': 'Invalid start_time format'}), 400

    if 'end_time' in data:
        try:
            block.end_time = datetime.fromisoformat(data['end_time'])
        except ValueError:
            return jsonify({'error': 'Invalid end_time format'}), 400

    if 'is_pinned' in data:
        block.is_pinned = bool(data['is_pinned'])

    if block.end_time <= block.start_time:
        return jsonify({'error': 'end_time must be after start_time'}), 400

    db.session.commit()
    return jsonify(block.to_dict())


@api_bp.route('/scheduled-blocks/<int:block_id>', methods=['DELETE'])
def delete_scheduled_block(block_id):
    block = ScheduledBlock.query.get_or_404(block_id)
    db.session.delete(block)
    db.session.commit()
    return '', 204


@api_bp.route('/scheduled-blocks/<int:block_id>/complete', methods=['POST'])
def complete_scheduled_block(block_id):
    """Mark a scheduled block as complete with optional actual duration."""
    block = ScheduledBlock.query.get_or_404(block_id)
    data = request.get_json() or {}

    block.is_completed = True

    # Use actual_duration if provided, otherwise use scheduled duration
    if 'actual_duration' in data and data['actual_duration'] is not None:
        try:
            block.actual_duration = int(data['actual_duration'])
        except (ValueError, TypeError):
            return jsonify({'error': 'actual_duration must be an integer (minutes)'}), 400
    else:
        scheduled_mins = round((block.end_time - block.start_time).total_seconds() / 60)
        block.actual_duration = scheduled_mins

    # Update the parent task status to In Progress if it was Pending
    task = block.task
    if task and task.status == 'Pending':
        task.status = 'In Progress'

    db.session.commit()

    # Check if completed time exceeds estimated duration
    response = block.to_dict()
    if task and task.estimated_duration:
        time_summary = task.get_time_summary()
        if time_summary['completed_minutes'] >= task.estimated_duration:
            response['prompt_completion'] = True
            response['task_id'] = task.id
            response['task_title'] = task.title
            response['completed_minutes'] = time_summary['completed_minutes']
            response['estimated_minutes'] = task.estimated_duration

    return jsonify(response)


@api_bp.route('/scheduled-blocks/<int:block_id>/toggle-pin', methods=['POST'])
def toggle_pin_block(block_id):
    """Toggle the pinned state of a scheduled block."""
    block = ScheduledBlock.query.get_or_404(block_id)
    data = request.get_json() or {}
    if 'is_pinned' in data:
        block.is_pinned = bool(data['is_pinned'])
    else:
        block.is_pinned = not block.is_pinned
    db.session.commit()
    return jsonify(block.to_dict())


# ── Shared scheduling helpers ─────────────────────────────────────────────────

GAP_MINUTES = 15  # minimum gap between scheduled blocks and events


def _get_free_slots(day, work_start, work_end, busy, min_block, now,
                    deadline=None, extra_blocked=None):
    """Compute free time slots for a given day.

    Returns list of (slot_start, slot_end, slot_minutes) tuples.
    """
    day_start = day.replace(hour=work_start, minute=0, second=0)
    day_end = day.replace(hour=work_end, minute=0, second=0)

    # For today, don't schedule in the past
    if day.date() == now.date():
        mins_past = now.hour * 60 + now.minute
        next_slot = ((mins_past // 15) + 1) * 15
        if next_slot >= 1440:
            # Past 23:45 — no more slots available today
            return []
        earliest = day.replace(hour=next_slot // 60, minute=next_slot % 60, second=0)
        day_start = max(day_start, earliest)

    # On deadline day, cap at the exact deadline time
    if deadline and day.date() == deadline.date():
        day_end = min(day_end, deadline)

    if day_start >= day_end:
        return []

    # Merge busy + extra_blocked, add GAP_MINUTES buffer
    all_busy = list(busy)
    if extra_blocked:
        all_busy.extend(extra_blocked)

    day_busy = []
    for s, e in all_busy:
        buf_start = s - timedelta(minutes=GAP_MINUTES)
        buf_end = e + timedelta(minutes=GAP_MINUTES)
        clamped_s = max(buf_start, day_start)
        clamped_e = min(buf_end, day_end)
        if clamped_s < clamped_e:
            day_busy.append((clamped_s, clamped_e))
    day_busy.sort(key=lambda x: x[0])

    slots = []
    cursor = day_start
    for bs, be in day_busy:
        if cursor < bs:
            gap = (bs - cursor).total_seconds() / 60
            if gap >= min_block:
                slots.append((cursor, bs, gap))
        cursor = max(cursor, be)
    if cursor < day_end:
        gap = (day_end - cursor).total_seconds() / 60
        if gap >= min_block:
            slots.append((cursor, day_end, gap))
    return slots


def _build_busy_list(start_date, end_date, work_start=0, work_end=24):
    """Build list of (start, end) busy periods from events and existing blocks.

    All-day events that are not excluded expand to fill the work hours of
    each day they span, so the scheduler won't place blocks on top of them.
    """
    events = Event.query.filter(
        Event.start_time <= end_date,
        Event.end_time >= start_date,
    ).all()
    existing_blocks = ScheduledBlock.query.filter(
        ScheduledBlock.start_time <= end_date,
        ScheduledBlock.end_time >= start_date,
    ).all()

    busy = []
    for e in events:
        if e.excluded_from_schedule:
            continue
        if e.is_all_day:
            # Expand all-day events into work-hours busy periods for each day
            d = e.start_time.replace(hour=0, minute=0, second=0)
            while d.date() <= e.end_time.date() and d <= end_date:
                day_start = d.replace(hour=work_start, minute=0, second=0)
                day_end = d.replace(hour=work_end, minute=0, second=0)
                if day_start < day_end:
                    busy.append((day_start, day_end))
                d += timedelta(days=1)
        else:
            busy.append((e.start_time, e.end_time))
    for b in existing_blocks:
        busy.append((b.start_time, b.end_time))
    busy.sort(key=lambda x: x[0])
    return busy


def _get_available_days(start_date, deadline, include_weekends):
    """Get list of available working days from start_date through deadline."""
    days = []
    d = start_date
    while d.date() <= deadline.date():
        if include_weekends or d.weekday() < 5:
            days.append(d)
        d += timedelta(days=1)
    return days


def _normalize_deadline(due_date):
    """If deadline has no time component, default to end-of-day."""
    if due_date.hour == 0 and due_date.minute == 0 and due_date.second == 0:
        return due_date.replace(hour=23, minute=59, second=59)
    return due_date


# ── Single-Task Auto-Schedule ─────────────────────────────────────────────────

@api_bp.route('/scheduled-blocks/auto-schedule', methods=['POST'])
def auto_schedule():
    """Automatically schedule time blocks for a task in free slots before its deadline."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    task_id = data.get('task_id')
    if not task_id:
        return jsonify({'error': 'task_id is required'}), 400

    task = Task.query.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404

    if not task.estimated_duration:
        return jsonify({'error': 'Task must have an estimated duration for auto-scheduling'}), 400

    if not task.due_date:
        return jsonify({'error': 'Task must have a due date for auto-scheduling'}), 400

    # How many minutes still need to be scheduled
    time_summary = task.get_time_summary()
    remaining = task.estimated_duration - time_summary['scheduled_minutes']
    if remaining <= 0:
        return jsonify({'error': 'Task already has enough time scheduled', 'blocks': []}), 200

    # Block size: per-task overrides > request defaults > global defaults
    default_min_block = data.get('min_block_size', 30)
    default_max_block = data.get('max_block_size', 120)
    min_block = task.min_block_size or default_min_block
    max_block = task.max_block_size or default_max_block
    if min_block > max_block:
        min_block = max_block

    work_start = data.get('work_start', 9)
    work_end = data.get('work_end', 17)
    include_weekends = data.get('include_weekends', False)

    # Priority weight for front-loading
    priority_weights = {'High': 1.5, 'Medium': 1.0, 'Low': 0.7}
    priority_weight = priority_weights.get(task.priority, 1.0)

    now = datetime.now()
    start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    deadline = _normalize_deadline(task.due_date)

    if deadline < now:
        return jsonify({
            'error': 'Deadline has already passed',
            'warning': 'not_enough_time',
            'blocks': [],
        }), 200

    available_days = _get_available_days(start_date, deadline, include_weekends)
    if not available_days:
        return jsonify({
            'error': 'No available days before the deadline',
            'warning': 'not_enough_time',
            'blocks': [],
        }), 200

    end_date = deadline + timedelta(days=1)
    busy = _build_busy_list(start_date, end_date, work_start, work_end)

    # Calculate free time per day
    num_days = len(available_days)
    total_free = 0
    day_free_minutes = {}
    for day in available_days:
        slots = _get_free_slots(day, work_start, work_end, busy, min_block, now, deadline)
        free = sum(s[2] for s in slots)
        day_free_minutes[day] = free
        total_free += free

    warning = None
    if total_free < remaining:
        warning = 'not_enough_time'

    # ── Variety-aware day targets ──────────────────────────────────────────
    # max_day_fill_ratio: how much of a day's free time this ONE task can use
    fill_ratios = {'High': 0.65, 'Medium': 0.50, 'Low': 0.35}
    max_day_fill = fill_ratios.get(task.priority, 0.50)

    # Deadline urgency: allow more aggressive filling when deadline is close
    if num_days <= 2:
        max_day_fill = min(max_day_fill + 0.30, 0.95)
    elif num_days <= 4:
        max_day_fill = min(max_day_fill + 0.15, 0.85)

    # Compute weighted targets with front-loading and fill cap
    raw_weights = []
    day_caps = []
    for i, day in enumerate(available_days):
        progress = i / max(num_days - 1, 1)
        weight = priority_weight + (1.0 - priority_weight) * progress
        if day.date() == now.date():
            weight *= 1.25
        raw_weights.append(weight)
        day_caps.append(day_free_minutes.get(day, 0) * max_day_fill)

    # Normalize weights and distribute remaining, capped by fill ratio
    total_weight = sum(raw_weights)
    if total_weight <= 0:
        total_weight = 1

    day_targets = []
    overflow = 0
    for w, cap in zip(raw_weights, day_caps):
        raw = (w / total_weight) * remaining + overflow
        alloc = min(raw, cap)
        overflow = max(0, raw - cap)
        day_targets.append(alloc)

    # Redistribute any remaining overflow
    if overflow > 0:
        for i in range(len(day_targets)):
            room = day_caps[i] - day_targets[i]
            if room > 0:
                add = min(overflow, room)
                day_targets[i] += add
                overflow -= add
            if overflow <= 0:
                break

    # Schedule blocks
    created_blocks = []
    minutes_left = remaining

    for i, day in enumerate(available_days):
        if minutes_left <= 0:
            break

        target = day_targets[i]
        day_scheduled = 0

        while minutes_left > 0 and day_scheduled < target:
            slots = _get_free_slots(day, work_start, work_end, busy, min_block, now, deadline)
            if not slots:
                break

            placed = False
            for slot_start, slot_end, slot_mins in slots:
                if minutes_left <= 0 or day_scheduled >= target:
                    break

                want = min(target - day_scheduled, minutes_left)
                block_mins = min(want, slot_mins, max_block)
                block_mins = max(block_mins, min(min_block, slot_mins, minutes_left))

                if block_mins < min_block and block_mins < minutes_left:
                    continue

                block_mins = min(block_mins, minutes_left)

                block_end_time = slot_start + timedelta(minutes=block_mins)
                block = ScheduledBlock(
                    task_id=task_id,
                    start_time=slot_start,
                    end_time=block_end_time,
                )
                db.session.add(block)
                created_blocks.append(block)
                minutes_left -= block_mins
                day_scheduled += block_mins

                busy.append((slot_start, block_end_time))
                busy.sort(key=lambda x: x[0])
                placed = True
                break

            if not placed:
                break

    db.session.commit()

    result = {
        'scheduled': len(created_blocks),
        'blocks': [b.to_dict() for b in created_blocks],
        'remaining_minutes': max(0, round(minutes_left)),
    }
    if warning:
        result['warning'] = warning
        result['total_free_minutes'] = round(total_free)
    return jsonify(result), 201


# ── Reschedule All Tasks ──────────────────────────────────────────────────────

@api_bp.route('/scheduled-blocks/reschedule-all', methods=['POST'])
def reschedule_all():
    """Wipe all un-pinned, uncompleted blocks (past + future) and reschedule all eligible tasks.

    Past uncompleted blocks represent missed work — deleting them frees up
    the scheduled-minutes budget so the algorithm can properly reschedule
    the full remaining duration for each task.
    """
    data = request.get_json() or {}

    work_start = data.get('work_start', 9)
    work_end = data.get('work_end', 17)
    include_weekends = data.get('include_weekends', False)
    default_min_block = data.get('min_block_size', 30)
    default_max_block = data.get('max_block_size', 120)
    blocked_ranges_raw = data.get('blocked_ranges', [])
    # Backwards compat: accept old today_blocked_ranges as today-only ranges
    today_blocked_raw = data.get('today_blocked_ranges', [])

    now = datetime.now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Parse recurring blocked ranges: each has start, end (HH:MM), and days (list of weekday ints 0-6)
    parsed_blocked_ranges = []
    for r in blocked_ranges_raw:
        try:
            sh, sm = map(int, r['start'].split(':'))
            eh, em = map(int, r['end'].split(':'))
            days = r.get('days', [0, 1, 2, 3, 4])  # default weekdays
            if eh * 60 + em > sh * 60 + sm:
                parsed_blocked_ranges.append({
                    'start_h': sh, 'start_m': sm,
                    'end_h': eh, 'end_m': em,
                    'days': set(days),
                })
        except (KeyError, ValueError, TypeError):
            continue

    # Backwards compat: parse old today_blocked_ranges as today-only
    for r in today_blocked_raw:
        try:
            sh, sm = map(int, r['start'].split(':'))
            eh, em = map(int, r['end'].split(':'))
            if eh * 60 + em > sh * 60 + sm:
                parsed_blocked_ranges.append({
                    'start_h': sh, 'start_m': sm,
                    'end_h': eh, 'end_m': em,
                    'days': {today.weekday()},  # only today
                })
        except (KeyError, ValueError):
            continue

    # Step 1: Delete all uncompleted, un-pinned blocks (past AND future)
    # Past uncompleted blocks represent missed work that should be rescheduled.
    stale_blocks = ScheduledBlock.query.filter(
        ScheduledBlock.is_completed == False,
        ScheduledBlock.is_pinned == False,
    ).all()
    deleted_count = len(stale_blocks)
    for b in stale_blocks:
        db.session.delete(b)
    db.session.flush()

    # Step 2: Gather eligible tasks
    eligible_tasks = Task.query.filter(
        Task.status != 'Completed',
        Task.estimated_duration != None,
        Task.estimated_duration > 0,
        Task.due_date != None,
        Task.due_date > now,
    ).all()

    task_entries = []
    for task in eligible_tasks:
        time_summary = task.get_time_summary()
        remaining = task.estimated_duration - time_summary['scheduled_minutes']
        if remaining <= 0:
            continue
        min_block = task.min_block_size or default_min_block
        max_block = task.max_block_size or default_max_block
        if min_block > max_block:
            min_block = max_block
        deadline = _normalize_deadline(task.due_date)
        task_entries.append({
            'task': task,
            'remaining': remaining,
            'min_block': min_block,
            'max_block': max_block,
            'deadline': deadline,
        })

    if not task_entries:
        db.session.commit()
        return jsonify({
            'deleted_count': deleted_count,
            'scheduled_count': 0,
            'tasks_scheduled': [],
            'warnings': [],
        }), 200

    # Step 3: Sort — High priority first, then nearest deadline
    priority_order = {'High': 0, 'Medium': 1, 'Low': 2}
    task_entries.sort(key=lambda e: (
        priority_order.get(e['task'].priority, 1),
        e['deadline'],
    ))

    # Step 4: Compute scheduling horizon
    latest_deadline = max(e['deadline'] for e in task_entries)
    end_date = latest_deadline + timedelta(days=1)
    available_days = _get_available_days(today, latest_deadline, include_weekends)

    if not available_days:
        db.session.commit()
        return jsonify({
            'deleted_count': deleted_count,
            'scheduled_count': 0,
            'tasks_scheduled': [],
            'warnings': [{'task_id': e['task'].id, 'title': e['task'].title,
                          'remaining_minutes': round(e['remaining'])}
                         for e in task_entries],
        }), 200

    # Step 5: Build busy list (events + surviving pinned/completed blocks)
    busy = _build_busy_list(today, end_date, work_start, work_end)

    # Step 6: Multi-task interleaving, day by day
    SLOT_RATIOS = {'High': 0.50, 'Medium': 0.35, 'Low': 0.15}
    created_blocks = []
    task_block_counts = {e['task'].id: 0 for e in task_entries}

    for day in available_days:
        if all(e['remaining'] <= 0 for e in task_entries):
            break

        # Compute blocked ranges for this specific day
        day_weekday = day.weekday()
        extra_blocked = []
        for br in parsed_blocked_ranges:
            if day_weekday in br['days']:
                bs = day.replace(hour=br['start_h'], minute=br['start_m'], second=0)
                be = day.replace(hour=br['end_h'], minute=br['end_m'], second=0)
                extra_blocked.append((bs, be))
        extra_blocked = extra_blocked or None

        # Global min_block for slot calculation
        global_min = min(e['min_block'] for e in task_entries if e['remaining'] > 0)

        # Eligible tasks for this day (deadline not yet passed)
        day_eligible = [e for e in task_entries
                        if e['remaining'] > 0 and e['deadline'].date() >= day.date()]
        if not day_eligible:
            continue

        # Compute total free time for this day
        day_slots = _get_free_slots(day, work_start, work_end, busy, global_min,
                                     now, latest_deadline, extra_blocked)
        total_free_today = sum(s[2] for s in day_slots)
        if total_free_today <= 0:
            continue

        # Budget allocation by priority level
        priority_groups = {'High': [], 'Medium': [], 'Low': []}
        for e in day_eligible:
            priority_groups[e['task'].priority].append(e)

        # Calculate effective ratios (redistribute unused priority budgets)
        active_ratios = {}
        unused_ratio = 0
        for pri in ['High', 'Medium', 'Low']:
            if priority_groups[pri]:
                active_ratios[pri] = SLOT_RATIOS[pri]
            else:
                unused_ratio += SLOT_RATIOS[pri]

        # Distribute unused ratio proportionally among active priorities
        if active_ratios and unused_ratio > 0:
            total_active = sum(active_ratios.values())
            for pri in active_ratios:
                active_ratios[pri] += unused_ratio * (active_ratios[pri] / total_active)

        # Compute per-task budget for today
        day_budgets = {}
        for pri, group in priority_groups.items():
            if not group:
                continue
            pri_budget = total_free_today * active_ratios.get(pri, 0)
            per_task = pri_budget / len(group)
            for e in group:
                day_budgets[e['task'].id] = min(per_task, e['remaining'])

        # Round-robin placement: cycle through eligible tasks in priority order
        placement_order = sorted(day_eligible, key=lambda e: (
            priority_order.get(e['task'].priority, 1),
            e['deadline'],
        ))

        task_day_placed = {e['task'].id: 0 for e in day_eligible}
        rr_idx = 0

        while True:
            placed_any = False
            attempts = len(placement_order)

            for offset in range(attempts):
                idx = (rr_idx + offset) % len(placement_order)
                entry = placement_order[idx]
                tid = entry['task'].id
                budget_left = day_budgets.get(tid, 0) - task_day_placed[tid]

                if budget_left < entry['min_block'] and budget_left < entry['remaining']:
                    continue
                if entry['remaining'] <= 0:
                    continue

                # Recalculate free slots after previous placements
                slots = _get_free_slots(day, work_start, work_end, busy,
                                         entry['min_block'], now, entry['deadline'],
                                         extra_blocked)
                if not slots:
                    continue

                # Find first suitable slot
                slot_placed = False
                for slot_start, slot_end, slot_mins in slots:
                    want = min(budget_left, entry['remaining'])
                    block_mins = min(want, slot_mins, entry['max_block'])
                    block_mins = max(block_mins, min(entry['min_block'], slot_mins,
                                                     entry['remaining']))

                    if block_mins < entry['min_block'] and block_mins < entry['remaining']:
                        continue

                    block_mins = min(block_mins, entry['remaining'])

                    block_end_time = slot_start + timedelta(minutes=block_mins)
                    block = ScheduledBlock(
                        task_id=tid,
                        start_time=slot_start,
                        end_time=block_end_time,
                    )
                    db.session.add(block)
                    created_blocks.append(block)

                    entry['remaining'] -= block_mins
                    task_day_placed[tid] += block_mins
                    task_block_counts[tid] = task_block_counts.get(tid, 0) + 1

                    busy.append((slot_start, block_end_time))
                    busy.sort(key=lambda x: x[0])

                    placed_any = True
                    slot_placed = True
                    rr_idx = (idx + 1) % len(placement_order)
                    break

                if slot_placed:
                    break

            if not placed_any:
                break

    db.session.commit()

    # Build response
    tasks_scheduled = []
    warnings = []
    for e in task_entries:
        t = e['task']
        blocks_created = task_block_counts.get(t.id, 0)
        remaining_mins = round(max(0, e['remaining']))
        tasks_scheduled.append({
            'task_id': t.id,
            'title': t.title,
            'priority': t.priority,
            'blocks_created': blocks_created,
            'remaining_minutes': remaining_mins,
        })
        if remaining_mins > 0:
            warnings.append({
                'task_id': t.id,
                'title': t.title,
                'remaining_minutes': remaining_mins,
            })

    return jsonify({
        'deleted_count': deleted_count,
        'scheduled_count': len(created_blocks),
        'tasks_scheduled': tasks_scheduled,
        'warnings': warnings,
    }), 200


# ── Jobs ──────────────────────────────────────────────────────────────────────

from app.models import JobSearch, JobListing, JobBoard

@api_bp.route('/job_searches', methods=['GET'])
def get_job_searches():
    searches = JobSearch.query.order_by(JobSearch.name).all()
    return jsonify([s.to_dict() for s in searches])

@api_bp.route('/job_searches', methods=['POST'])
def create_job_search():
    data = request.get_json()
    name = data.get('name', '').strip()
    query_str = data.get('query', '').strip()

    if not name or not query_str:
        return jsonify({'error': 'Name and query are required'}), 400

    search = JobSearch(name=name, search_term=query_str, is_active=data.get('is_active', True))
    db.session.add(search)
    db.session.commit()
    
    # Trigger an immediate background scrape for this new search specifically 
    # (or you could just run the generic scrape). We run the generic scrape 
    # in a background thread so the API response isn't delayed.
    import threading
    from scripts.scraper import _do_scrape
    from flask import current_app
    
    app = current_app._get_current_object()
    def background_scrape(app_context):
        with app_context:
            try:
                print("Running initial on-demand scrape for new search...")
                _do_scrape()
            except Exception as e:
                print(f"Error in background scrape: {e}")

    threading.Thread(target=background_scrape, args=(app.app_context(),)).start()

    return jsonify(search.to_dict()), 201

@api_bp.route('/job_searches/<int:search_id>', methods=['PUT'])
def update_job_search(search_id):
    search = JobSearch.query.get_or_404(search_id)
    data = request.get_json()
    
    if 'name' in data and data['name'].strip():
        search.name = data['name'].strip()
    if 'query' in data and data['query'].strip():
        search.search_term = data['query'].strip()
    if 'is_active' in data:
        search.is_active = bool(data['is_active'])

    db.session.commit()
    return jsonify(search.to_dict())

@api_bp.route('/job_searches/<int:search_id>', methods=['DELETE'])
def delete_job_search(search_id):
    search = JobSearch.query.get_or_404(search_id)
    db.session.delete(search)
    db.session.commit()
    return '', 204

@api_bp.route('/jobs', methods=['GET'])
def get_jobs():
    search_id = request.args.get('search_id', type=int)
    status = request.args.get('status')
    
    query = JobListing.query
    if search_id:
        query = query.filter_by(search_id=search_id)
    if status:
        query = query.filter_by(status=status)
        
    jobs = query.order_by(JobListing.date_found.desc()).all()
    return jsonify([j.to_dict() for j in jobs])

@api_bp.route('/jobs/<int:job_id>', methods=['PUT'])
def update_job(job_id):
    job = JobListing.query.get_or_404(job_id)
    data = request.get_json()
    
    if 'status' in data and data['status'] in ('New', 'Applied', 'Rejected'):
        job.status = data['status']
        db.session.commit()
        return jsonify(job.to_dict())
    
    return jsonify({'error': 'Invalid status'}), 400

@api_bp.route('/jobs/<int:job_id>', methods=['DELETE'])
def delete_job(job_id):
    job = JobListing.query.get_or_404(job_id)
    db.session.delete(job)
    db.session.commit()
    return '', 204

@api_bp.route('/jobs/scrape', methods=['POST'])
def trigger_scrape():
    import threading
    from scripts.scraper import _do_scrape, is_scraping_now
    from flask import current_app
    
    if is_scraping_now():
        return jsonify({'error': 'A scrape is already in progress'}), 409
        
    app = current_app._get_current_object()
    def background_scrape(app_context):
        with app_context:
            try:
                print("Running manual on-demand scrape...")
                _do_scrape()
            except Exception as e:
                print(f"Error in manual background scrape: {e}")

    threading.Thread(target=background_scrape, args=(app.app_context(),)).start()
    return jsonify({'message': 'Scrape triggered successfully in the background'}), 202

@api_bp.route('/jobs/scrape/status', methods=['GET'])
def scrape_status():
    from scripts.scraper import is_scraping_now
    return jsonify({'is_scraping': is_scraping_now()}), 200

# ---------------------------------------------------------------------------
# Job Boards API
# ---------------------------------------------------------------------------

@api_bp.route('/job_boards', methods=['GET'])
def get_job_boards():
    boards = JobBoard.query.all()
    return jsonify([b.to_dict() for b in boards])

@api_bp.route('/job_boards', methods=['POST'])
def create_job_board():
    data = request.get_json()
    name = data.get('name', '').strip()
    url = data.get('url', '').strip()

    if not name or not url:
        return jsonify({'error': 'Name and URL are required'}), 400

    board = JobBoard(name=name, url=url, is_active=data.get('is_active', True))
    db.session.add(board)
    db.session.commit()
    
    return jsonify(board.to_dict()), 201

@api_bp.route('/job_boards/<int:board_id>', methods=['PUT'])
def update_job_board(board_id):
    board = JobBoard.query.get_or_404(board_id)
    data = request.get_json()
    
    if 'name' in data and data['name'].strip():
        board.name = data['name'].strip()
    if 'url' in data and data['url'].strip():
        board.url = data['url'].strip()
    if 'is_active' in data:
        board.is_active = bool(data['is_active'])

    db.session.commit()
    return jsonify(board.to_dict())

@api_bp.route('/job_boards/<int:board_id>', methods=['DELETE'])
def delete_job_board(board_id):
    board = JobBoard.query.get_or_404(board_id)
    db.session.delete(board)
    db.session.commit()
    return '', 204
