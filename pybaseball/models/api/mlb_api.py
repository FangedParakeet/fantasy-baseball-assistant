import requests
import time
from utils.logger import logger
from urllib.parse import urlencode

class MlbApi:
    URL_BASE = "https://statsapi.mlb.com/api/v1"
    MAX_RETRIES = 3
    MAX_PLAYERS_PER_REQUEST = 100
    RETRY_WAIT_TIME = 1.0

    def __init__(self):
        self.session = requests.Session()

    def request(self, endpoint: str, params: dict = None) -> dict:
        url = f"{self.URL_BASE}/{endpoint}"
        logger.info(f"Fetching MLB data from {url}")
        if params:
            url += "?" + urlencode(params, doseq=True)

        attempt = 0
        while attempt < self.MAX_RETRIES:
            try:
                response = self.session.get(url, timeout=10)
                response.raise_for_status()
                return response.json()
            except requests.RequestException as e:
                wait_time = 2 ** attempt
                logger.warning(f"Request failed on attempt {attempt + 1}: {e}. Retrying in {wait_time}s...")
                time.sleep(wait_time)
                attempt += 1

        logger.error(f"Max retries ({self.MAX_RETRIES}) exceeded. URL: {url}, Params: {params}")
        return None

    def get_player_info(self, player_ids: list[int]) -> list[dict]:
        if not player_ids:
            return []

        results = []
        for i in range(0, len(player_ids), self.MAX_PLAYERS_PER_REQUEST):
            batch_ids = player_ids[i:i + self.MAX_PLAYERS_PER_REQUEST]
            data = self.request("people", {"personIds": ','.join(map(str, batch_ids))})
            if data and "people" in data:
                results.extend(data["people"])
            else:
                logger.warning(f"No data returned for batch {batch_ids}")
            time.sleep(self.RETRY_WAIT_TIME)

        return results
    
    def get_schedule(self, start_date: str, end_date: str) -> dict:
        params = {
            "sportId": 1,
            "startDate": start_date,
            "endDate": end_date,
            "fields": "dates,games,gamePk,gameDate,teams,away,home,team,id,name"
        }
        return self.request("schedule", params)

    def get_box_score(self, game_id: int) -> dict:
        return self.request(f"game/{game_id}/boxscore")

    def get_line_score(self, game_id: int) -> dict:
        return self.request(f"game/{game_id}/linescore")

    def get_team_roster(self, team_id: int) -> dict:
        params = {
            "rosterType": "active"
        }
        return self.request(f"teams/{team_id}/roster", params)
