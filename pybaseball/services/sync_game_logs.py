import argparse
from datetime import datetime, timedelta

from models.db import get_db_connection
from models.api.mlb_api import MlbApi
from models.player_hydrator import PlayerHydrator
from models.sync_status import SyncStatus
from models.player_lookups import PlayerLookups
from models.player_game_logs import PlayerGameLogs
from models.team_game_logs import TeamGameLogs
from models.league_game_logs import LeagueGameLogs
from models.game_pitchers import GamePitchers
from utils.constants import MAX_AGE_DAYS
from utils.logger import logger


def parse_args():
    parser = argparse.ArgumentParser(
        description="Sync game logs from MLB Stats API. By default syncs recent logs (and purges old ones). "
        "Use --end-date to backfill a 30-day window ending on that date (purges all existing game logs first)."
    )
    parser.add_argument(
        "--end-date",
        type=str,
        metavar="YYYY-MM-DD",
        default=None,
        help="End date for a 30-day backfill window (e.g. last day of last season). When set, purges all existing game logs, then upserts only (end_date - 30 days) through end_date.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    conn = None
    try:
        conn = get_db_connection()
        mlb_api = MlbApi()
        player_hydrator = PlayerHydrator(conn, mlb_api, SyncStatus(conn), PlayerLookups(conn))
        league_game_logs = LeagueGameLogs(mlb_api, PlayerGameLogs(conn), TeamGameLogs(conn), GamePitchers(conn))

        if args.end_date:
            end = datetime.strptime(args.end_date, "%Y-%m-%d").date()
            start = end - timedelta(days=MAX_AGE_DAYS)
            start_str = start.strftime("%Y-%m-%d")
            end_str = end.strftime("%Y-%m-%d")
            logger.info("Starting game logs backfill from %s to %s (purging all existing game logs first)...", start_str, end_str)
            league_game_logs.purge_all_game_logs()
            games = league_game_logs.fetch_game_logs(start_date=start_str, end_date=end_str)
        else:
            logger.info("Starting game logs sync...")
            league_game_logs.purge_old_game_logs()
            games = league_game_logs.fetch_game_logs()

        league_game_logs.upsert_game_logs(games)

        player_hydrator.update_table_from_lookup(PlayerGameLogs.GAME_LOGS_TABLE)

        logger.info("Game logs sync complete.")
    except Exception as e:
        logger.exception("Error syncing game logs: %s", e)
    finally:
        if conn:
            conn.close()
            logger.info("Database connection closed.")


if __name__ == "__main__":
    main() 