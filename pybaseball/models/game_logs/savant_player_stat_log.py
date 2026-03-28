from models.game_logs.mlb_log import MlbLog
from datetime import datetime, timezone

class SavantPlayerStatLog(MlbLog):
    ID_KEYS = ['player_id', 'position', 'season_year']

    def __init__(self, player_data: dict, season_year=None):
        super().__init__()
        self.player_data = player_data
        self.season_year = season_year if season_year is not None else datetime.now().year

    def get_clean_value(self, key: str):
        value = self.player_data.get(key, None)
        if value and str(value).lower() != 'nan':
            return value
        return None

    def get_value_for_key(self, key: str):
        if key == 'player_id':
            return self.get_clean_value('player_id')
        elif key == 'season_year':
            return self.season_year
        elif key == 'last_updated':
            return datetime.now(timezone.utc)
        else:
            return None