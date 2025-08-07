from models.game_logs.savant_player_stat_log import SavantPlayerStatLog
import math

class SavantAdvancedBatterStatLog(SavantPlayerStatLog):
    KEYS = [
        'player_id', 'last_updated', # ID
        'chase_pct', 'contact_pct', 'zone_contact_pct', 'whiff_pct', # Plate discipline
        'sprint_speed', 'age' # Meta
    ]

    def __init__(self, player_data: dict):
        super().__init__(player_data)
        self.player_data = player_data

        self.zone_contact_pct = self.player_data.get('iz_contact_percent', 0) if self.player_data.get('iz_contact_percent') else 0
        zone_swings = self.player_data.get('in_zone_swing', 0) if self.player_data.get('in_zone_swing') else 0
        self.out_of_zone_contact_pct = self.player_data.get('oz_contact_percent', 0) if self.player_data.get('oz_contact_percent') else 0
        out_of_zone_swings = self.player_data.get('out_zone_swing', 0) if self.player_data.get('out_zone_swing') else 0
        total_swings = zone_swings + out_of_zone_swings
        contact_pct = ((self.zone_contact_pct * zone_swings) + (self.out_of_zone_contact_pct * out_of_zone_swings)) / total_swings
        self.contact_pct = contact_pct if not math.isnan(contact_pct) else None
        
        self.set_values()


    def get_value_for_key(self, key: str):
        if key == 'chase_pct':
            return self.out_of_zone_contact_pct
        elif key == 'contact_pct':
            return self.contact_pct
        elif key == 'zone_contact_pct':
            return self.zone_contact_pct
        elif key == 'whiff_pct':
            return float(self.player_data.get('whiff_percent', 0)) if self.player_data.get('whiff_percent') else None
        elif key == 'sprint_speed':
            return float(self.player_data.get('sprint_speed', 0)) if self.player_data.get('sprint_speed') else None
        elif key == 'age':
            return int(self.player_data.get('player_age', 0)) if self.player_data.get('player_age') else None
        else:
            return super().get_value_for_key(key)