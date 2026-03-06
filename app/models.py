from app import db
from datetime import datetime


class Task(db.Model):
    __tablename__ = 'tasks'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    priority = db.Column(db.String(10), nullable=False, default='Medium')
    due_date = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String(20), nullable=False, default='Pending')
    estimated_duration = db.Column(db.Integer, nullable=True)  # minutes
    min_block_size = db.Column(db.Integer, nullable=True)  # minutes
    max_block_size = db.Column(db.Integer, nullable=True)  # minutes
    created_at = db.Column(db.DateTime, default=datetime.now)

    scheduled_blocks = db.relationship('ScheduledBlock', backref='task', lazy=True,
                                        cascade='all, delete-orphan')

    def get_time_summary(self):
        """Return scheduled and completed minutes for this task."""
        blocks = ScheduledBlock.query.filter_by(task_id=self.id).all()
        scheduled = sum((b.end_time - b.start_time).total_seconds() / 60 for b in blocks)
        completed = sum(b.actual_duration for b in blocks if b.is_completed and b.actual_duration)
        return {
            'scheduled_minutes': round(scheduled),
            'completed_minutes': round(completed),
            'block_count': len(blocks),
            'completed_count': sum(1 for b in blocks if b.is_completed),
        }

    def to_dict(self):
        time_summary = self.get_time_summary()
        est = self.estimated_duration or 0
        scheduled = time_summary['scheduled_minutes']
        # scheduling_status: 'fully_scheduled', 'partially_scheduled', 'not_scheduled'
        if est <= 0:
            sched_status = None
        elif scheduled >= est:
            sched_status = 'fully_scheduled'
        elif scheduled > 0:
            sched_status = 'partially_scheduled'
        else:
            sched_status = 'not_scheduled'

        return {
            'id': self.id,
            'title': self.title,
            'priority': self.priority,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'status': self.status,
            'estimated_duration': self.estimated_duration,
            'min_block_size': self.min_block_size,
            'max_block_size': self.max_block_size,
            'created_at': self.created_at.isoformat(),
            'time_scheduled': time_summary['scheduled_minutes'],
            'time_completed': time_summary['completed_minutes'],
            'block_count': time_summary['block_count'],
            'completed_count': time_summary['completed_count'],
            'scheduling_status': sched_status,
        }

    def __repr__(self):
        return f'<Task {self.title}>'


class OutlookCalendar(db.Model):
    __tablename__ = 'outlook_calendars'

    id = db.Column(db.Integer, primary_key=True)
    outlook_cal_id = db.Column(db.String(500), nullable=False, unique=True)
    name = db.Column(db.String(200), nullable=False)
    owner_name = db.Column(db.String(200), nullable=True)
    color = db.Column(db.String(50), nullable=True)
    is_default = db.Column(db.Boolean, default=False)
    is_enabled = db.Column(db.Boolean, default=True)
    last_synced_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        return {
            'id': self.id,
            'outlook_cal_id': self.outlook_cal_id,
            'name': self.name,
            'owner_name': self.owner_name,
            'color': self.color,
            'is_default': self.is_default,
            'is_enabled': self.is_enabled,
            'last_synced_at': self.last_synced_at.isoformat() if self.last_synced_at else None,
        }

    def __repr__(self):
        return f'<OutlookCalendar {self.name}>'


class Event(db.Model):
    __tablename__ = 'events'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime, nullable=False)
    source = db.Column(db.String(50), nullable=False, default='Manual')
    outlook_id = db.Column(db.String(200), nullable=True, unique=True)
    calendar_id = db.Column(db.Integer, db.ForeignKey('outlook_calendars.id'), nullable=True)
    calendar_name = db.Column(db.String(200), nullable=True)
    description = db.Column(db.Text, nullable=True)
    is_all_day = db.Column(db.Boolean, default=False)
    excluded_from_schedule = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'start_time': self.start_time.isoformat(),
            'end_time': self.end_time.isoformat(),
            'source': self.source,
            'outlook_id': self.outlook_id,
            'calendar_id': self.calendar_id,
            'calendar_name': self.calendar_name,
            'description': self.description,
            'is_all_day': self.is_all_day,
            'excluded_from_schedule': self.excluded_from_schedule,
            'created_at': self.created_at.isoformat(),
        }

    def __repr__(self):
        return f'<Event {self.title}>'


class ScheduledBlock(db.Model):
    __tablename__ = 'scheduled_blocks'

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id'), nullable=False)
    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime, nullable=False)
    is_completed = db.Column(db.Boolean, default=False)
    actual_duration = db.Column(db.Integer, nullable=True)  # minutes actually spent
    is_pinned = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        scheduled_minutes = round((self.end_time - self.start_time).total_seconds() / 60)
        return {
            'id': self.id,
            'task_id': self.task_id,
            'task_title': self.task.title if self.task else None,
            'task_priority': self.task.priority if self.task else None,
            'start_time': self.start_time.isoformat(),
            'end_time': self.end_time.isoformat(),
            'is_completed': self.is_completed,
            'is_pinned': self.is_pinned,
            'actual_duration': self.actual_duration,
            'scheduled_minutes': scheduled_minutes,
            'created_at': self.created_at.isoformat(),
        }

    def __repr__(self):
        return f'<ScheduledBlock task={self.task_id} {self.start_time}>'
