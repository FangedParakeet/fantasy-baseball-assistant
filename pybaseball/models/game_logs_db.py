from models.db_recorder import DB_Recorder
from models.game_logs.logs_inserter import LogsInserter

class GameLogsDB(DB_Recorder):
    def __init__(self, conn, game_logs_table):
        self.conn = conn
        self.game_logs_table = game_logs_table
        super().__init__(conn)

    def upsert_game_logs(self, game_logs: LogsInserter):
        if game_logs.is_empty():
            return

        insert_query = f"""
            INSERT INTO {self.game_logs_table} ({game_logs.get_insert_keys()})
            VALUES ({game_logs.get_placeholders()})
            ON DUPLICATE KEY UPDATE {game_logs.get_duplicate_update_keys()}
        """
        self.batch_upsert(insert_query, game_logs.get_rows())

    def get_latest_game_log_date(self):
        return super().get_latest_record_date(self.game_logs_table)

    def purge_old_game_logs(self):
        return super().purge_old_records(self.game_logs_table)
