from models.game_logs.savant_player_stat_log import SavantPlayerStatLog
import math

class SavantPitcherStatLog(SavantPlayerStatLog):
    KEYS = [
        'player_id', 'last_updated', # ID
        'csw_pct', 'swinging_strike_pct', 'ground_ball_pct', 'fly_ball_pct', # Advanced pitching stats
        'qs', 'sv', 'hld', # Results based
        'age' # Meta
    ]

    def __init__(self, player_data: dict):
        super().__init__(player_data)
        self.player_data = player_data
        
        swinging_strikes = self.player_data.get('p_swinging_strike', 0) if self.player_data.get('p_swinging_strike') else 0
        called_strikes = self.player_data.get('p_called_strike', 0) if self.player_data.get('p_called_strike') else 0
        total_pitches = self.player_data.get('pitch_count', 0) if self.player_data.get('pitch_count') else 0
        called_strikes_whiffs_pct = (called_strikes + swinging_strikes) * 100 / total_pitches
        swinging_strike_pct = swinging_strikes * 100 / total_pitches
        self.swinging_strike_pct = swinging_strike_pct if not math.isnan(swinging_strike_pct) else None
        self.called_strikes_whiffs_pct = called_strikes_whiffs_pct if not math.isnan(called_strikes_whiffs_pct) else None
        
        self.set_values()

    def get_value_for_key(self, key: str):
        if key == 'csw_pct':
            return self.called_strikes_whiffs_pct
        elif key == 'swinging_strike_pct':
            return self.swinging_strike_pct
        elif key == 'ground_ball_pct':
            return float(self.player_data.get('groundballs_percent', 0)) if self.player_data.get('groundballs_percent') else None
        elif key == 'fly_ball_pct':
            return float(self.player_data.get('flyballs_percent', 0)) if self.player_data.get('flyballs_percent') else None
        elif key == 'qs':
            return int(self.player_data.get('p_quality_start', 0)) if self.player_data.get('p_quality_start') else None
        elif key == 'sv':
            return int(self.player_data.get('p_save', 0)) if self.player_data.get('p_save') else None
        elif key == 'hld':
            return int(self.player_data.get('p_hold', 0)) if self.player_data.get('p_hold') else None
        elif key == 'age':
            return int(self.player_data.get('player_age', 0)) if self.player_data.get('player_age') else None
        else:
            return super().get_value_for_key(key)