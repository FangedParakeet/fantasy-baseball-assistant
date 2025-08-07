from models.api.fangraphs_api import FangraphsApi
from models.season_stats import SeasonStats
from models.game_logs.logs_inserter import LogsInserter
from models.game_logs.fangraphs_pitcher_stat_log import FangraphsPitcherStatLog
from models.game_logs.fangraphs_batter_stat_log import FangraphsBatterStatLog
from models.game_logs.fangraphs_team_batting_stat_log import FangraphsTeamBattingStatLog
from models.game_logs.fangraphs_team_pitching_stat_log import FangraphsTeamPitchingStatLog
from models.player_lookups import PlayerLookups
from utils.logger import logger

class FangraphsStats(SeasonStats):
    def __init__(self, conn, fangraphs_api: FangraphsApi, player_lookups: PlayerLookups):
        super().__init__(conn)
        self.api = fangraphs_api
        self.player_lookups = player_lookups

    def update_all_player_stats(self):
        logger.info("Updating all season player stats from Fangraphs")
        all_pitcher_stats = LogsInserter(FangraphsPitcherStatLog.KEYS, FangraphsPitcherStatLog.ID_KEYS)
        all_batter_stats = LogsInserter(FangraphsBatterStatLog.KEYS, FangraphsBatterStatLog.ID_KEYS)

        pitcher_data_response = self.api.get_player_data('P')
        batter_data_response = self.api.get_player_data('B')

        if pitcher_data_response is None:
            logger.error("No pitcher data found from Fangraphs")
        else:
            pitcher_columns = pitcher_data_response.get('k', [])
            pitcher_data = pitcher_data_response.get('v', [])
            logger.info(f"Found {len(pitcher_data)} rows of pitcher stats")
            for data in pitcher_data:
                pitcher_info = dict(zip(pitcher_columns, data))
                all_pitcher_stats.add_row(FangraphsPitcherStatLog(pitcher_info))

            logger.info(f"Upserting {all_pitcher_stats.get_row_count()} pitcher stats")
            self.upsert_stats(self.PLAYER_STATS_TABLE, all_pitcher_stats)


        if batter_data_response is None:
            logger.error("No batter data found from Fangraphs")
        else:
            batter_columns = batter_data_response.get('k', [])
            batter_data = batter_data_response.get('v', [])
            logger.info(f"Found {len(batter_data)} rows of batter stats")
            for data in batter_data:
                batter_info = dict(zip(batter_columns, data))
                all_batter_stats.add_row(FangraphsBatterStatLog(batter_info))

            logger.info(f"Upserting {all_batter_stats.get_row_count()} batter stats")
            self.upsert_stats(self.PLAYER_STATS_TABLE, all_batter_stats)

        if pitcher_data_response is not None or batter_data_response is not None:
            logger.info("Updating player ids from lookup table")
            additional_join_conditions = ['team']
            self.player_lookups.update_player_ids_from_lookup(self.PLAYER_STATS_TABLE, additional_join_conditions)

    def update_all_team_stats(self):
        logger.info("Updating all season team stats from Fangraphs")
        all_team_pitching_stats = LogsInserter(FangraphsTeamPitchingStatLog.KEYS, FangraphsTeamPitchingStatLog.ID_KEYS)
        all_team_batting_stats = LogsInserter(FangraphsTeamBattingStatLog.KEYS, FangraphsTeamBattingStatLog.ID_KEYS)

        team_pitching_data_response = self.api.get_team_data('P')
        team_batting_data_response = self.api.get_team_data('B')

        if team_pitching_data_response is None:
            logger.error("No team pitching data found from Fangraphs")
        else:
            team_pitching_data = team_pitching_data_response.get('data', [])
            logger.info(f"Found {len(team_pitching_data)} rows of team pitching stats")
            for data in team_pitching_data:
                all_team_pitching_stats.add_row(FangraphsTeamPitchingStatLog(data))

            logger.info(f"Upserting {all_team_pitching_stats.get_row_count()} team pitching stats")
            self.upsert_stats(self.TEAM_STATS_TABLE, all_team_pitching_stats)

        if team_batting_data_response is None:
            logger.error("No team batting data found from Fangraphs")
        else:
            team_batting_data = team_batting_data_response.get('data', [])
            logger.info(f"Found {len(team_batting_data)} rows of team batting stats")
            for data in team_batting_data:
                all_team_batting_stats.add_row(FangraphsTeamBattingStatLog(data))

            logger.info(f"Upserting {all_team_batting_stats.get_row_count()} team batting stats")
            self.upsert_stats(self.TEAM_STATS_TABLE, all_team_batting_stats)

