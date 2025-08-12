from models.game_logs.player_game_log import PlayerGameLog

class PitcherGameLog(PlayerGameLog):
    def __init__(self, player_id, team_home_or_away, game_data, box_score_data, line_score_data):
        super().__init__(player_id, team_home_or_away, game_data, box_score_data)

        team_data = box_score_data.get('teams', {}).get(team_home_or_away, {})
        pitcher_stats = team_data.get('players', {}).get(f'ID{player_id}', {})
        self.stats = pitcher_stats.get('stats', {}).get('pitching', {})
        
        self.is_starting = self.stats.get('gamesStarted', 0) == 1

        ip_str = self.stats.get('inningsPitched', '0')
        if ip_str and ip_str != '0':
            self.ip = float(self.ip_to_decimal(ip_str))
        else:
            self.ip = 0.0
            
        self.er = self.stats.get('earnedRuns', 0)

        innings = line_score_data.get('innings', [])
        if innings:
            first_inning = innings[0]
            opponent_team_home_or_away = 'away' if self.team_home_or_away == 'home' else 'home'
            first_inning_runs_allowed = first_inning.get(opponent_team_home_or_away, {}).get('runs', 0)
            self.nrfi = 1 if self.is_starting and first_inning_runs_allowed == 0 else 0
        else:
            self.nrfi = 0

        self.set_values()

    def is_starting_pitcher(self):
        return self.is_starting

    def get_value_for_key(self, key):
        if key == 'position':
            return 'P'
        elif key == 'ip':
            return self.ip
        elif key == 'er':
            return self.er
        elif key == 'hits_allowed':
            return self.stats.get('hits', 0)
        elif key == 'walks_allowed':
            return self.stats.get('baseOnBalls', 0)
        elif key == 'strikeouts':
            return self.stats.get('strikeOuts', 0)
        elif key == 'qs':
            return 1 if self.is_starting and self.ip >= 6 and self.er <= 3 else 0
        elif key == 'sv':
            return 1 if self.stats.get('saves', 0) > 0 else 0
        elif key == 'hld':
            return 1 if self.stats.get('holds', 0) > 0 else 0
        elif key == 'nrfi':
            return self.nrfi
        elif key == 'batters_faced':
            return self.stats.get('battersFaced', 0)
        elif key == 'wild_pitches':
            return self.stats.get('wildPitches', 0)
        elif key == 'balks':
            return self.stats.get('balks', 0)
        elif key == 'home_runs_allowed':
            return self.stats.get('homeRuns', 0)
        elif key == 'inherited_runners':
            return self.stats.get('inheritedRunners', 0)
        elif key == 'inherited_runners_scored':
            return self.stats.get('inheritedRunnersScored', 0)
        else:
            return super().get_value_for_key(key)
