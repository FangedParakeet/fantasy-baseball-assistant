from models.game_logs.savant_player_stat_log import SavantPlayerStatLog

class SavantBatterStatLog(SavantPlayerStatLog):
    KEYS = [
        'player_id', 'position', 'last_updated', # ID
        'barrel_pct', 'hard_hit_pct', 'avg_ev', 'max_ev', 'sweet_spot_pct' # Statcast batting stats
    ]

    def __init__(self, player_data: dict):
        super().__init__(player_data)
        self.player_data = player_data
        self.set_values()

    def get_value_for_key(self, key: str):
        if key == 'position':
            return 'B'
        elif key == 'barrel_pct':
            return self.get_clean_value('brl_percent')
        elif key == 'hard_hit_pct':
            return self.get_clean_value('ev95percent')
        elif key == 'avg_ev':
            return self.get_clean_value('avg_hit_speed')
        elif key == 'max_ev':
            return self.get_clean_value('max_hit_speed')
        elif key == 'sweet_spot_pct':
            return self.get_clean_value('anglesweetspotpercent')
        else:
            return super().get_value_for_key(key)