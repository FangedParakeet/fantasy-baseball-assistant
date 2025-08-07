from models.rolling_stats.season_stats_percentiles import SeasonStatsPercentiles
from models.season_stats import SeasonStats
from utils.logger import logger

class PlayerSeasonStatsPercentiles(SeasonStatsPercentiles):
    ID_KEYS = ['player_id', 'fangraphs_player_id', 'normalised_name', 'team', 'position']
    STATS_KEYS = {
        'batting': [
            'hits', 'hr', 'rbi', 'runs', 'sb', 'avg', 'obp', 'slg', 'ops', 'bb_rate', 'k_rate', # Basic stats
            'iso', 'babip', 'woba', 'wrc_plus', 'wraa', # Advanced stats
            'barrel_pct', 'hard_hit_pct', 'avg_ev', 'max_ev', 'sweet_spot_pct' # Exit velocity
        ],
        'pitching': [
            'era', 'whip', 'fip', 'x_fip', 'k_per_9', 'bb_per_9', 'hr_per_9', 'k_pct', 'bb_pct', 'lob_pct', # Pitching
            'csw_pct', 'swinging_strike_pct', 'ground_ball_pct', 'fly_ball_pct', # Pitching
            'qs', 'sv', 'hld', # Results
        ],
        'meta': [
            'sprint_speed', 'age' # Physical
        ]
    }
    STATS_THRESHOLDS = {
        'batting': {
            'key': 'pa',
            'value': 200
        },
        'pitching': {
            'key': 'ip',
            'value': 40
        },
        'meta': None
    }

    def __init__(self, conn):
        super().__init__(conn)
        self.season_stats_table = SeasonStats.PLAYER_STATS_TABLE
        self.season_stats_percentiles_table = self.season_stats_table + '_percentiles'

    def compute_percentiles(self):
        logger.info("Computing player season stats percentiles")
        self.begin_transaction()

        try:
            logger.info(f"Purging all records in player season stats percentiles table")
            self.purge_all_records_in_transaction(self.season_stats_percentiles_table)

            logger.info(f"Computing percentiles for player season stats")
            super().compute_percentiles(self.season_stats_table, self.STATS_KEYS, self.STATS_THRESHOLDS, self.ID_KEYS)
        except Exception as e:
            logger.error(f"Error computing player season stats percentiles: {e}")
            self.rollback_transaction()
            raise e
        finally:
            self.commit_transaction()

