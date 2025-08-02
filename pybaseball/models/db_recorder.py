from datetime import datetime, timedelta
import pandas as pd
from models.logger import logger
from utils.constants import MAX_AGE_DAYS, BATCH_SIZE

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

    def purge_all_records(self, table_name):
        logger.info(f"Purging all records from {table_name}")
        with self.conn.cursor() as cursor:
            cursor.execute(f"DELETE FROM {table_name}")
        self.conn.commit()

    def purge_all_records_in_transaction(self, table_name):
        """Purge all records within the current transaction (no auto-commit)"""
        logger.info(f"Purging all records from {table_name}")
        with self.conn.cursor() as cursor:
            cursor.execute(f"DELETE FROM {table_name}")

    def batch_upsert(self, insert_query, rows):
        with self.conn.cursor() as cursor:
            try:
                # Convert DataFrame to list if needed
                if hasattr(rows, 'values'):
                    # It's a DataFrame, convert to list of tuples and handle NaN values
                    rows_list = []
                    for row in rows.values:
                        # Convert NaN values to None for SQL compatibility
                        processed_row = []
                        for val in row:
                            if pd.isna(val):
                                processed_row.append(None)
                            else:
                                processed_row.append(val)
                        rows_list.append(tuple(processed_row))
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

    def execute_query(self, query, params=None):
        with self.conn.cursor() as cursor:
            cursor.execute(query, params)
        self.conn.commit()

    def begin_transaction(self):
        """Start a new transaction"""
        self.conn.autocommit = False

    def commit_transaction(self):
        """Commit the current transaction"""
        self.conn.commit()
        self.conn.autocommit = True

    def rollback_transaction(self):
        """Rollback the current transaction"""
        self.conn.rollback()
        self.conn.autocommit = True

    def execute_query_in_transaction(self, query, params=None):
        """Execute a query within the current transaction (no auto-commit)"""
        with self.conn.cursor() as cursor:
            cursor.execute(query, params)


