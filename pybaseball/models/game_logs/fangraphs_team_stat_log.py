from models.game_logs.mlb_log import MlbLog
from datetime import datetime, timezone

class FangraphsTeamStatLog(MlbLog):
    ID_KEYS = ['team', 'season_year']

    def __init__(self, team_data: dict, season_year=None):
        super().__init__()
        self.team_data = team_data
        self.season_year = season_year if season_year is not None else datetime.now().year

    def get_value_for_key(self, key):
        if key == 'team':
            return self.team_data.get('TeamNameAbb', 'Unknown')
        elif key == 'season_year':
            return self.season_year
        elif key == 'last_updated':
            return datetime.now(timezone.utc)
        else:
            return None