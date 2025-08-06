from models.api.fangraphs_api import FangraphsApi
from models.db_recorder import DB_Recorder
from models.game_logs.logs_inserter import LogsInserter
from models.game_logs.fangraphs_pitcher_stat_log import FangraphsPitcherStatLog
from models.game_logs.fangraphs_batter_stat_log import FangraphsBatterStatLog
from models.player_lookups import PlayerLookups
from utils.logger import logger

class FangraphsStats(DB_Recorder):
    PLAYER_STATS_TABLE = 'player_season_stats'

    def __init__(self, conn, fangraphs_api: FangraphsApi, player_lookups: PlayerLookups):
        self.api = fangraphs_api
        self.player_lookups = player_lookups
        super().__init__(conn)

    def update_all_player_stats(self):
        logger.info("Updating all season player stats from Fangraphs")
        all_pitcher_stats = LogsInserter(FangraphsPitcherStatLog.KEYS, FangraphsPitcherStatLog.ID_KEYS)
        all_batter_stats = LogsInserter(FangraphsBatterStatLog.KEYS, FangraphsBatterStatLog.ID_KEYS)

        pitcher_data = self.api.get_player_data('P')
        batter_data = self.api.get_player_data('B')

        if pitcher_data is None:
            logger.error("No pitcher data found from Fangraphs")
        else:
            pitcher_columns = pitcher_data.get('k', [])
            pitcher_data = pitcher_data.get('v', [])
            logger.info(f"Found {len(pitcher_data)} rows of pitcher stats")
            for data in pitcher_data:
                pitcher_info = dict(zip(pitcher_columns, data))
                all_pitcher_stats.add_row(FangraphsPitcherStatLog(pitcher_info))

            logger.info(f"Upserting {all_pitcher_stats.get_row_count()} pitcher stats")
            self.upsert_player_stats(all_pitcher_stats)


        if batter_data is None:
            logger.error("No batter data found from Fangraphs")
        else:
            batter_columns = batter_data.get('k', [])
            batter_data = batter_data.get('v', [])
            logger.info(f"Found {len(batter_data)} rows of batter stats")
            for data in batter_data:
                batter_info = dict(zip(batter_columns, data))
                all_batter_stats.add_row(FangraphsBatterStatLog(batter_info))

            logger.info(f"Upserting {all_batter_stats.get_row_count()} batter stats")
            self.upsert_player_stats(all_batter_stats)

        if pitcher_data is not None or batter_data is not None:
            logger.info("Updating player ids from lookup table")
            additional_join_conditions = ['team']
            self.player_lookups.update_player_ids_from_lookup(self.PLAYER_STATS_TABLE, additional_join_conditions)

    def upsert_player_stats(self, player_stats: LogsInserter):
        if player_stats.is_empty():
            logger.info("No player stats to upsert")
            return
        
        insert_query = f"""
            INSERT INTO {self.PLAYER_STATS_TABLE} ({player_stats.get_insert_keys()})
            VALUES ({player_stats.get_placeholders()})
            ON DUPLICATE KEY UPDATE
                {player_stats.get_duplicate_update_keys()}
        """
        self.batch_upsert(insert_query, player_stats.get_rows())