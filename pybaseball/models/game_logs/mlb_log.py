from utils.functions import convert_utc_date

class MlbLog:
    KEYS = [] # Set in child class
    
    def __init__(self, game_data=None):
        self.game_data = game_data
        self.values = [None] * len(self.KEYS)

    def get_values(self):
        return self.values

    def set_values(self):
        for index, key in enumerate(self.KEYS):
            self.set_values_for_key(index, key)

    def set_values_for_key(self, index, key):
        value = self.get_value_for_key(key)
        self.values[index] = value

    def get_value_for_key(self, key):
        if key == 'game_id':
            return self.game_data['game_pk']
        elif key == 'game_date':
            return convert_utc_date(self.game_data['game_date'])
        else:
            return None

