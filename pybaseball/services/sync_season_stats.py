from models.db import get_db_connection
from models.api.fangraphs_api import FangraphsApi
from models.fangraphs_stats import FangraphsStats
from models.api.savant_api import SavantApi
from models.savant_stats import SavantStats
from models.player_lookups import PlayerLookups
from models.rolling_stats.player_season_stats_percentiles import PlayerSeasonStatsPercentiles
from models.rolling_stats.team_season_stats_percentiles import TeamSeasonStatsPercentiles
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

        logger.info("Computing season stats percentiles...")
        player_season_stats_percentiles = PlayerSeasonStatsPercentiles(conn)
        player_season_stats_percentiles.compute_percentiles()
        team_season_stats_percentiles = TeamSeasonStatsPercentiles(conn)
        team_season_stats_percentiles.compute_percentiles()

        logger.info("Season stats sync complete.")
    except Exception as e:
        logger.exception("Error syncing season stats: {e}")
    finally:
        if conn:
            conn.close()
            logger.info("Database connection closed.")

if __name__ == "__main__":
    main() 