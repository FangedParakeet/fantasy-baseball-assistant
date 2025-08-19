import requests
from datetime import datetime
from utils.logger import logger
from utils.constants import SEASON_START_DATE, SEASON_END_DATE

class FangraphsApi:
    BASE_URL = 'https://www.fangraphs.com/api/leaders/'

    def __init__(self):
        self.session = requests.Session()

    def request(self, method: str, endpoint: str, headers: dict, params: dict) -> dict:
        try:
            logger.info(f"Fetching data from Fangraphs: {self.BASE_URL + endpoint}")
            if method == 'POST':
                response = self.session.post(self.BASE_URL + endpoint, headers=headers, json=params)
            elif method == 'GET':
                response = self.session.get(self.BASE_URL + endpoint, headers=headers, params=params)
            else:
                raise ValueError(f"Invalid method: {method}")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching data from Fangraphs: {e}")
            return None

    def get_player_payload(self, position: str):
        return {
            "strPlayerId": "all",
            "strSplitArr": [],
            "strGroup": "season",
            "strPosition": position,  # Batters
            "strType": "2",  # Advanced stats
            "strStartDate": SEASON_START_DATE,
            "strEndDate": SEASON_END_DATE,
            "strSplitTeams": False,
            "dctFilters": [],
            "strStatType": "player",
            "strAutoPt": False,  # Remove auto qualification to include players with limited data
            "arrPlayerId": [],
            "strSplitArrPitch": [],
            "arrWxTemperature": None,
            "arrWxPressure": None,
            "arrWxAirDensity": None,
            "arrWxElevation": None,
            "arrWxWindSpeed": None,
            "players": "",
            "filter": "",
            "groupBy": "season",
            "sort": "16,-1" if position == "B" else "1,-1" # Sort by wRC+ descending for batters, ERA ascending for pitchers
        }

    def get_team_payload(self, position: str):
        return {
                'age': '',
                'pos': 'all',
                'stats': 'bat' if position == 'B' else 'pit',
                'lg': 'all',
                'qual': 'y',
                'season': datetime.now().year,
                'season1': datetime.now().year,
                'startdate': SEASON_START_DATE,
                'enddate': SEASON_END_DATE,
                'month': '0',
                'hand': '',
                'team': '0,ts',  # This might be the key for team stats
                'pageitems': '30',
                'pagenum': '1',
                'ind': '0',
                'rost': '0',
                'players': '',
                'type': '8',
                'postseason': '',
                'sortdir': 'default',
                'sortstat': 'WAR' if position == 'B' else 'ERA'
        }

    def get_player_data(self, position: str):
        payload = self.get_player_payload(position)
        headers = {
            "Content-Type": "application/json",
            "Referer": "https://www.fangraphs.com/leaders/splits-leaderboards"
        }
        return self.request('POST', 'splits/splits-leaders', headers, payload)

    def get_team_data(self, position: str):
        payload = self.get_team_payload(position)
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Referer": "https://www.fangraphs.com/leaders"
        }
        return self.request('GET', 'major-league/data', headers, payload)
