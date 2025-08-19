from models.game_logs.mlb_log import MlbLog
from utils.functions import normalise_name
from datetime import datetime, timezone

class FangraphsPlayerStatLog(MlbLog):
    ID_KEYS = ['fangraphs_player_id', 'position']

    def __init__(self, player_info):
        super().__init__()
        self.player_info = player_info

    def get_value_for_key(self, key):
        if key == 'fangraphs_player_id':
            return self.player_info.get('playerid', None)
        elif key == 'normalised_name':
            return normalise_name(self.player_info.get('playerName', ''))
        elif key == 'team':
            return self.player_info.get('TeamNameAbb', '')
        elif key == 'last_updated':
            return datetime.now(timezone.utc)
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