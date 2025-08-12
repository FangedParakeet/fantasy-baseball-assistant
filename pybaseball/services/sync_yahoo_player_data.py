import sys
from models.db import get_db_connection
from models.yahoo_token import YahooToken
from models.api.yahoo_api import YahooApi
from models.yahoo_player_hydrator import YahooPlayerHydrator
from models.sync_status import SyncStatus
from models.player_lookups import PlayerLookups
from utils.logger import logger

def main(force: bool=False):
    conn = None
    try:
        conn = get_db_connection()
        sync_status = SyncStatus(conn)
        yahoo_api = YahooApi(YahooToken(conn))
        yahoo_player_hydrator = YahooPlayerHydrator(conn, sync_status, yahoo_api, PlayerLookups(conn))

        logger.info("Starting Yahoo player data sync...")
        yahoo_player_hydrator.hydrate_all_players(force)

        logger.info("Yahoo player data sync complete.")
    except Exception as e:
        logger.exception("Error syncing Yahoo player data: {e}")
        sync_status.set_sync_status(YahooPlayerHydrator.HYDRATE_ALL_YAHOO_PLAYERS_SYNC_NAME, 'error', str(e))
    finally:
        if conn:
            conn.close()
            logger.info("Database connection closed.")

if __name__ == "__main__":
    force = "--force" in sys.argv
    logger.info(f"Hydrating Yahoo player data with force={force}")
    main(force=force)
