from utils.logger import logger
from models.db_recorder import DB_Recorder
from models.player_game_logs import PlayerGameLogs
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

    def update_player_names_from_lookup(self, table: str, matching_conditions: list[str] = []):
        logger.info(f"Updating player names from lookup table for {table}")
        try:
            default_join_conditions = ["t.player_id = pl.player_id"]
            join_conditions = default_join_conditions + [f"t.{condition} = pl.{condition}" for condition in matching_conditions]
            conditions_str = " AND ".join(join_conditions)
            update_query = f"""
                UPDATE {table} t
                JOIN {self.LOOKUP_TABLE} pl ON {conditions_str}
                SET t.normalised_name = pl.normalised_name
                WHERE t.normalised_name IS NULL
            """
            self.execute_query(update_query)
            logger.info(f"Player names updated successfully for {table}")
        except Exception as e:
            logger.error(f"Error updating player names from lookup table for {table}: {e}")

    def update_player_ids_from_lookup(self, table: str, matching_conditions: dict = {}):
        logger.info(f"Updating player ids from lookup table for {table}")
        try:
            default_join_conditions = ["t.normalised_name = pl.normalised_name"]
            join_conditions = default_join_conditions + [f"t.{key} = pl.{value}" for key, value in matching_conditions.items()]
            conditions_str = " AND ".join(join_conditions)
            update_query = f"""
                UPDATE {table} t
                JOIN {self.LOOKUP_TABLE} pl ON {conditions_str}
                SET t.player_id = pl.player_id
                WHERE t.player_id IS NULL
            """
            self.execute_query(update_query)
            logger.info(f"Player ids updated successfully for {table}")
        except Exception as e:
            logger.error(f"Error updating player ids from lookup table for {table}: {e}")

    def update_lookup_fields_from_table(self, table: str, fields: list[str]):
        logger.info(f"Updating lookup fields from {table} for {fields}")
        try:
            update_fields = ", ".join([f"pl.{field} = t.{field}" for field in fields])
            where_clause = " AND ".join([f"pl.{field} IS NULL" for field in fields])
            update_query = f"""
                UPDATE {self.LOOKUP_TABLE} pl
                JOIN {table} t ON pl.player_id = t.player_id
                SET {update_fields}
                WHERE {where_clause}
            """
            self.execute_query(update_query)
            logger.info(f"Lookup fields updated successfully for {table}")
        except Exception as e:
            logger.error(f"Error updating lookup fields from {table} for {fields}: {e}")

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