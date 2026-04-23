from flask import Blueprint, request, jsonify
from app import db
from app.models import Note
from datetime import datetime

notes_bp = Blueprint('notes', __name__)


@notes_bp.route('', methods=['GET'])
def list_notes():
    notes = Note.query.order_by(Note.updated_at.desc()).all()
    return jsonify([n.to_dict(full=False) for n in notes])


@notes_bp.route('/<int:note_id>', methods=['GET'])
def get_note(note_id):
    note = Note.query.get_or_404(note_id)
    return jsonify(note.to_dict())


@notes_bp.route('', methods=['POST'])
def create_note():
    data = request.get_json() or {}
    title = (data.get('title') or 'Untitled').strip()
    content = data.get('content', '')
    note = Note(title=title, content=content)
    db.session.add(note)
    db.session.commit()
    return jsonify(note.to_dict()), 201


@notes_bp.route('/<int:note_id>', methods=['PATCH'])
def update_note(note_id):
    note = Note.query.get_or_404(note_id)
    data = request.get_json() or {}
    if 'title' in data:
        note.title = (data['title'] or 'Untitled').strip()
    if 'content' in data:
        note.content = data['content']
    note.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(note.to_dict())


@notes_bp.route('/<int:note_id>/append', methods=['POST'])
def append_note(note_id):
    note = Note.query.get_or_404(note_id)
    data = request.get_json() or {}
    text = data.get('text', '')
    if not text:
        return jsonify({'error': 'text is required'}), 400
    note.content = (note.content or '') + text
    note.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(note.to_dict())


@notes_bp.route('/<int:note_id>', methods=['DELETE'])
def delete_note(note_id):
    note = Note.query.get_or_404(note_id)
    db.session.delete(note)
    db.session.commit()
    return '', 204
