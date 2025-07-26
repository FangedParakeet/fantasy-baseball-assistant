import requests
import time
import logging

class MlbApi:
    URL_BASE = "https://statsapi.mlb.com/api/v1/"
    MAX_RETRIES = 3

    def request(self, endpoint: str, params: dict = None) -> dict:
        url = f"{self.URL_BASE}{endpoint}"
        
        for attempt in range(self.MAX_RETRIES + 1):
            try:
                response = requests.get(url, params=params)
                
                # If successful, return the data
                if response.status_code == 200:
                    return response.json()
                
                # Handle rate limiting (429) or server errors (5xx)
                if response.status_code == 429 or response.status_code >= 500:
                    if attempt < self.MAX_RETRIES:
                        # Exponential backoff: 1s, 2s, 4s
                        wait_time = 2 ** attempt
                        logging.warning(f"Rate limit/server error (HTTP {response.status_code}) on attempt {attempt + 1}. Retrying in {wait_time}s...")
                        time.sleep(wait_time)
                        continue
                    else:
                        logging.error(f"Max retries ({self.MAX_RETRIES}) exceeded. Final status code: {response.status_code}")
                        response.raise_for_status()
                
                # For other HTTP errors, raise immediately
                response.raise_for_status()
                
            except requests.exceptions.RequestException as e:
                if attempt < self.MAX_RETRIES:
                    wait_time = 2 ** attempt
                    logging.warning(f"Request failed on attempt {attempt + 1}: {e}. Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                    continue
                else:
                    logging.error(f"Max retries ({self.MAX_RETRIES}) exceeded. Final error: {e}")
                    raise
    
    def get_probable_pitchers(self, start_date: str, end_date: str) -> dict:
        params = {  
            "sportId": 1,
            "startDate": start_date,
            "endDate": end_date,
            "fields": "dates,games,gamePk,gameDate,teams,away,home,team,id,name,probablePitcher,fullName,pitchHand,code"
        }
        return self.request("schedule", params)

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
        return self.request(f"teams/{team_id}/roster")
