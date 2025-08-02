from models.db_recorder import DB_Recorder
from utils.constants import SPLITS, ROLLING_WINDOWS
from models.logger import logger

class RollingStatsPercentiles(DB_Recorder):
    def __init__(self, conn):
        super().__init__(conn)

    def compute_percentiles(self, rolling_stats_table, stats_key, reliability_threshold, extra_condition=None, extra_stats_keys=None):
        extra_values = ''
        if extra_stats_keys:
            extra_values = ', ' + ', '.join(extra_stats_keys)

        conditions = [f"span_days = %s", f"split_type = %s", f"""{stats_key} IS NOT NULL"""]
        if extra_condition:
            conditions.append(f"""{extra_condition['key']} {extra_condition['comp']} '{extra_condition['value']}'""")

        insert_values = f"span_days, split_type, updated_at, {stats_key}_pct" + extra_values + ", is_reliable"
        select_values = f"span_days, split_type, CURRENT_TIMESTAMP, ROUND(100 * PERCENT_RANK() OVER (ORDER BY {stats_key} ASC), 2) AS {stats_key}_pct" + extra_values

        for split in SPLITS:
            for window in ROLLING_WINDOWS:
                logger.info(f"Computing {stats_key} percentiles for {split} for {window} days")
                reliability_condition = f"""{reliability_threshold['key']} >= {reliability_threshold[window]}"""
                insert_query = f"""
                    INSERT INTO {rolling_stats_table + '_percentiles'} ({insert_values})
                    SELECT {select_values}, {reliability_condition}
                    FROM {rolling_stats_table}
                    WHERE {' AND '.join(conditions)}
                    ON DUPLICATE KEY UPDATE
                        {stats_key}_pct = VALUES({stats_key}_pct),
                        is_reliable = VALUES(is_reliable),
                        updated_at = CURRENT_TIMESTAMP
                """
                params = [window, split]
                self.execute_query_in_transaction(insert_query, params)