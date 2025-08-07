from models.rolling_stats.season_stats_percentiles import SeasonStatsPercentiles
from models.season_stats import SeasonStats
from utils.logger import logger

class TeamSeasonStatsPercentiles(SeasonStatsPercentiles):
    ID_KEYS = ['team']
    STATS_KEYS = {
        'team': [
            'runs', 'hits', 'hr', 'rbi',
            'sb', 'avg', 'obp', 'slg', 'ops',
            'bb_rate', 'k_rate', 'woba', 'wrc_plus', 'iso', 'babip',
            'era', 'whip', 'fip', 'x_fip', 'k_per_9', 'bb_per_9', 'hr_per_9', 'k_pct', 'bb_pct',
            'swinging_strike_pct', 'csw_pct', 'ground_ball_pct', 'fly_ball_pct', 'lob_pct',
            'barrel_pct', 'hard_hit_pct', 'avg_ev', 'war',
        ]
    }
    STATS_THRESHOLDS = {
        'team': {
            'key': 'games_played',
            'value': 20
        }
    }

    def __init__(self, conn):
        super().__init__(conn)
        self.season_stats_table = SeasonStats.TEAM_STATS_TABLE
        self.season_stats_percentiles_table = self.season_stats_table + '_percentiles'

    def compute_percentiles(self):
        logger.info("Computing team season stats percentiles")
        self.begin_transaction()

        try:
            logger.info(f"Purging all records in team season stats percentiles table")
            self.purge_all_records_in_transaction(self.season_stats_percentiles_table)

            logger.info(f"Computing percentiles for team season stats")
            super().compute_percentiles(self.season_stats_table, self.STATS_KEYS, self.STATS_THRESHOLDS, self.ID_KEYS)
        except Exception as e:
            logger.error(f"Error computing team season stats percentiles: {e}")
            self.rollback_transaction()
            raise e
        finally:
            self.commit_transaction()

