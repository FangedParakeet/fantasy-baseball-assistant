from utils.logger import logger
from models.game_logs_db import GameLogsDB
from models.game_logs.logs_inserter import LogsInserter

class GamePitchers(GameLogsDB):
    GAME_PITCHERS_TABLE = "game_pitchers"

    def __init__(self, conn):
        self.conn = conn
        super().__init__(conn, self.GAME_PITCHERS_TABLE)

    def upsert_game_pitchers(self, game_pitchers: LogsInserter):
        if game_pitchers.is_empty():
            logger.info("No game pitchers to insert")
            return
        
        logger.info(f"Upserting {game_pitchers.get_row_count()} game pitchers")
        super().upsert_game_logs(game_pitchers)
