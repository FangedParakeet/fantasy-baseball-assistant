from models.game_logs.mlb_log import MlbLog

class GamePitcher(MlbLog):
    KEYS = ['game_id', 'home_team', 'away_team', 'home_pitcher_id', 'away_pitcher_id', 'game_date']
    ID_KEYS = ['game_id', 'home_team', 'away_team', 'game_date']

    def __init__(self, game_data, home_pitcher_id, away_pitcher_id):
        super().__init__(game_data)

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
        else:
            return super().get_value_for_key(key)