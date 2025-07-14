from models.db import get_db_connection
from datetime import datetime

def update_sync_status(sync_name, status, message=None):
    conn = get_db_connection()
    with conn.cursor() as cursor:
        cursor.execute("""
            INSERT INTO sync_status (sync_name, status, message, last_run)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
              status = VALUES(status),
              message = VALUES(message),
              last_run = VALUES(last_run),
              updated_at = CURRENT_TIMESTAMP
        """, (sync_name, status, message, datetime.now()))
    conn.commit()
