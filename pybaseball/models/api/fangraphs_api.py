import requests
from utils.logger import logger
from utils.constants import SEASON_START_DATE, SEASON_END_DATE

class FangraphsApi:
    BASE_URL = 'https://www.fangraphs.com/api/leaders/'

    def __init__(self):
        self.session = requests.Session()

    def request(self, endpoint: str, headers: dict, params: dict) -> dict:
        try:
            logger.info(f"Fetching data from Fangraphs: {self.BASE_URL + endpoint}")
            response = self.session.post(self.BASE_URL + endpoint, headers=headers, json=params)
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
            "strAutoPt": True,
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

    def get_player_data(self, position: str):
        payload = self.get_player_payload(position)
        headers = {
            "Content-Type": "application/json",
            "Referer": "https://www.fangraphs.com/leaders/splits-leaderboards"
        }
        return self.request('splits/splits-leaders', headers, payload)
