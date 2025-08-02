import sys
from models.db import get_db_connection
from models.mlb_api import MlbApi
from models.player_hydrator import PlayerHydrator
from models.sync_status import SyncStatus
from models.player_game_log import PlayerGameLog
from models.team_game_log import TeamGameLog
from models.league_game_log import LeagueGameLog
from models.game_pitchers import GamePitchers
from models.league_statistics import LeagueStatistics
from models.logger import logger
from models.player_basic_rolling_stats import PlayerBasicRollingStats
from models.player_advanced_rolling_stats import PlayerAdvancedRollingStats
from models.rolling_stats_percentiles import RollingStatsPercentiles

def main(force=False):
    conn = get_db_connection()
    mlb_api = MlbApi()
    sync_status = SyncStatus(conn)
    player_hydrator = PlayerHydrator(conn, mlb_api, sync_status)

    rolling_stats_percentiles = RollingStatsPercentiles(conn)
    player_basic_rolling_stats = PlayerBasicRollingStats(conn, rolling_stats_percentiles)
    player_advanced_rolling_stats = PlayerAdvancedRollingStats(conn, rolling_stats_percentiles)
    player_game_log = PlayerGameLog(conn, None, player_basic_rolling_stats, player_advanced_rolling_stats)
    team_game_log = TeamGameLog(conn)
    game_pitchers = GamePitchers(conn)
    league_statistics = LeagueStatistics(conn)
    league_game_log = LeagueGameLog(mlb_api, player_game_log, team_game_log, game_pitchers, league_statistics)

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
