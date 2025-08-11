from models.rolling_stats.player_rolling_stats import PlayerRollingStats
from models.player_game_logs import PlayerGameLogs
from utils.logger import logger

class PlayerBasicRollingStats(PlayerRollingStats):
    STATS_KEYS = {
        'batting': ['rbi', 'runs', 'hr', 'sb', 'hits', 'avg', 'k'],
        'pitching': ['strikeouts', 'era', 'whip', 'er', 'qs', 'sv', 'hld', 'nrfi']
    }

    def __init__(self, conn, rolling_stats_percentiles):
        super().__init__(conn, rolling_stats_percentiles)
        self.rolling_stats_table = PlayerGameLogs.BASIC_ROLLING_STATS_TABLE
        self.game_logs_table = PlayerGameLogs.GAME_LOGS_TABLE

    def get_formulas(self):
        return super().get_formulas() | {
            'rbi': 'SUM(COALESCE(gl.rbi, 0)) AS rbi',
            'runs': 'SUM(COALESCE(gl.r, 0)) AS runs',
            'hr': 'SUM(COALESCE(gl.hr, 0)) AS hr',
            'sb': 'SUM(COALESCE(gl.sb, 0)) AS sb',
            'hits': 'SUM(COALESCE(gl.h, 0)) AS hits',
            'avg': 'ROUND(SUM(COALESCE(gl.h, 0)) / NULLIF(SUM(COALESCE(gl.ab, 0)), 0), 3)',
            'k': 'SUM(COALESCE(gl.k, 0)) AS k',
            'strikeouts': 'SUM(COALESCE(gl.strikeouts, 0)) AS strikeouts',
            'er': 'SUM(COALESCE(gl.er, 0)) AS er',
            'qs': 'SUM(COALESCE(gl.qs, 0)) AS qs',
            'sv': 'SUM(COALESCE(gl.sv, 0)) AS sv',
            'hld': 'SUM(COALESCE(gl.hld, 0)) AS hld',
            'era': 'ROUND(SUM(COALESCE(gl.er, 0)) * 9 / NULLIF(SUM(COALESCE(gl.ip, 0)), 0), 2) AS era',
            'whip': 'ROUND(SUM(COALESCE(gl.walks_allowed, 0) + COALESCE(gl.hits_allowed, 0)) / NULLIF(SUM(COALESCE(gl.ip, 0)), 0), 2) AS whip',
            'nrfi': 'SUM(COALESCE(gl.nrfi, 0)) AS nrfi',
        }

    def compute_rolling_stats(self):
        # Start transaction for the entire operation
        self.begin_transaction()
        
        try:
            # Clear all existing rolling stats before computing new ones
            logger.info("Clearing all existing player basic rolling stats")
            self.purge_all_records_in_transaction(self.rolling_stats_table)
            
            # Include all keys that have formulas, including those with %s placeholders
            insert_keys = self.SPLIT_WINDOW_KEYS + self.ID_KEYS + self.EXTRA_KEYS + self.DATE_KEYS + self.STATS_KEYS['batting'] + self.STATS_KEYS['pitching']
            all_formulas = self.get_formulas()
            select_formulas = [all_formulas[key] for key in insert_keys]
            join_conditions = super().get_join_conditions()

            logger.info(f"Computing player basic rolling stats")
            super().compute_rolling_stats(self.rolling_stats_table, self.game_logs_table, insert_keys, select_formulas, join_conditions, 'GROUP BY gl.player_id')
            self.compute_percentiles()
            
            # Commit transaction
            self.commit_transaction()
            logger.info("Successfully computed basic rolling stats")
            
        except Exception as e:
            logger.error(f"Error computing basic rolling stats: {e}")
            self.rollback_transaction()
            raise

    def compute_percentiles(self):
        logger.info(f"Computing percentiles for basic rolling stats")
        self.purge_all_records_in_transaction(self.rolling_stats_table + '_percentiles')
        super().compute_percentiles(self.rolling_stats_table, self.STATS_KEYS, self.STATS_THRESHOLDS, self.CONDITIONS, self.ID_KEYS)