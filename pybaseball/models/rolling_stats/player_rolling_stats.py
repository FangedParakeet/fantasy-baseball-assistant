from models.rolling_stats.rolling_stats import RollingStats
from models.logger import logger

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

    def build_where_clause_for_split(self, split):
        if split in ['overall', 'home', 'away']:
            return super().build_where_clause_for_split(split)
        elif split == 'vs_lhp':
            return """
            AND gl.position = 'B' AND (
                (gl.is_home = 1 AND gp.away_pitcher_id IS NOT NULL AND opp_pl.throws = 'L')
                OR (gl.is_home = 0 AND gp.home_pitcher_id IS NOT NULL AND opp_pl.throws = 'L')
            )
            """
        elif split == 'vs_rhp':
            return """
            AND gl.position = 'B' AND (
                (gl.is_home = 1 AND gp.away_pitcher_id IS NOT NULL AND opp_pl.throws = 'R')
                OR (gl.is_home = 0 AND gp.home_pitcher_id IS NOT NULL AND opp_pl.throws = 'R')
            )
            """
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

    def update_advanced_rolling_stats(self, advanced_rolling_stats_table, basic_rolling_stats_table, league_averages_table, update_formulas):
        logger.info(f"Updating advanced rolling statistics")
        update_values = ', '.join([f"p.{key} = {formula}" for key, formula in update_formulas.items()])
        update_query = f"""
            UPDATE {advanced_rolling_stats_table} p
            JOIN {league_averages_table} l 
                ON (p.span_days = l.span_days AND p.split_type = l.split_type)
            LEFT JOIN {basic_rolling_stats_table} b
                ON (p.player_id = b.player_id AND p.span_days = b.span_days AND p.split_type = b.split_type)
            SET {update_values}
        """
        self.execute_query_in_transaction(update_query)