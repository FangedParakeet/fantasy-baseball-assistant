from models.game_logs.mlb_log import MlbLog
from datetime import datetime, timezone

class SavantPlayerStatLog(MlbLog):
    ID_KEYS = ['player_id']

    def __init__(self, player_data: dict):
        super().__init__()
        self.player_data = player_data

    def get_value_for_key(self, key: str):
        if key == 'player_id':
            return self.player_data.get('player_id', None)
        elif key == 'last_updated':
            return datetime.now(timezone.utc)
        else:
            return None