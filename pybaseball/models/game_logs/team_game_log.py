from models.game_logs.game_log import GameLog

class TeamGameLog(GameLog):
    KEYS = [
        'team', 'game_date', 'opponent', 'is_home', 'is_win', 'nrfi', # General
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
        if key == 'runs_scored':
            return self.runs_scored
        elif key == 'runs_allowed':
            return self.runs_allowed
        elif key == 'is_win':
            return self.runs_scored > self.runs_allowed
        elif key == 'avg':
            return float(self.batting_stats.get("avg", 0.0))
        elif key == 'obp':
            return float(self.batting_stats.get("obp", 0.0))
        elif key == 'slg':
            return float(self.batting_stats.get("slg", 0.0))
        elif key == 'ops':
            return float(self.batting_stats.get("ops", 0.0))
        elif key == 'er':
            return self.pitching_stats.get("earnedRuns", 0)
        elif key == 'whip':
            return float(self.pitching_stats.get("whip", 0.0))
        elif key == 'strikeouts':
            return self.pitching_stats.get("strikeouts", 0)
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
    

