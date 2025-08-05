from utils.logger import logger
from models.game_logs_db import GameLogsDB
from models.game_logs.logs_inserter import LogsInserter

class PlayerGameLogs(GameLogsDB):
    GAME_LOGS_TABLE = "player_game_logs"
    BASIC_ROLLING_STATS_TABLE = "player_rolling_stats"
    ADVANCED_ROLLING_STATS_TABLE = "player_advanced_rolling_stats"

    def __init__(self, conn, player_basic_rolling_stats=None, player_advanced_rolling_stats=None):
        self.conn = conn
        self.player_basic_rolling_stats = player_basic_rolling_stats
        self.player_advanced_rolling_stats = player_advanced_rolling_stats
        super().__init__(conn, self.GAME_LOGS_TABLE)

    def upsert_game_logs(self, player_game_logs: LogsInserter):
        """Upsert player game logs to database"""
        if player_game_logs.is_empty():
            logger.info("No player game logs to insert")
            return
        
        logger.info(f"Upserting {player_game_logs.get_row_count()} player game logs")
        
        super().upsert_game_logs(player_game_logs)

    def compute_rolling_stats(self):
        self.player_basic_rolling_stats.compute_rolling_stats()
        self.player_advanced_rolling_stats.compute_rolling_stats()