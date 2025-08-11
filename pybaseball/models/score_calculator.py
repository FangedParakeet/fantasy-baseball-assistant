from datetime import datetime, timedelta
from models.db_recorder import DB_Recorder
from models.game_pitchers import GamePitchers
from models.probable_pitchers import ProbablePitchers
from models.player_lookups import PlayerLookups
from models.player_game_logs import PlayerGameLogs
from models.season_stats import SeasonStats
from models.team_game_logs import TeamGameLogs

class ScoreCalculator(DB_Recorder):
    PITCHER_SPAN_DAYS = 30
    TEAM_SPAN_DAYS = 14

    def __init__(self, conn):
        super().__init__(conn)
        self.probable_pitchers_table = ProbablePitchers.PROBABLE_PITCHERS_TABLE
        self.game_pitchers_table = GamePitchers.GAME_PITCHERS_TABLE
        self.player_lookup_table = PlayerLookups.LOOKUP_TABLE
        self.player_advanced_rolling_stats_table = PlayerGameLogs.ADVANCED_ROLLING_STATS_TABLE
        self.player_rolling_stats_table = PlayerGameLogs.BASIC_ROLLING_STATS_TABLE
        self.player_season_stats_table = SeasonStats.PLAYER_STATS_TABLE
        self.team_rolling_stats_table = TeamGameLogs.ROLLING_STATS_TABLE
        self.team_vs_pitcher_splits_table = TeamGameLogs.TEAM_VS_PITCHER_SPLITS_TABLE
        self.player_season_stats_percentiles_table = self.player_season_stats_table + "_percentiles"
        self.player_advanced_rolling_stats_percentiles_table = self.player_advanced_rolling_stats_table + "_percentiles"
        self.team_rolling_stats_percentiles_table = self.team_rolling_stats_table + "_percentiles"
        self.team_vs_pitcher_splits_percentiles_table = self.team_vs_pitcher_splits_table + "_percentiles"
        self.max_days_ahead = ProbablePitchers.MAX_PROJECTED_DAYS_AHEAD

    def get_window_dates(self):
        start_date = datetime.today().date()
        end_date = start_date + timedelta(days=self.max_days_ahead)
        return start_date, end_date


