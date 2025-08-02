from models.player_game_log import PlayerGameLog
from models.game_pitchers import GamePitchers
from models.player_lookup import PlayerLookup
from models.rolling_stats import RollingStats
from utils.constants import SPLITS, ROLLING_WINDOWS
from models.logger import logger

class PlayerRollingStats(RollingStats):
    def __init__(self, conn):
        super().__init__(conn)
        self.game_logs_table = PlayerGameLog.GAME_LOGS_TABLE
        self.game_pitchers_table = GamePitchers.GAME_PITCHERS_TABLE
        self.player_lookup_table = PlayerLookup.LOOKUP_TABLE

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

    def compute_rolling_stats(self, rolling_stats_table, insert_keys, select_formulas, is_league=False):
        insert_keys.extend(['split_type', 'span_days', 'start_date', 'end_date'])
        select_formulas.extend(['%s AS split_type', '%s AS span_days', 'DATE_SUB(CURDATE(), INTERVAL %s DAY) AS start_date', 'CURDATE() AS end_date'])
        insert_values = ', '.join(insert_keys)
        select_values = ', '.join(select_formulas)

        for split in SPLITS:
            for window in ROLLING_WINDOWS:
                logger.info(f"Computing rolling stats for {split} for {window} days")
                where_clause = self.build_where_clause_for_split(split)
                group_by = 'GROUP BY gl.player_id' if not is_league else ''
                insert_query = f"""
                    INSERT INTO {rolling_stats_table} ({insert_values})
                    SELECT {select_values}
                    FROM {self.game_logs_table} gl
                    LEFT JOIN {self.game_pitchers_table} gp ON gl.game_id = gp.game_id
                    LEFT JOIN {self.player_lookup_table} opp_pl ON (
                        (gl.is_home = 1 AND opp_pl.player_id = gp.away_pitcher_id)
                        OR
                        (gl.is_home = 0 AND opp_pl.player_id = gp.home_pitcher_id)
                    )
                    WHERE gl.game_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                    {where_clause}
                    {group_by}
                """
                params = (split, window, window, window)
                self.execute_query_in_transaction(insert_query, params)

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