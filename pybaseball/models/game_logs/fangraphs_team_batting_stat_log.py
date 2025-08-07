from models.game_logs.fangraphs_team_stat_log import FangraphsTeamStatLog

class FangraphsTeamBattingStatLog(FangraphsTeamStatLog):
    KEYS = [
        'team', 'last_updated', # ID
        'games_played', 'pa', 'ab', 'runs', 'hits', 'hr', 'rbi', 'sb', 'avg', 'obp', 'slg', 'ops', # Basic
        'bb_rate', 'k_rate', 'woba', 'wrc_plus', 'iso', 'babip', 'barrel_pct', 'hard_hit_pct', 'avg_ev', 'war' # Advanced
    ]

    def __init__(self, team_info):
        super().__init__(team_info)
        self.team_info = team_info
        self.set_values()

    def get_value_for_key(self, key):
        if key == 'games_played':
            return int(self.team_info.get('G', 0)) if self.team_info.get('G') else None
        elif key == 'pa':
            return int(self.team_info.get('PA', 0)) if self.team_info.get('PA') else None
        elif key == 'ab':
            return int(self.team_info.get('AB', 0)) if self.team_info.get('AB') else None
        elif key == 'runs':
            return int(self.team_info.get('R', 0)) if self.team_info.get('R') else None
        elif key == 'hits':
            return int(self.team_info.get('H', 0)) if self.team_info.get('H') else None
        elif key == 'hr':
            return int(self.team_info.get('HR', 0)) if self.team_info.get('HR') else None
        elif key == 'rbi':
            return int(self.team_info.get('RBI', 0)) if self.team_info.get('RBI') else None
        elif key == 'sb':
            return int(self.team_info.get('SB', 0)) if self.team_info.get('SB') else None
        elif key == 'avg':
            return float(self.team_info.get('AVG', 0)) if self.team_info.get('AVG') else None
        elif key == 'obp':
            return float(self.team_info.get('OBP', 0)) if self.team_info.get('OBP') else None
        elif key == 'slg':
            return float(self.team_info.get('SLG', 0)) if self.team_info.get('SLG') else None
        elif key == 'ops':
            return float(self.team_info.get('OPS', 0)) if self.team_info.get('OPS') else None
        elif key == 'bb_rate':
            return float(self.team_info.get('BB%', 0)) if self.team_info.get('BB%') else None
        elif key == 'k_rate':
            return float(self.team_info.get('K%', 0)) if self.team_info.get('K%') else None
        elif key == 'woba':
            return float(self.team_info.get('wOBA', 0)) if self.team_info.get('wOBA') else None
        elif key == 'wrc_plus':
            return int(self.team_info.get('wRC+', 0)) if self.team_info.get('wRC+') else None
        elif key == 'iso':
            return float(self.team_info.get('ISO', 0)) if self.team_info.get('ISO') else None
        elif key == 'babip':
            return float(self.team_info.get('BABIP', 0)) if self.team_info.get('BABIP') else None
        elif key == 'barrel_pct':
            return float(self.team_info.get('Barrel%', 0)) if self.team_info.get('Barrel%') else None
        elif key == 'hard_hit_pct':
            return float(self.team_info.get('HardHit%', 0)) if self.team_info.get('HardHit%') else None
        elif key == 'avg_ev':
            return float(self.team_info.get('EV', 0)) if self.team_info.get('EV') else None
        elif key == 'war':
            return float(self.team_info.get('WAR', 0)) if self.team_info.get('WAR') else None
        else:
            return super().get_value_for_key(key)