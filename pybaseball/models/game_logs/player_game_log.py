from models.game_logs.game_log import GameLog

class PlayerGameLog(GameLog):
    KEYS = [
        'player_id', 'game_id', 'game_date', 'opponent', 'is_home', 'position', # General
        'ab', 'h', 'r', 'rbi', 'hr', 'sb', 'bb', 'k', # Batting
        'ip', 'er', 'hits_allowed', 'walks_allowed', 'strikeouts', 'qs', 'sv', 'hld', # Pitching
        'fantasy_points', 'team', # General'
        'singles', 'doubles', 'triples', 'total_bases', 'sac_flies', 'hit_by_pitch', 'ground_outs', 'air_outs', 'left_on_base', 'ground_into_dp', # Advanced Batting
        'batters_faced', 'wild_pitches', 'balks', 'home_runs_allowed', 'inherited_runners', 'inherited_runners_scored' # Advanced Pitching
    ]
    ID_KEYS = ['player_id', 'game_id', 'game_date']

    def __init__(self, player_id, team_home_or_away, game_data, box_score_data):
        super().__init__(team_home_or_away, game_data, box_score_data)

        self.player_id = player_id

    def get_player_id(self):
        return self.player_id

    def get_value_for_key(self, key):
        if key == 'player_id':
            return self.player_id
        elif key == 'fantasy_points':
            return None # Fantasy points not calculated yet
        else:
            return super().get_value_for_key(key)