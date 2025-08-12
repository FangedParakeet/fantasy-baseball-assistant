from models.game_logs.mlb_log import MlbLog
import json

class YahooPlayerLog(MlbLog):
    KEYS = [
        'yahoo_player_id', 'mlb_team',
        'eligible_positions', 'headshot_url', 'normalised_name', 'name',
        'is_c', 'is_1b', 'is_2b', 'is_3b', 'is_ss', 'is_of', 'is_util', 'is_sp', 'is_rp'
    ]
    ID_KEYS = ['yahoo_player_id']

    POSITION_MAP = {
        'C': 'is_c',
        '1B': 'is_1b',
        '2B': 'is_2b',
        '3B': 'is_3b',
        'SS': 'is_ss',
        'OF': 'is_of',
        'UTIL': 'is_util',
        'SP': 'is_sp',
        'RP': 'is_rp'
    }
    
    def __init__(self, player_data: dict):
        super().__init__()
        self.player_data = player_data
        self.position_flags = {key: 0 for key in self.POSITION_MAP.values()}
        for position in self.player_data.get('eligible_positions', []):
            if position in self.POSITION_MAP:
                self.position_flags[self.POSITION_MAP[position]] = 1

        self.set_values()


    def get_value_for_key(self, key):
        if key == 'yahoo_player_id':
            return self.player_data.get('yahoo_player_id', None)
        elif key == 'mlb_team':
            return self.player_data.get('mlb_team', None)
        elif key == 'eligible_positions':
            return json.dumps(self.player_data.get('eligible_positions', []))
        elif key == 'headshot_url':
            return self.player_data.get('headshot_url', None)
        elif key == 'normalised_name':
            return self.player_data.get('normalised_name', None)
        elif key == 'name':
            return self.player_data.get('name', None)
        elif key == 'is_c':
            return self.position_flags.get('is_c', 0)
        elif key == 'is_1b':
            return self.position_flags.get('is_1b', 0)
        elif key == 'is_2b':
            return self.position_flags.get('is_2b', 0)
        elif key == 'is_3b':
            return self.position_flags.get('is_3b', 0)
        elif key == 'is_ss':
            return self.position_flags.get('is_ss', 0)
        elif key == 'is_of':
            return self.position_flags.get('is_of', 0)
        elif key == 'is_util':
            return self.position_flags.get('is_util', 0)
        elif key == 'is_sp':
            return self.position_flags.get('is_sp', 0)
        elif key == 'is_rp':
            return self.position_flags.get('is_rp', 0)
        else:
            return None
