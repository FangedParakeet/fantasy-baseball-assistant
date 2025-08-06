from models.db import get_db_connection
from models.api.mlb_api import MlbApi
from models.player_hydrator import PlayerHydrator
from models.sync_status import SyncStatus
from models.player_lookups import PlayerLookups
from models.player_game_logs import PlayerGameLogs
from models.team_game_logs import TeamGameLogs
from models.league_game_logs import LeagueGameLogs
from models.game_pitchers import GamePitchers
from utils.logger import logger
        
def main():
    conn = get_db_connection()
    mlb_api = MlbApi()
    player_hydrator = PlayerHydrator(conn, mlb_api, SyncStatus(conn), PlayerLookups(conn))
    league_game_logs = LeagueGameLogs(mlb_api, PlayerGameLogs(conn), TeamGameLogs(conn), GamePitchers(conn))

    try:
        logger.info("Starting game logs sync...")
        league_game_logs.purge_old_game_logs()

        games = league_game_logs.fetch_game_logs()
        league_game_logs.upsert_game_logs(games)

        player_hydrator.update_table_from_lookup(PlayerGameLogs.GAME_LOGS_TABLE)
        
        logger.info("Game logs sync complete.")
    except Exception as e:
        logger.exception("Error syncing game logs: {e}")

if __name__ == "__main__":
    main() 