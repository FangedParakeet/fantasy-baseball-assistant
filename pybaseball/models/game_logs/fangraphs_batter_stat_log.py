from models.game_logs.fangraphs_player_stat_log import FangraphsPlayerStatLog

class FangraphsBatterStatLog(FangraphsPlayerStatLog):

    def __init__(self, player_info):
        super().__init__(player_info)
        self.player_info = player_info
        self.set_values()

    def get_value_for_key(self, key):
        if key == 'position':
            return 'B'
        elif key == 'pa':
            return int(self.player_info.get('PA', 0)) if self.player_info.get('PA') else None
        elif key == 'ab':
            return int(self.player_info.get('AB', 0)) if self.player_info.get('AB') else None
        elif key == 'rbi':
            return int(self.player_info.get('RBI', 0)) if self.player_info.get('RBI') else None
        elif key == 'sb':
            return int(self.player_info.get('SB', 0)) if self.player_info.get('SB') else None
        elif key == 'ops':
            return float(self.player_info.get('OPS', 0)) if self.player_info.get('OPS') else None
        elif key == 'bb_rate':
            return float(self.player_info.get('BB%', 0)) if self.player_info.get('BB%') else None
        elif key == 'k_rate':
            return float(self.player_info.get('K%', 0)) if self.player_info.get('K%') else None
        elif key == 'iso':
            return float(self.player_info.get('ISO', 0)) if self.player_info.get('ISO') else None
        elif key == 'wrc_plus':
            return int(float(self.player_info.get('wRC+', 0))) if self.player_info.get('wRC+') else None
        elif key == 'wraa':
            return float(self.player_info.get('wRAA', 0)) if self.player_info.get('wRAA') else None
        else:
            return super().get_value_for_key(key)