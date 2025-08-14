from models.rolling_stats.rolling_stats import RollingStats
from utils.logger import logger

class PlayerRollingStats(RollingStats):
    ID_KEYS = ['normalised_name', 'position', 'player_id']
    EXTRA_KEYS = ['games', 'abs', 'ip']
    DATE_KEYS = ['start_date', 'end_date']
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
        super().__init__(conn, rolling_stats_percentiles)

    def build_where_clause_for_split(self, split, position=None):
        # position is now 'B' or 'P', not 'batting' or 'pitching'
        if split == 'overall':
            return f"AND gl.position = '{position}'"
        elif split == 'home':
            return f"AND gl.is_home = 1 AND gl.position = '{position}'"
        elif split == 'away':
            return f"AND gl.is_home = 0 AND gl.position = '{position}'"
        elif split == 'vs_lhp':
            # vs_lhp and vs_rhp splits only apply to batters
            if position == 'B':
                return f"""
                AND gl.position = 'B' AND (
                    (gl.is_home = 1 AND gp.away_pitcher_id IS NOT NULL AND opp_pl.throws = 'L')
                    OR (gl.is_home = 0 AND gp.home_pitcher_id IS NOT NULL AND opp_pl.throws = 'L')
                )
                """
            else:
                return "AND 1=0"  # No results for pitchers on vs_lhp split
        elif split == 'vs_rhp':
            # vs_lhp and vs_rhp splits only apply to pitchers
            if position == 'B':
                return """
                AND gl.position = 'B' AND (
                    (gl.is_home = 1 AND gp.away_pitcher_id IS NOT NULL AND opp_pl.throws = 'R')
                    OR (gl.is_home = 0 AND gp.home_pitcher_id IS NOT NULL AND opp_pl.throws = 'R')
                )
                """
            else:
                return "AND 1=0"  # No results for pitchers on vs_rhp split
        return ''

    def get_formulas(self):
        return super().get_formulas() | {
            'player_id': 'gl.player_id',
            'normalised_name': 'MAX(gl.normalised_name) AS normalised_name',
            'position': 'MAX(gl.position) AS position',
            'games': 'COUNT(*) AS games',
            'abs': 'SUM(COALESCE(gl.ab, 0)) AS abs',
            'ip': 'ROUND(SUM(COALESCE(gl.ip, 0)), 2) AS ip',
            'start_date': 'DATE_SUB(CURDATE(), INTERVAL %s DAY) AS start_date',
            'end_date': 'CURDATE() AS end_date',
        }

    def get_join_conditions(self):
        return """
        (gl.is_home = 1 AND opp_pl.player_id = gp.away_pitcher_id)
            OR
        (gl.is_home = 0 AND opp_pl.player_id = gp.home_pitcher_id)
        """
