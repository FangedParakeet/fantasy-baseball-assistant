from utils.logger import logger
from models.db_recorder import DB_Recorder
from models.player_game_logs import PlayerGameLogs
from models.probable_pitchers import ProbablePitchers
from datetime import datetime, timedelta, timezone
from models.game_logs.logs_inserter import LogsInserter

class PlayerLookups(DB_Recorder):
    LOOKUP_TABLE = "player_lookup"
    ID_KEYS = ['player_id']
    MAX_STALE_DAYS = 1

    def __init__(self, conn, mlb_api=None):
        self.conn = conn
        self.mlb_api = mlb_api
        self.player_game_logs_table = PlayerGameLogs.GAME_LOGS_TABLE
        self.probable_pitchers_table = ProbablePitchers.PROBABLE_PITCHERS_TABLE


    def insert_rows_into_lookup_table(self, all_rows: LogsInserter):
        insert_query = f"""
            INSERT INTO {self.LOOKUP_TABLE} ({all_rows.get_insert_keys()})
            VALUES ({all_rows.get_placeholders()})
            ON DUPLICATE KEY UPDATE 
                {all_rows.get_duplicate_update_keys()}
        """
        self.batch_upsert(insert_query, all_rows.get_rows())

    def set_unrostered_players_to_inactive(self, active_player_ids: list[int]):
        update_query = f"""
            UPDATE {self.LOOKUP_TABLE}
            SET status = 'Inactive'
            WHERE player_id NOT IN ({','.join(map(str, active_player_ids))})
        """
        self.execute_query(update_query)

    def update_player_game_log_names_from_lookup(self):
        logger.info("Updating player game log names from lookup table")
        try:
            update_query = f"""
                UPDATE {self.player_game_logs_table} pgl
                JOIN {self.LOOKUP_TABLE} pl ON pgl.player_id = pl.player_id
                SET pgl.normalised_name = pl.normalised_name
                WHERE pgl.normalised_name IS NULL
            """
            self.execute_query(update_query)
            logger.info("Player game log names updated successfully")
        except Exception as e:
            logger.error(f"Error updating player game log names from lookup table: {e}")

    def update_probable_pitchers_from_lookup(self):
        logger.info("Updating probable pitchers from lookup table")
        try:
            update_query_null_player_id = f"""
                UPDATE {self.probable_pitchers_table} pp
                JOIN {self.LOOKUP_TABLE} pl ON pp.normalised_name = pl.normalised_name
                SET pp.player_id = pl.player_id
            """

            update_query_null_normalised_name = f"""
                UPDATE {self.probable_pitchers_table} pp
                JOIN {self.LOOKUP_TABLE} pl ON pp.player_id = pl.player_id
                SET pp.normalised_name = pl.normalised_name
            """

            self.execute_query(update_query_null_player_id)
            self.execute_query(update_query_null_normalised_name)
            logger.info("Probable pitchers updated successfully")
        except Exception as e:
            logger.error(f"Error updating probable pitchers from lookup table: {e}")

    def get_stale_player_ids(self) -> list[int]:
        with self.conn.cursor() as cursor:
            # Calculate the stale date threshold
            stale_date = datetime.now(timezone.utc) - timedelta(days=self.MAX_STALE_DAYS)
            
            # Subquery 1: From player_game_logs
            cursor.execute(f"""
                SELECT DISTINCT pgl.player_id
                FROM {self.player_game_logs_table} pgl
                LEFT JOIN {self.LOOKUP_TABLE} pl ON pgl.player_id = pl.player_id
                WHERE pl.status IS NULL OR pl.status IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.bats IS NULL OR pl.bats IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.throws IS NULL OR pl.throws IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.last_updated IS NULL OR pl.last_updated < %s
            """, (stale_date,))
            ids_game_log = [row[0] for row in cursor.fetchall()]

            # Subquery 2: From player_lookup where status, bats, or throws is null or stale
            cursor.execute(f"""
                SELECT DISTINCT pl.player_id
                FROM {self.LOOKUP_TABLE} pl
                WHERE pl.status IS NULL OR pl.status IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.bats IS NULL OR pl.bats IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.throws IS NULL OR pl.throws IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.last_updated IS NULL OR pl.last_updated < %s
            """, (stale_date,))
            ids_lookup = [row[0] for row in cursor.fetchall()]

        all_ids = ids_lookup + ids_game_log
        return list(set(id for id in all_ids if id is not None))