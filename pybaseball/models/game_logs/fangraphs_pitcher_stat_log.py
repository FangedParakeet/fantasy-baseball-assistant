from models.game_logs.fangraphs_player_stat_log import FangraphsPlayerStatLog

class FangraphsPitcherStatLog(FangraphsPlayerStatLog):

    def __init__(self, player_info):
        super().__init__(player_info)
        self.player_info = player_info
        self.set_values()

    def get_value_for_key(self, key):
        if key == 'position':
            return 'P'
        elif key == 'ip':
            return float(self.player_info.get('IP', 0)) if self.player_info.get('IP') else None
        elif key == 'era':
            return float(self.player_info.get('ERA', 0)) if self.player_info.get('ERA') else None
        elif key == 'whip':
            return float(self.player_info.get('WHIP', 0)) if self.player_info.get('WHIP') else None
        elif key == 'fip':
            return float(self.player_info.get('FIP', 0)) if self.player_info.get('FIP') else None
        elif key == 'x_fip':
            return float(self.player_info.get('xFIP', 0)) if self.player_info.get('xFIP') else None
        elif key == 'k_per_9':
            return float(self.player_info.get('K/9', 0)) if self.player_info.get('K/9') else None
        elif key == 'bb_per_9':
            return float(self.player_info.get('BB/9', 0)) if self.player_info.get('BB/9') else None
        elif key == 'hr_per_9':
            return float(self.player_info.get('HR/9', 0)) if self.player_info.get('HR/9') else None
        elif key == 'k_pct':
            return float(self.player_info.get('K%', 0)) if self.player_info.get('K%') else None
        elif key == 'bb_pct':
            return float(self.player_info.get('BB%', 0)) if self.player_info.get('BB%') else None
        elif key == 'lob_pct':
            return float(self.player_info.get('LOB%', 0)) if self.player_info.get('LOB%') else None
        else:
            return super().get_value_for_key(key)