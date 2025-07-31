from datetime import datetime, timedelta, timezone

class SyncStatus:
    THROTTLE_HOURS = 24
    SYNC_STATUS_TABLE = "sync_status"

    def __init__(self, conn):
        self.conn = conn

    def should_sync(self, sync_name: str, force=False):
        with self.conn.cursor() as cursor:
            cursor.execute(f"SELECT last_run FROM {self.SYNC_STATUS_TABLE} WHERE sync_name = %s AND status = 'success'", (sync_name,))
            row = cursor.fetchone()
            if not row:
                return True
            last_run = row[0]
            return force or (datetime.now(timezone.utc) - last_run.replace(tzinfo=timezone.utc) > timedelta(hours=self.THROTTLE_HOURS))

    def set_sync_status(self, sync_name: str, status: str, message: str=None):
        with self.conn.cursor() as cursor:
            cursor.execute("""
            INSERT INTO {self.SYNC_STATUS_TABLE} (sync_name, status, message, last_run)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                message = VALUES(message),
                last_run = VALUES(last_run)
            """, (sync_name, status, message, datetime.now(timezone.utc)))
        self.conn.commit()
