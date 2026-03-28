from models.game_logs.game_log import GameLog
from utils.functions import convert_utc_date

class TeamGameLog(GameLog):
    KEYS = [
        'team', 'season_year', 'game_date', 'opponent', 'is_home', 'is_win', 'nrfi', # General
        'runs_scored', 'runs_allowed', 'avg', 'obp', 'slg', 'ops', # Batting
        'er', 'whip', 'strikeouts', 'walks', 'ip', 'hits_allowed', # Pitching
        'game_id' # General
    ]
    ID_KEYS = ['team', 'game_id', 'game_date']

    def __init__(self, team_home_or_away, game_data, box_score_data, line_score_data):
        super().__init__(team_home_or_away, game_data, box_score_data)

        opponent_team_home_or_away = 'away' if self.team_home_or_away == 'home' else 'home'
        self.runs_scored = line_score_data.get('teams', {}).get(self.team_home_or_away, {}).get('runs', 0)
        self.runs_allowed = line_score_data.get('teams', {}).get(opponent_team_home_or_away, {}).get('runs', 0)

        team_data = box_score_data.get('teams', {}).get(team_home_or_away, {})
        self.batting_stats = team_data.get('teamStats', {}).get('batting', {})
        self.pitching_stats = team_data.get('teamStats', {}).get('pitching', {})

        innings = line_score_data.get('innings', [])
        if innings:
            first_inning = innings[0]
            home_runs = first_inning.get('home', {}).get('runs', 0)
            away_runs = first_inning.get('away', {}).get('runs', 0)
            self.nrfi = 1 if home_runs == 0 and away_runs == 0 else 0
        else:
            self.nrfi = 0

        self.set_values()

    def get_value_for_key(self, key):
        if key == 'season_year':
            return int(convert_utc_date(self.game_data['game_date']).year)
        elif key == 'runs_scored':
            return self.runs_scored
        elif key == 'runs_allowed':
            return self.runs_allowed
        elif key == 'is_win':
            return self.runs_scored > self.runs_allowed
        elif key == 'avg':
            return self.safe_float(self.batting_stats.get("avg"))
        elif key == 'obp':
            return self.safe_float(self.batting_stats.get("obp"))
        elif key == 'slg':
            return self.safe_float(self.batting_stats.get("slg"))
        elif key == 'ops':
            return self.safe_float(self.batting_stats.get("ops"))
        elif key == 'er':
            return self.pitching_stats.get("earnedRuns", 0)
        elif key == 'whip':
            return self.safe_float(self.pitching_stats.get("whip"))
        elif key == 'strikeouts':
            return self.pitching_stats.get("strikeOuts", 0)
        elif key == 'walks':
            return self.pitching_stats.get("baseOnBalls", 0)
        elif key == 'ip':
            return float(self.ip_to_decimal(self.pitching_stats.get("inningsPitched", "0")))
        elif key == 'hits_allowed':
            return self.pitching_stats.get("hits", 0)
        elif key == 'nrfi':
            return self.nrfi
        else:
            return super().get_value_for_key(key)
    

