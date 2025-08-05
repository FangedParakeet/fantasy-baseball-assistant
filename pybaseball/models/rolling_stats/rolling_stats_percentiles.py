from models.db_recorder import DB_Recorder
from utils.constants import SPLITS, ROLLING_WINDOWS
from utils.logger import logger

class RollingStatsPercentiles(DB_Recorder):
    THRESHOLD_MULTIPLIERS = {
        'overall': 1.0,
        'home': 0.6,
        'away': 0.6,
        'vs_lhp': 0.4,
        'vs_rhp': 0.4,
        'L': 0.4,
        'R': 0.4
    }


    def __init__(self, conn):
        super().__init__(conn)

    def compute_percentiles(self, rolling_stats_table, stats_key, reliability_threshold, extra_condition=None, extra_stats_keys=None, split_type_key='split_type', custom_splits=None):
        extra_values = ''
        if extra_stats_keys:
            extra_values = ', ' + ', '.join(extra_stats_keys)

        conditions = [f"span_days = %s", f"{split_type_key} = %s", f"""{stats_key} IS NOT NULL"""]
        if extra_condition:
            conditions.append(f"""{extra_condition['key']} {extra_condition['comp']} '{extra_condition['value']}'""")

        insert_values = f"span_days, {split_type_key}, updated_at, {stats_key}_pct" + extra_values + ", reliability_score"
        select_values = f"span_days, {split_type_key}, CURRENT_TIMESTAMP, ROUND(100 * PERCENT_RANK() OVER (ORDER BY {stats_key} ASC), 2) AS {stats_key}_pct" + extra_values

        for split in custom_splits if custom_splits else SPLITS:
            for window in ROLLING_WINDOWS:
                expected_threshold = reliability_threshold[window] * self.THRESHOLD_MULTIPLIERS[split]
                logger.info(f"Computing {stats_key} percentiles for {split} for {window} days")
                reliability_condition = f"""LEAST(ROUND(100 * {reliability_threshold['key']} / {expected_threshold}, 0), 100)"""
                insert_query = f"""
                    INSERT INTO {rolling_stats_table + '_percentiles'} ({insert_values})
                    SELECT {select_values}, {reliability_condition}
                    FROM {rolling_stats_table}
                    WHERE {' AND '.join(conditions)}
                    ON DUPLICATE KEY UPDATE
                        {stats_key}_pct = VALUES({stats_key}_pct),
                        reliability_score = VALUES(reliability_score),
                        updated_at = CURRENT_TIMESTAMP
                """
                params = [window, split]
                self.execute_query_in_transaction(insert_query, params)