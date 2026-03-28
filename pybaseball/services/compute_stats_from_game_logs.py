import sys
import argparse
from models.db import get_db_connection
from models.api.mlb_api import MlbApi
from models.player_hydrator import PlayerHydrator
from models.player_lookups import PlayerLookups
from models.sync_status import SyncStatus
from models.player_game_logs import PlayerGameLogs
from models.team_game_logs import TeamGameLogs
from models.league_game_logs import LeagueGameLogs
from models.game_pitchers import GamePitchers
from models.league_statistics import LeagueStatistics
from models.rolling_stats.player_basic_rolling_stats import PlayerBasicRollingStats
from models.rolling_stats.player_advanced_rolling_stats import PlayerAdvancedRollingStats
from models.rolling_stats.team_rolling_stats import TeamRollingStats
from models.rolling_stats.rolling_stats_percentiles import RollingStatsPercentiles
from utils.constants import CURRENT_SEASON
from utils.logger import logger


def parse_args():
    parser = argparse.ArgumentParser(description="Compute rolling stats from game logs.")
    parser.add_argument("--force", action="store_true", default=False, help="Force re-hydration of player data.")
    parser.add_argument(
        "--season",
        type=int,
        metavar="YEAR",
        default=CURRENT_SEASON,
        help=f"Season year to compute stats for (default: {CURRENT_SEASON}).",
    )
    return parser.parse_args()


def main(force=False, season_year=None):
    if season_year is None:
        season_year = CURRENT_SEASON
    conn = None
    try:
        conn = get_db_connection()
        mlb_api = MlbApi()
        sync_status = SyncStatus(conn)
        player_hydrator = PlayerHydrator(conn, mlb_api, sync_status, PlayerLookups(conn))

        rolling_stats_percentiles = RollingStatsPercentiles(conn)
        player_basic_rolling_stats = PlayerBasicRollingStats(conn, rolling_stats_percentiles)
        player_advanced_rolling_stats = PlayerAdvancedRollingStats(conn, rolling_stats_percentiles)
        team_rolling_stats = TeamRollingStats(conn, rolling_stats_percentiles)
        player_game_log = PlayerGameLogs(conn, player_basic_rolling_stats, player_advanced_rolling_stats)
        team_game_log = TeamGameLogs(conn, team_rolling_stats)
        game_pitchers = GamePitchers(conn)
        league_statistics = LeagueStatistics(conn)
        league_game_log = LeagueGameLogs(mlb_api, player_game_log, team_game_log, game_pitchers, league_statistics)

        logger.info(f"Starting rolling stats computation for season {season_year}...")
        player_hydrator.hydrate_players(force)
        logger.info("Hydration complete.")
        logger.info("Computing rolling stats...")
        league_game_log.compute_rolling_stats(season_year)
        logger.info("Rolling stats computation complete.")
    except Exception as e:
        logger.exception("Error computing rolling stats")
    finally:
        if conn:
            conn.close()
            logger.info("Database connection closed.")

if __name__ == "__main__":
    args = parse_args()
    logger.info(f"Hydrating player data with force={args.force}, season={args.season}")
    main(force=args.force, season_year=args.season)
