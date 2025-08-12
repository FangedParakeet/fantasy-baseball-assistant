import requests
from urllib.parse import urlencode

class EspnApi:
    BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard"

    def __init__(self):
        self.session = requests.Session()

    def request(self, params: dict) -> list[dict]:
        url = f"{self.BASE_URL}"
        headers = {
            "User-Agent": "Mozilla/5.0"
        }

        if params:
            url += "?" + urlencode(params, doseq=True)

        response = self.session.get(url, headers=headers)
        return response.json()
    
    def get_probable_pitchers(self, start_date: str, end_date: str) -> list[dict]:
        params = {
            "dates": f"{start_date.strftime('%Y%m%d')}-{end_date.strftime('%Y%m%d')}"
        }
        return self.request(params)        