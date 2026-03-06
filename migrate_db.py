import sqlite3
import os

db_path = os.path.join('instance', 'schedule.db')
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Try adding the columns. If they already exist, sqlite will throw an error and we just catch it.
    try:
        cursor.execute("ALTER TABLE tasks ADD COLUMN recurrence_rule VARCHAR(50)")
        print("Added recurrence_rule column")
    except sqlite3.OperationalError as e:
        print(f"Column recurrence_rule: {e}")
        
    try:
        cursor.execute("ALTER TABLE tasks ADD COLUMN recurrence_until DATETIME")
        print("Added recurrence_until column")
    except sqlite3.OperationalError as e:
        print(f"Column recurrence_until: {e}")
        
    try:
        cursor.execute("ALTER TABLE tasks ADD COLUMN parent_task_id INTEGER REFERENCES tasks(id)")
        print("Added parent_task_id column")
    except sqlite3.OperationalError as e:
        print(f"Column parent_task_id: {e}")

    conn.commit()
    conn.close()
    print("Migration complete.")
else:
    print(f"Database not found at {db_path}")
