from models.db_recorder import DB_Recorder
from models.game_pitchers import GamePitchers
from models.player_lookup import PlayerLookup
from utils.constants import SPLITS, ROLLING_WINDOWS
from models.logger import logger

class RollingStats(DB_Recorder):
    SPLIT_WINDOW_KEYS = ['split_type', 'span_days']
    
    def __init__(self, conn, rolling_stats_percentiles):
        super().__init__(conn)
        self.rolling_stats_percentiles = rolling_stats_percentiles
        self.game_pitchers_table = GamePitchers.GAME_PITCHERS_TABLE
        self.player_lookup_table = PlayerLookup.LOOKUP_TABLE
        
    def build_where_clause_for_split(self, split):
        if split == 'overall':
            return ''
        elif split == 'home':
            return 'AND gl.is_home = 1'
        elif split == 'away':
            return 'AND gl.is_home = 0'
        return ''

    def get_formulas(self):
        return {
            'split_type': '%s AS split_type',
            'span_days': '%s AS span_days'
        }

    def compute_rolling_stats(self, rolling_stats_table, game_logs_table, insert_keys, select_formulas, join_conditions, group_by=''):
        insert_values = ', '.join(insert_keys)
        select_values = ', '.join(select_formulas)
        
        # Count %s placeholders more precisely
        insert_placeholder_count = sum(item.count('%s') for item in insert_keys)
        select_placeholder_count = sum(item.count('%s') for item in select_formulas)
        total_placeholders = insert_placeholder_count + select_placeholder_count

        for split in SPLITS:
            for window in ROLLING_WINDOWS:
                logger.info(f"Computing rolling stats for {split} for {window} days")
                where_clause = self.build_where_clause_for_split(split)
                insert_query = f"""
                    INSERT INTO {rolling_stats_table} ({insert_values})
                    SELECT {select_values}
                    FROM {game_logs_table} gl
                    LEFT JOIN {self.game_pitchers_table} gp ON gl.game_id = gp.game_id
                    LEFT JOIN {self.player_lookup_table} opp_pl ON (
                        {join_conditions}
                    )
                    WHERE gl.game_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                    {where_clause}
                    {group_by}
                """
                # Parameters: split, span_days, (start_date), window (for the WHERE clause)
                # First placeholder is split, then window repeated (total_placeholders) times (+1 for the WHERE clause)
                params = [split] + [window] * (total_placeholders)
                self.execute_query_in_transaction(insert_query, params)

    def compute_percentiles(self, rolling_stats_table, stats, thresholds, conditions, id_keys, split_type_key='split_type', custom_splits=None):
        for key, stat_list in stats.items():
            logger.info(f"Computing percentiles for {key}")
            for stat in stat_list:
                logger.info(f"Computing percentiles for {stat}")
                condition = conditions[key] if conditions is not None else None
                self.rolling_stats_percentiles.compute_percentiles(rolling_stats_table, stat, thresholds[key], condition, id_keys, split_type_key, custom_splits)