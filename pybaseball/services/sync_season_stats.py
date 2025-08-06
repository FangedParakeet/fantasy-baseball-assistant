from models.db import get_db_connection
from models.api.fangraphs_api import FangraphsApi
from models.fangraphs_stats import FangraphsStats
from models.player_lookups import PlayerLookups
from utils.logger import logger

def main():
    conn = get_db_connection()
    fangraphs_stats = FangraphsStats(conn, FangraphsApi(), PlayerLookups(conn))
    try:
        logger.info("Starting season stats sync...")
        fangraphs_stats.update_all_player_stats()
        logger.info("Season stats sync complete.")
    except Exception as e:
        logger.exception("Error syncing season stats: {e}")

if __name__ == "__main__":
    main() 