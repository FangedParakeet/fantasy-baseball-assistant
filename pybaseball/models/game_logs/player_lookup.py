from datetime import datetime, timezone
from models.game_logs.mlb_log import MlbLog
from utils.functions import normalise_name

class PlayerLookup(MlbLog):
    KEYS = ['player_id', 'normalised_name', 'first_name', 'last_name', 'last_updated']
    ID_KEYS = ['player_id']

    def __init__(self, extra_keys, player_info, team=None):
        # Create an instance copy of KEYS to avoid modifying the class variable
        self.KEYS = self.KEYS.copy() + extra_keys
        super().__init__()
        self.player_info = player_info
        self.team = team

        self.full_name = self.player_info.get('fullName')
        if self.player_info.get('firstName') and self.player_info.get('lastName'):
            self.first_name = self.player_info.get('firstName')
            self.last_name = self.player_info.get('lastName')
        else:
            name_parts = self.full_name.split(' ', 1)
            self.first_name = name_parts[0] if len(name_parts) > 0 else ''
            self.last_name = name_parts[1] if len(name_parts) > 1 else ''

        self.set_values()

    def get_value_for_key(self, key):
        if key == 'player_id':
            return self.player_info.get('id', None)
        if key == 'normalised_name':
            return normalise_name(self.full_name)
        if key == 'first_name':
            return self.first_name
        if key == 'last_name':
            return self.last_name
        if key == 'team':
            return self.team
        if key == 'bats':
            return self.player_info.get('batSide', {}).get('code', None)
        if key == 'throws':
            return self.player_info.get('pitchHand', {}).get('code', None)
        if key == 'last_updated':
            return datetime.now(timezone.utc)
        if key == 'status':
            return 'Active'
        else:
            return None
