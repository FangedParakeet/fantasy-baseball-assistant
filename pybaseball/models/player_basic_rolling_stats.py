from models.player_rolling_stats import PlayerRollingStats
from models.player_game_log import PlayerGameLog
from models.logger import logger

class PlayerBasicRollingStats(PlayerRollingStats):
    ID_KEYS = ['normalised_name', 'position', 'player_id']
    EXTRA_KEYS = ['games', 'abs', 'ip']
    STATS_KEYS = {
        'batting': ['rbi', 'runs', 'hr', 'sb', 'hits', 'avg', 'k'],
        'pitching': ['strikeouts', 'era', 'whip', 'er', 'qs', 'sv', 'hld']
    }
    STATS_THRESHOLDS = {
        'batting': {
            'key': 'abs',
            7: 15,
            14: 30,
            30: 40
        },
        'pitching': {
            'key': 'ip',
            7: 4,
            14: 8,
            30: 12
        }
    }
    CONDITIONS = {
        'batting': {
            'key': 'position',
            'comp': '=',
            'value': 'B'
        },
        'pitching': {
            'key': 'position',
            'comp': '!=',
            'value': 'B'
        }
    }

    def __init__(self, conn, rolling_stats_percentiles):
        self.rolling_stats_table = PlayerGameLog.BASIC_ROLLING_STATS_TABLE
        self.rolling_stats_percentiles = rolling_stats_percentiles
        super().__init__(conn)

    def get_formulas(self):
        return {
            'games': 'COUNT(*) AS games',
            'rbi': 'SUM(COALESCE(gl.rbi, 0)) AS rbi',
            'runs': 'SUM(COALESCE(gl.r, 0)) AS runs',
            'hr': 'SUM(COALESCE(gl.hr, 0)) AS hr',
            'sb': 'SUM(COALESCE(gl.sb, 0)) AS sb',
            'hits': 'SUM(COALESCE(gl.h, 0)) AS hits',
            'abs': 'SUM(COALESCE(gl.ab, 0)) AS abs',
            'avg': 'ROUND(SUM(COALESCE(gl.h, 0)) / NULLIF(SUM(COALESCE(gl.ab, 0)), 0), 3)',
            'k': 'SUM(COALESCE(gl.k, 0)) AS k',
            'strikeouts': 'SUM(COALESCE(gl.strikeouts, 0)) AS strikeouts',
            'ip': 'ROUND(SUM(COALESCE(gl.ip, 0)), 2) AS ip',
            'er': 'SUM(COALESCE(gl.er, 0)) AS er',
            'qs': 'SUM(COALESCE(gl.qs, 0)) AS qs',
            'sv': 'SUM(COALESCE(gl.sv, 0)) AS sv',
            'hld': 'SUM(COALESCE(gl.hld, 0)) AS hld',
            'era': 'ROUND(SUM(COALESCE(gl.er, 0)) * 9 / NULLIF(SUM(COALESCE(gl.ip, 0)), 0), 2) AS era',
            'whip': 'ROUND(SUM(COALESCE(gl.walks_allowed, 0) + COALESCE(gl.hits_allowed, 0)) / NULLIF(SUM(COALESCE(gl.ip, 0)), 0), 2) AS whip',
            'player_id': 'gl.player_id',
            'normalised_name': 'MAX(gl.normalised_name)',
            'position': 'MAX(gl.position)'
        }

    def compute_rolling_stats(self):
        # Start transaction for the entire operation
        self.begin_transaction()
        
        try:
            # Clear all existing rolling stats before computing new ones
            logger.info("Clearing all existing player basic rolling stats")
            self.purge_all_records_in_transaction(self.rolling_stats_table)
            
            insert_keys = self.ID_KEYS + self.EXTRA_KEYS + self.STATS_KEYS['batting'] + self.STATS_KEYS['pitching']
            all_formulas = self.get_formulas()
            select_formulas = [all_formulas[key] for key in insert_keys]

            super().compute_rolling_stats(self.rolling_stats_table, insert_keys, select_formulas)
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
        for key, stats in self.STATS_KEYS.items():
            logger.info(f"Computing percentiles for {key}")
            for stat in stats:
                logger.info(f"Computing percentiles for {stat}")
                self.rolling_stats_percentiles.compute_percentiles( self.rolling_stats_table, stat, self.STATS_THRESHOLDS[key], self.CONDITIONS[key], self.ID_KEYS)
