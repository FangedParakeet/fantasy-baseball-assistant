from models.game_logs.mlb_log import MlbLog
from utils.functions import normalise_name
from datetime import datetime, timezone

class FangraphsPlayerStatLog(MlbLog):
    KEYS = ['fangraphs_player_id', 'normalised_name', 'team', 'position', 'last_updated', # ID
        'games', 'pa', 'ab', 'hits', 'hr', 'rbi', 'runs', 'sb', 'avg', 'obp', 'slg', 'ops', 'bb_rate', 'k_rate', # Basic stats
        'iso', 'babip', 'woba', 'wrc_plus', 'wraa', # Advanced batting stats
        'ip', 'era', 'whip', 'fip', 'x_fip', 'k_per_9', 'bb_per_9', 'hr_per_9', 'k_pct', 'bb_pct', 'lob_pct'] # Advanced pitching stats
    ID_KEYS = ['fangraphs_player_id']

    def __init__(self, player_info):
        super().__init__()
        self.player_info = player_info

    def get_value_for_key(self, key):
        if key == 'fangraphs_player_id':
            return self.player_info.get('playerId', None)
        elif key == 'normalised_name':
            return normalise_name(self.player_info.get('playerName', ''))
        elif key == 'team':
            return self.player_info.get('TeamNameAbb', '')
        elif key == 'last_updated':
            return datetime.now(timezone.utc)
        elif key == 'games':
            return int(self.player_info.get('G', 0)) if self.player_info.get('G') else None
        elif key == 'hits':
            return int(self.player_info.get('H', 0)) if self.player_info.get('H') else None
        elif key == 'hr':
            return int(self.player_info.get('HR', 0)) if self.player_info.get('HR') else None
        elif key == 'runs':
            return int(self.player_info.get('R', 0)) if self.player_info.get('R') else None
        elif key == 'avg':
            return float(self.player_info.get('AVG', 0)) if self.player_info.get('AVG') else None
        elif key == 'obp':
            return float(self.player_info.get('OBP', 0)) if self.player_info.get('OBP') else None
        elif key == 'slg':
            return float(self.player_info.get('SLG', 0)) if self.player_info.get('SLG') else None
        elif key == 'babip':
            return float(self.player_info.get('BABIP', 0)) if self.player_info.get('BABIP') else None
        elif key == 'woba':
            return float(self.player_info.get('wOBA', 0)) if self.player_info.get('wOBA') else None
        else:
            return None