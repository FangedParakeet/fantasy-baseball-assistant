from models.db import get_db_connection
from models.api.fangraphs_api import FangraphsApi
from models.api.mlb_api import MlbApi
from models.fangraphs_stats import FangraphsStats
from models.api.savant_api import SavantApi
from models.savant_stats import SavantStats
from models.player_lookups import PlayerLookups
from models.player_hydrator import PlayerHydrator
from models.rolling_stats.player_season_stats_percentiles import PlayerSeasonStatsPercentiles
from models.rolling_stats.team_season_stats_percentiles import TeamSeasonStatsPercentiles
from models.season_stats import SeasonStats
from models.sync_status import SyncStatus
from utils.logger import logger

def main():
    conn = None
    try:
        conn = get_db_connection()
        sync_status = SyncStatus(conn)
        player_lookups = PlayerLookups(conn)
        player_hydrator = PlayerHydrator(conn, MlbApi(), sync_status, player_lookups)
        fangraphs_stats = FangraphsStats(conn, FangraphsApi(), player_lookups)
        savant_stats = SavantStats(conn, SavantApi())
        
        logger.info("Starting season stats sync...")
        # Deduplicate: merge (name, position) pairs with exactly two rows and one lookup row
        for table in (SeasonStats.PLAYER_STATS_TABLE, SeasonStats.PLAYER_STATS_TABLE + "_percentiles"):
            player_lookups.update_player_names_from_lookup(table, matching_conditions=['position'])
            player_lookups.consolidate_duplicate_season_stats(table)
        fangraphs_stats.update_all_player_stats()
        fangraphs_stats.update_all_team_stats()
        logger.info("Hydrating Fangraphs player stats...")
        player_hydrator.update_table_from_lookup(SeasonStats.PLAYER_STATS_TABLE)
        logger.info("Updating statcast player stats...")
        savant_stats.update_all_statcast_player_stats()

        logger.info("Computing season stats percentiles...")
        player_season_stats_percentiles = PlayerSeasonStatsPercentiles(conn)
        player_season_stats_percentiles.compute_percentiles()
        team_season_stats_percentiles = TeamSeasonStatsPercentiles(conn)
        team_season_stats_percentiles.compute_percentiles()


        logger.info("Season stats sync complete.")
    except Exception as e:
        logger.exception("Error syncing season stats: %s", e)
    finally:
        if conn:
            conn.close()
            logger.info("Database connection closed.")

if __name__ == "__main__":
    main() 