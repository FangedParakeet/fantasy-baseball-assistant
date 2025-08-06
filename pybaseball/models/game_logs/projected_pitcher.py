from models.game_logs.mlb_log import MlbLog

class ProjectedPitcher(MlbLog):
    KEYS = ['game_id', 'game_date', 'team', 'opponent', 'player_id', 'espn_pitcher_id', 'normalised_name', 'home', 'accuracy']
    ID_KEYS = ['game_id', 'game_date', 'team', 'opponent', 'home']

    def __init__(self, game_id, game_date, team, opponent, player_id, espn_pitcher_id, normalised_name, home):
        super().__init__()
        self.game_id = game_id
        self.game_date = game_date
        self.team = team
        self.opponent = opponent
        self.player_id = player_id
        self.espn_pitcher_id = espn_pitcher_id
        self.normalised_name = normalised_name
        self.home = home
        self.set_values()

    def get_value_for_key(self, key):
        if key == 'game_id':
            return self.game_id
        if key == 'game_date':
            return self.game_date
        elif key == 'team':
            return self.team
        elif key == 'opponent':
            return self.opponent
        elif key == 'player_id':
            return self.player_id
        elif key == 'home':
            return self.home
        elif key == 'espn_pitcher_id':
            return self.espn_pitcher_id
        elif key == 'normalised_name':
            return self.normalised_name
        elif key == 'accuracy':
            return 'projected'
        else:
            return None
