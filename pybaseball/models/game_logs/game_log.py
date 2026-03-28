import re
from utils.functions import convert_utc_date
from models.game_logs.mlb_log import MlbLog
from utils.constants import MLB_TO_BACKEND_TEAM_MAP

class GameLog(MlbLog):    
    def __init__(self, team_home_or_away, game_data, box_score_data):
        super().__init__()

        self.team_home_or_away = team_home_or_away
        self.opponent_team_home_or_away = 'away' if team_home_or_away == 'home' else 'home'
        self.game_data = game_data
        
        team_data = box_score_data.get('teams', {}).get(team_home_or_away, {})
        self.team = team_data.get('team', {}).get('abbreviation', None)

    def get_value_for_key(self, key):
        if key == 'team':
            return MLB_TO_BACKEND_TEAM_MAP.get(self.team, self.team)
        elif key == 'opponent':
            return self.game_data.get(f'{self.opponent_team_home_or_away}_team', None)
        elif key == 'is_home':
            return self.team_home_or_away == 'home'
        elif key == 'game_id':
            return self.game_data['game_pk']
        elif key == 'game_date':
            return convert_utc_date(self.game_data['game_date'])
        else:
            return None

    def ip_to_decimal(self, ip_str):
        # MLB API returns '-' for stats that are not applicable (e.g. no IP recorded yet)
        if not ip_str or ip_str in ('0', '-'):
            return '0'

        ip_str = re.sub(r'\.1$', '.333', str(ip_str))
        ip_str = re.sub(r'\.2$', '.667', ip_str)

        return ip_str

    @staticmethod
    def safe_float(value, default: float = 0.0) -> float:
        """Convert a value to float, returning default for '-', None, or any non-numeric string."""
        try:
            return float(value)
        except (ValueError, TypeError):
            return default