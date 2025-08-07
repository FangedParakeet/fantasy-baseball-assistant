import sys
from models.db import get_db_connection
from models.api.espn_api import EspnApi
from models.api.mlb_api import MlbApi
from models.probable_pitchers import ProbablePitchers
from models.game_pitchers import GamePitchers
from models.player_lookups import PlayerLookups
from models.player_hydrator import PlayerHydrator
from models.sync_status import SyncStatus
from models.team_pitching_rotations import TeamPitchingRotations
from utils.logger import logger

def main(force=False):
    conn = None
    try:
        conn = get_db_connection()
        mlb_api = MlbApi()
        player_hydrator = PlayerHydrator(conn, mlb_api, SyncStatus(conn), PlayerLookups(conn))
        team_pitching_rotations = TeamPitchingRotations(conn, ProbablePitchers.PROBABLE_PITCHERS_TABLE, PlayerLookups.LOOKUP_TABLE, GamePitchers.GAME_PITCHERS_TABLE)
        probable_pitchers = ProbablePitchers(conn, EspnApi(), mlb_api, team_pitching_rotations)

        logger.info("Starting probable pitchers sync...")
        probable_pitchers.purge_old_probable_pitchers()
        probable_pitchers.purge_all_projected_pitchers()

        player_hydrator.hydrate_players(force)
        player_hydrator.update_active_team_rosters(force)

        probable_pitchers.upsert_all_probable_pitchers()
        player_hydrator.update_table_from_lookup(ProbablePitchers.PROBABLE_PITCHERS_TABLE)
        
        probable_pitchers.infer_projected_probable_pitchers()
        player_hydrator.update_table_from_lookup(ProbablePitchers.PROBABLE_PITCHERS_TABLE)

        logger.info("Probable pitchers sync complete.")
    except Exception as e:
        logger.exception("Error syncing probable pitchers: {e}")
    finally:
        if conn:
            conn.close()
            logger.info("Database connection closed.")

if __name__ == "__main__":
    force = "--force" in sys.argv
    logger.info(f"Syncing probable pitchers with force={force}")
    main(force=force)
