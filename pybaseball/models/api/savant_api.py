from datetime import datetime
from urllib.parse import urlencode
from io import StringIO
import pandas as pd
import requests
from utils.logger import logger

class SavantApi:
    BASE_URL = 'https://baseballsavant.mlb.com/leaderboard'

    def __init__(self):
        self.session = requests.Session()


    def request(self, endpoint: str, params: dict):
        url = f'{self.BASE_URL}/{endpoint}?{urlencode(params, doseq=True)}'
        logger.info(f"Fetching Baseball Savant data from {url}")
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/csv,text/plain,*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
        
        try:
            response = self.session.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            return pd.read_csv(StringIO(response.text))
        except requests.RequestException as e:
            logger.error(f"Error fetching Baseball Savant data: {e}")
            return None

    def get_default_params(self, position: str):
        return {
            'type': 'batter' if position == 'B' else 'pitcher',
            'year': datetime.now().year,
            'min': 1,
            'sort': 'player_name',
            'sort_order': 'asc',
            'csv': 'true'
        }

    def get_params(self, position: str):
        return self.get_default_params(position) | {
            'position': '',
            'team': '',
        }

    def get_advanced_params(self, position: str):
        return self.get_default_params(position) | {
            'filter': '',
            'chart': 'false',
            'x': 'player_age',
            'y': 'player_age',
            'r': 'no',
            'chartType': 'beeswarm'
        }

    def get_advanced_batting_params(self):
        selections = [
            'ab', 'hit', 'home_run', 'b_rbi', 'r_total_stolen_base', 'b_game', 'r_run', 'player_age', 
            'oz_swing_percent', 'out_zone_swing', 'iz_contact_percent', 'oz_contact_percent', 'in_zone_swing', 'whiff_percent', 
            'sprint_speed'
        ]
        return self.get_advanced_params('B') | {
            'selections': ','.join(selections),
        }

    def get_advanced_pitching_params(self):
        selections = [
            'player_age', 'p_game', 'hit', 'home_run', 
            'batting_avg', 'slg_percent', 'on_base_percent', 
            'p_run', 'woba', 'p_era',
            'p_save', 'p_quality_start', 'p_called_strike', 'p_hold', 
            'p_swinging_strike', 'pitch_count', 'groundballs_percent', 'flyballs_percent'
        ]
        return self.get_advanced_params('P') | {
            'selections': ','.join(selections),
        }

    def get_batting_stats(self):
        return self.request('statcast', self.get_params('B'))

    def get_advanced_batting_stats(self):
        return self.request('custom', self.get_advanced_batting_params())

    def get_pitching_stats(self):
        return self.request('custom', self.get_advanced_pitching_params())