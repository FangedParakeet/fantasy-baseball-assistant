from models.game_logs.player_game_log import PlayerGameLog

class BatterGameLog(PlayerGameLog):
    def __init__(self, player_id, team_home_or_away, game_data, box_score_data):
        super().__init__(player_id, team_home_or_away, game_data, box_score_data)

        team_data = box_score_data.get('teams', {}).get(team_home_or_away, {})
        batter_stats = team_data.get('players', {}).get(f'ID{player_id}', {})
        self.stats = batter_stats.get('stats', {}).get('batting', {})

        self.hits = self.stats.get('hits', 0)
        self.home_runs = self.stats.get('homeRuns', 0)
        self.doubles = self.stats.get('doubles', 0)
        self.triples = self.stats.get('triples', 0)
        self.singles = self.hits - self.doubles - self.triples - self.home_runs
        self.set_values()

    def get_value_for_key(self, key):
        if key == 'position':
            return 'B'
        elif key == 'ab':
            return self.stats.get('atBats', 0)
        elif key == 'h':
            return self.hits
        elif key == 'r':
            return self.stats.get('runs', 0)
        elif key == 'rbi':
            return self.stats.get('rbi', 0)
        elif key == 'hr':
            return self.home_runs
        elif key == 'sb':
            return self.stats.get('stolenBases', 0)
        elif key == 'bb':
            return self.stats.get('baseOnBalls', 0)
        elif key == 'k':
            return self.stats.get('strikeouts', 0)
        elif key == 'singles':
            return self.singles
        elif key == 'doubles':
            return self.doubles
        elif key == 'triples':
            return self.triples
        elif key == 'total_bases':
            return self.stats.get('totalBases', 0)
        elif key == 'sac_flies':
            return self.stats.get('sacFlies', 0)
        elif key == 'hit_by_pitch':
            return self.stats.get('hitByPitch', 0)
        elif key == 'ground_outs':
            return self.stats.get('groundOuts', 0)
        elif key == 'air_outs':
            return self.stats.get('airOuts', 0)
        elif key == 'left_on_base':
            return self.stats.get('leftOnBase', 0)
        elif key == 'ground_into_dp':
            return self.stats.get('groundIntoDoublePlay', 0)
        else:
            return super().get_value_for_key(key)
