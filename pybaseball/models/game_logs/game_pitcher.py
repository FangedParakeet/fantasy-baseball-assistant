from utils.functions import convert_utc_date
from models.game_logs.mlb_log import MlbLog

class GamePitcher(MlbLog):
    KEYS = ['game_id', 'home_team', 'away_team', 'home_pitcher_id', 'away_pitcher_id', 'game_date']
    ID_KEYS = ['game_id', 'home_team', 'away_team', 'game_date']

    def __init__(self, game_data, home_pitcher_id, away_pitcher_id):
        super().__init__()

        self.game_data = game_data
        self.home_pitcher_id = home_pitcher_id
        self.away_pitcher_id = away_pitcher_id
        self.set_values()

    def get_value_for_key(self, key):
        if key == 'home_team':
            return self.game_data.get('home_team', None)
        elif key == 'away_team':
            return self.game_data.get('away_team', None)
        elif key == 'home_pitcher_id':
            return self.home_pitcher_id
        elif key == 'away_pitcher_id':
            return self.away_pitcher_id
        elif key == 'game_id':
            return self.game_data['game_pk']
        elif key == 'game_date':
            return convert_utc_date(self.game_data['game_date'])
        else:
            return None