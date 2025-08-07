from models.season_stats import SeasonStats
from models.api.savant_api import SavantApi
from models.game_logs.savant_batter_stat_log import SavantBatterStatLog
from models.game_logs.savant_advanced_batter_stat_log import SavantAdvancedBatterStatLog
from models.game_logs.savant_pitcher_stat_log import SavantPitcherStatLog
from models.game_logs.logs_inserter import LogsInserter
from utils.logger import logger


class SavantStats(SeasonStats):
    def __init__(self, conn, savant_api: SavantApi):
        super().__init__(conn)
        self.api = savant_api

    def update_all_statcast_player_stats(self):
        logger.info("Updating all statcast player stats from Baseball Savant")

        all_batter_stats = LogsInserter(SavantBatterStatLog.KEYS, SavantBatterStatLog.ID_KEYS)
        all_advanced_batter_stats = LogsInserter(SavantAdvancedBatterStatLog.KEYS, SavantAdvancedBatterStatLog.ID_KEYS)
        all_pitcher_stats = LogsInserter(SavantPitcherStatLog.KEYS, SavantPitcherStatLog.ID_KEYS)

        batter_stats_data = self.api.get_batting_stats()
        advanced_batter_stats_data = self.api.get_advanced_batting_stats()
        pitcher_stats_data = self.api.get_pitching_stats()

        if batter_stats_data is None:
            logger.error("No batter stats data found from Savant")
        else:
            logger.info(f"Found {len(batter_stats_data)} rows of batter stats")
            for _, player_data in batter_stats_data.iterrows():
                all_batter_stats.add_row(SavantBatterStatLog(player_data.to_dict()))

            logger.info(f"Inserting {all_batter_stats.get_row_count()} rows of batter stats")
            self.upsert_stats(self.PLAYER_STATS_TABLE, all_batter_stats)

        if advanced_batter_stats_data is None:
            logger.error("No advanced batter stats data found from Savant")
        else:
            logger.info(f"Found {len(advanced_batter_stats_data)} rows of advanced batter stats")
            for _, player_data in advanced_batter_stats_data.iterrows():
                all_advanced_batter_stats.add_row(SavantAdvancedBatterStatLog(player_data.to_dict()))

            logger.info(f"Inserting {all_advanced_batter_stats.get_row_count()} rows of advanced batter stats")
            self.upsert_stats(self.PLAYER_STATS_TABLE, all_advanced_batter_stats)

        if pitcher_stats_data is None:
            logger.error("No pitcher stats data found from Savant")
        else:
            logger.info(f"Found {len(pitcher_stats_data)} rows of pitcher stats")
            for _, player_data in pitcher_stats_data.iterrows():
                all_pitcher_stats.add_row(SavantPitcherStatLog(player_data.to_dict()))

            logger.info(f"Inserting {all_pitcher_stats.get_row_count()} rows of pitcher stats")
            self.upsert_stats(self.PLAYER_STATS_TABLE, all_pitcher_stats)