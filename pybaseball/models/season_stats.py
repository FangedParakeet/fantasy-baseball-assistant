from models.db_recorder import DB_Recorder
from models.game_logs.logs_inserter import LogsInserter
from utils.logger import logger

class SeasonStats(DB_Recorder):
    PLAYER_STATS_TABLE = 'player_season_stats'
    TEAM_STATS_TABLE = 'team_season_stats'

    def __init__(self, conn):
        super().__init__(conn)

    def upsert_stats(self, table_name: str, all_stats: LogsInserter):
        if all_stats.is_empty():
            logger.info("No stats to upsert")
            return
        
        insert_query = f"""
            INSERT INTO {table_name} ({all_stats.get_insert_keys()})
            VALUES ({all_stats.get_placeholders()})
            ON DUPLICATE KEY UPDATE
                {all_stats.get_duplicate_update_keys()}
        """
        self.batch_upsert(insert_query, all_stats.get_rows())