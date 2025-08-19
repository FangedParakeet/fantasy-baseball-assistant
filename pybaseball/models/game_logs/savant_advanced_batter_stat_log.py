from models.game_logs.savant_player_stat_log import SavantPlayerStatLog
import math
import logging

logger = logging.getLogger(__name__)

class SavantAdvancedBatterStatLog(SavantPlayerStatLog):
    KEYS = [
        'player_id', 'position', 'last_updated', # ID
        'games', 'ab', 'hits', 'hr', 'rbi', 'runs', 'sb', # Basic counting stats
        'chase_pct', 'contact_pct', 'zone_contact_pct', 'whiff_pct', # Plate discipline
        'sprint_speed', 'age' # Meta
    ]

    def __init__(self, player_data: dict):
        super().__init__(player_data)
        self.player_data = player_data

        self.zone_contact_pct = self.get_clean_value('iz_contact_percent')
        zone_swings = self.get_clean_value('in_zone_swing')
        self.out_of_zone_contact_pct = self.get_clean_value('oz_contact_percent')
        out_of_zone_swings = self.get_clean_value('out_zone_swing')
        if zone_swings and out_of_zone_swings and self.zone_contact_pct and self.out_of_zone_contact_pct:
            total_swings = zone_swings + out_of_zone_swings
            contact_pct = ((self.zone_contact_pct * zone_swings) + (self.out_of_zone_contact_pct * out_of_zone_swings)) / total_swings
            self.contact_pct = contact_pct if not math.isnan(contact_pct) else None
        else:
            self.contact_pct = None
        
        self.set_values()


    def get_value_for_key(self, key: str):
        if key == 'position':
            return 'B'
        elif key == 'chase_pct':
            return self.out_of_zone_contact_pct
        elif key == 'contact_pct':
            return self.contact_pct
        elif key == 'zone_contact_pct':
            return self.zone_contact_pct
        elif key == 'whiff_pct':
            return self.get_clean_value('whiff_percent')
        elif key == 'sprint_speed':
            return self.get_clean_value('sprint_speed')
        elif key == 'age':
            return self.get_clean_value('player_age')
        elif key == 'games':
            return self.get_clean_value('b_game')
        elif key == 'ab':
            return self.get_clean_value('ab')
        elif key == 'hits':
            return self.get_clean_value('hit')
        elif key == 'hr':
            return self.get_clean_value('home_run')
        elif key == 'rbi':
            return self.get_clean_value('b_rbi')
        elif key == 'runs':
            return self.get_clean_value('r_run')
        elif key == 'sb':
            return self.get_clean_value('r_total_stolen_base')
        else:
            return super().get_value_for_key(key)