from models.game_logs.savant_player_stat_log import SavantPlayerStatLog
import math

class SavantPitcherStatLog(SavantPlayerStatLog):
    KEYS = [
        'player_id', 'position', 'last_updated', # ID
        'games', 'hits', 'hr', 'runs', 'avg', 'obp', 'slg',  # Basic counting stats
        'woba', 'era',  # Advanced batting/pitching stats
        'csw_pct', 'swinging_strike_pct', 'ground_ball_pct', 'fly_ball_pct', # Advanced pitching stats
        'qs', 'sv', 'hld', # Results based
        'age' # Meta
    ]

    def __init__(self, player_data: dict):
        super().__init__(player_data)
        self.player_data = player_data
        
        swinging_strikes = self.get_clean_value('p_swinging_strike')
        called_strikes = self.get_clean_value('p_called_strike')
        total_pitches = self.get_clean_value('pitch_count')

        if swinging_strikes and called_strikes and total_pitches:
            called_strikes_whiffs_pct = (called_strikes + swinging_strikes) * 100 / total_pitches
            self.called_strikes_whiffs_pct = called_strikes_whiffs_pct if not math.isnan(called_strikes_whiffs_pct) else None
        else:
            self.called_strikes_whiffs_pct = None
        
        if swinging_strikes and total_pitches:
            swinging_strike_pct = swinging_strikes * 100 / total_pitches
            self.swinging_strike_pct = swinging_strike_pct if not math.isnan(swinging_strike_pct) and swinging_strike_pct < 100 else None
        else:
            self.swinging_strike_pct = None
        
        self.set_values()

    def get_value_for_key(self, key: str):
        if key == 'position':
            return 'P'
        elif key == 'csw_pct':
            return self.called_strikes_whiffs_pct
        elif key == 'swinging_strike_pct':
            return self.swinging_strike_pct
        elif key == 'ground_ball_pct':
            return self.get_clean_value('groundballs_percent')
        elif key == 'fly_ball_pct':
            return self.get_clean_value('flyballs_percent')
        elif key == 'qs':
            return self.get_clean_value('p_quality_start')
        elif key == 'sv':
            return self.get_clean_value('p_save')
        elif key == 'hld':
            return self.get_clean_value('p_hold')
        elif key == 'age':
            return self.get_clean_value('player_age')
        elif key == 'games':
            return self.get_clean_value('p_game')
        elif key == 'hits':
            return self.get_clean_value('hit')
        elif key == 'hr':
            return self.get_clean_value('home_run')
        elif key == 'runs':
            return self.get_clean_value('p_run')
        elif key == 'avg':
            return self.get_clean_value('batting_avg')
        elif key == 'obp':
            return self.get_clean_value('on_base_percent')
        elif key == 'slg':
            return self.get_clean_value('slg_percent')
        elif key == 'woba':
            return self.get_clean_value('woba')
        elif key == 'era':
            return self.get_clean_value('p_era')
        else:
            return super().get_value_for_key(key)