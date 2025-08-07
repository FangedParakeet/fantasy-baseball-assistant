from models.db import get_db_connection
from models.api.fangraphs_api import FangraphsApi
from models.fangraphs_stats import FangraphsStats
from models.api.savant_api import SavantApi
from models.savant_stats import SavantStats
from models.player_lookups import PlayerLookups
from utils.logger import logger

def main():
    conn = None
    try:
        conn = get_db_connection()
        fangraphs_stats = FangraphsStats(conn, FangraphsApi(), PlayerLookups(conn))
        savant_stats = SavantStats(conn, SavantApi())
        
        logger.info("Starting season stats sync...")
        fangraphs_stats.update_all_player_stats()
        fangraphs_stats.update_all_team_stats()
        savant_stats.update_all_statcast_player_stats()
        logger.info("Season stats sync complete.")
    except Exception as e:
        logger.exception("Error syncing season stats: {e}")
    finally:
        if conn:
            conn.close()
            logger.info("Database connection closed.")

if __name__ == "__main__":
    main() 