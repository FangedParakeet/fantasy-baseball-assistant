from models.rolling_stats.rolling_stats_percentiles import RollingStatsPercentiles
from utils.logger import logger

class SeasonStatsPercentiles(RollingStatsPercentiles):
    def __init__(self, conn):
        super().__init__(conn)

    def compute_percentiles(self, stats_table, stats, thresholds, extra_keys):
        for key, stat_list in stats.items():
            logger.info(f"Computing percentiles for {key}")
            for stat in stat_list:
                logger.info(f"Computing percentile for {stat}")
                self.compute_single_season_percentiles(stats_table, stat, thresholds[key], extra_keys)