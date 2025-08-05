from models.game_logs.mlb_log import MlbLog
from utils.functions import normalise_name

class ProbablePitcher(MlbLog):
    KEYS = ['espn_game_id', 'game_date', 'team', 'opponent', 'espn_pitcher_id', 'home', 'pitcher_name', 'normalised_name']
    ID_KEYS = ['espn_game_id', 'team']
    
    def __init__(self, event_data, team_data, competitors_data, pitcher_data):
        super().__init__()
        self.event_data = event_data
        self.team_data = team_data
        self.competitors_data = competitors_data
        self.opponent_data = [c for c in competitors_data if c["id"] != team_data["id"]][0]
        self.pitcher_data = pitcher_data
        self.pitcher_name = self.pitcher_data.get('athlete', {}).get('displayName', "")
        self.home_or_away = self.team_data.get('homeAway') == "home" if self.team_data.get('homeAway') else None
        self.set_values()

    def get_value_for_key(self, key):
        if key == 'espn_game_id':
            return self.event_data.get('id', None)
        elif key == 'game_date':
            return self.event_data.get('date', None)[:10]
        elif key == 'team':
            return self.team_data.get('team', {}).get('abbreviation', None)
        elif key == 'opponent':
            return self.opponent_data.get('team', {}).get('abbreviation', None)
        elif key == 'espn_pitcher_id':
            return self.pitcher_data.get('playerId', None)
        elif key == 'home':
            return self.home_or_away
        elif key == 'pitcher_name':
            return self.pitcher_name
        elif key == 'normalised_name':
            return normalise_name(self.pitcher_name)
        else:
            return None