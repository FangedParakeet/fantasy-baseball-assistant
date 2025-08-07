from models.game_logs.savant_player_stat_log import SavantPlayerStatLog

class SavantBatterStatLog(SavantPlayerStatLog):
    KEYS = [
        'player_id', 'last_updated', # ID
        'barrel_pct', 'hard_hit_pct', 'avg_ev', 'max_ev', 'sweet_spot_pct' # Statcast batting stats
    ]

    def __init__(self, player_data: dict):
        super().__init__(player_data)
        self.player_data = player_data
        self.set_values()

    def get_value_for_key(self, key: str):
        if key == 'barrel_pct':
            return float(self.player_data.get('brl_percent', 0)) if self.player_data.get('brl_percent') else None
        elif key == 'hard_hit_pct':
            return float(self.player_data.get('ev95percent', 0)) if self.player_data.get('ev95percent') else None
        elif key == 'avg_ev':
            return float(self.player_data.get('avg_hit_speed', 0)) if self.player_data.get('avg_hit_speed') else None
        elif key == 'max_ev':
            return float(self.player_data.get('max_hit_speed', 0)) if self.player_data.get('max_hit_speed') else None
        elif key == 'sweet_spot_pct':
            return float(self.player_data.get('anglesweetspotpercent', 0)) if self.player_data.get('anglesweetspotpercent') else None
        else:
            return super().get_value_for_key(key)