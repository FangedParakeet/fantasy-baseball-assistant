from datetime import datetime, timedelta
from models.logger import logger
from utils.constants import MAX_AGE_DAYS, BATCH_SIZE, ROLLING_WINDOWS

class DB_Recorder():
    def __init__(self, conn):
        self.conn = conn

    def get_latest_record_date(self, table_name):
        with self.conn.cursor() as cursor:
            cursor.execute(f"SELECT MAX(game_date) FROM {table_name}")
            row = cursor.fetchone()
            return row[0] if row[0] else None

    def purge_old_records(self, table_name):
        cutoff_date = datetime.today() - timedelta(days=MAX_AGE_DAYS)
        logger.info(f"Purging {table_name} older than {cutoff_date.date()}")
        with self.conn.cursor() as cursor:
            cursor.execute(f"DELETE FROM {table_name} WHERE game_date < %s", (cutoff_date.date(),))
        self.conn.commit()

    def batch_upsert(self, insert_query, rows):
        with self.conn.cursor() as cursor:
            try:
                # Convert DataFrame to list if needed
                if hasattr(rows, 'values'):
                    # It's a DataFrame, convert to list of tuples
                    rows_list = [tuple(row) for row in rows.values]
                else:
                    # It's already a list
                    rows_list = rows
                
                for batch in [rows_list[i:i + BATCH_SIZE] for i in range(0, len(rows_list), BATCH_SIZE)]:
                    cursor.executemany(insert_query, batch)
            except Exception as e:
                logger.warning(f"Failed to insert batch: {e}")
                self.conn.rollback()
            finally:
                self.conn.commit()

    def compute_rolling_stats(self, table_name, compute_query):
        logger.info(f"Computing {table_name} rolling stats")
        with self.conn.cursor() as cursor:
            for window in ROLLING_WINDOWS:
                cursor.execute(f"DELETE FROM {table_name} WHERE span_days = %s", (window,))

                cursor.execute(compute_query, ('overall', window, window))
        self.conn.commit()


