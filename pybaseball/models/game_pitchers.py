from models.logger import logger
from models.game_log import GameLog

class GamePitchers(GameLog):
    GAME_PITCHERS_TABLE = "game_pitchers"

    def __init__(self, conn):
        self.conn = conn
        super().__init__(conn, self.GAME_PITCHERS_TABLE)

    def upsert_game_pitchers(self, rows):
        if len(rows) == 0:
            logger.info("No game pitchers to insert")
            return
        
        logger.info(f"Upserting {len(rows)} game pitchers")
        insert_query = f"""
            INSERT INTO {self.GAME_PITCHERS_TABLE} (
                game_id, home_team, away_team,
                home_pitcher_id, away_pitcher_id,
                game_date
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                home_pitcher_id = VALUES(home_pitcher_id),
                away_pitcher_id = VALUES(away_pitcher_id)
        """
        self.batch_upsert(insert_query, rows)
