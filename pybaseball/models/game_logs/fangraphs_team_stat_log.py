from models.game_logs.mlb_log import MlbLog
from datetime import datetime, timezone

class FangraphsTeamStatLog(MlbLog):
    ID_KEYS = ['team']

    def __init__(self, team_data: dict):
        super().__init__()
        self.team_data = team_data

    def get_value_for_key(self, key):
        if key == 'team':
            return self.team_data.get('TeamNameAbb', 'Unknown')
        elif key == 'last_updated':
            return datetime.now(timezone.utc)
        else:
            return None