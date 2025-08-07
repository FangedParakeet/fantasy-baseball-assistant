from models.game_logs.fangraphs_team_stat_log import FangraphsTeamStatLog

class FangraphsTeamPitchingStatLog(FangraphsTeamStatLog):
    KEYS = [
        'team', 'last_updated', # ID
        'ip', 'era', 'whip', 'fip', 'x_fip', 'k_per_9', 'bb_per_9', 'hr_per_9', # Pitching
        'k_pct', 'bb_pct', 'swinging_strike_pct', 'csw_pct', 'ground_ball_pct', 'fly_ball_pct', 'lob_pct', # Statcast
    ]

    def __init__(self, team_data):
        super().__init__(team_data)
        self.team_data = team_data
        self.set_values()

    def get_value_for_key(self, key):
        if key == 'ip':
            return float(self.team_data.get('IP', 0)) if self.team_data.get('IP') else None
        elif key == 'era':
            return float(self.team_data.get('ERA', 0)) if self.team_data.get('ERA') else None
        elif key == 'whip':
            return float(self.team_data.get('WHIP', 0)) if self.team_data.get('WHIP') else None
        elif key == 'fip':
            return float(self.team_data.get('FIP', 0)) if self.team_data.get('FIP') else None
        elif key == 'x_fip':
            return float(self.team_data.get('xFIP', 0)) if self.team_data.get('xFIP') else None
        elif key == 'k_per_9':
            return float(self.team_data.get('K/9', 0)) if self.team_data.get('K/9') else None
        elif key == 'bb_per_9':
            return float(self.team_data.get('BB/9', 0)) if self.team_data.get('BB/9') else None
        elif key == 'hr_per_9':
            return float(self.team_data.get('HR/9', 0)) if self.team_data.get('HR/9') else None
        elif key == 'k_pct':
            return float(self.team_data.get('K%', 0)) if self.team_data.get('K%') else None
        elif key == 'bb_pct':
            return float(self.team_data.get('BB%', 0)) if self.team_data.get('BB%') else None
        elif key == 'swinging_strike_pct':
            return float(self.team_data.get('LOB%', 0)) if self.team_data.get('LOB%') else None
        elif key == 'csw_pct':
            return float(self.team_data.get('LOB%', 0)) if self.team_data.get('LOB%') else None
        elif key == 'ground_ball_pct':
            return float(self.team_data.get('LOB%', 0)) if self.team_data.get('LOB%') else None
        elif key == 'fly_ball_pct':
            return float(self.team_data.get('LOB%', 0)) if self.team_data.get('LOB%') else None
        elif key == 'lob_pct':
            return float(self.team_data.get('LOB%', 0)) if self.team_data.get('LOB%') else None
        else:
            return super().get_value_for_key(key)