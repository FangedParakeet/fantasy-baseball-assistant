import sys
from models.db import get_db_connection
from models.mlb_api import MlbApi
from models.player_hydrator import PlayerHydrator
from models.sync_status import SyncStatus
from models.player_game_log import PlayerGameLog
from models.team_game_log import TeamGameLog
from models.league_game_log import LeagueGameLog
from models.logger import logger

def main(force=False):
    conn = get_db_connection()
    mlb_api = MlbApi()
    sync_status = SyncStatus(conn)
    player_hydrator = PlayerHydrator(conn, mlb_api, sync_status)

    player_game_log = PlayerGameLog(conn)
    team_game_log = TeamGameLog(conn)
    league_game_log = LeagueGameLog(mlb_api, player_game_log, team_game_log)

    try:
        player_hydrator.hydrate_players(force)
        logger.info("Hydration complete.")
        logger.info("Computing rolling stats")
        league_game_log.compute_rolling_stats()
    except Exception as e:
        logger.exception("Error hydrating player lookup")
        sync_status.set_sync_status(player_hydrator.SYNC_NAME, "error", str(e))


if __name__ == "__main__":
    force = "--force" in sys.argv
    logger.info(f"Hydrating player data with force={force}")
    main(force=force)
