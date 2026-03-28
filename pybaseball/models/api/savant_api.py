from __future__ import annotations

from datetime import datetime
from urllib.parse import urlencode
from io import StringIO
import pandas as pd
import requests
from pandas.errors import ParserError, EmptyDataError
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
            # Omit brotli: without optional brotli/brotlicffi, urllib3 leaves Content-Encoding: br
            # bodies undecoded and response.text becomes garbage, breaking pd.read_csv.
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
        
        try:
            response = self.session.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            csv_text = self._extract_csv_text(response.text)
            if csv_text is None:
                return None
            df = self._read_savant_csv(csv_text)
            if "player_id" not in df.columns:
                logger.error(
                    "Savant CSV missing player_id column; response may be undecoded or malformed. Columns: %s",
                    list(df.columns)[:10],
                )
                return None
            return df
        except requests.RequestException as e:
            logger.error(f"Error fetching Baseball Savant data: {e}")
            return None
        except (ParserError, EmptyDataError) as e:
            logger.error(f"Error parsing Baseball Savant CSV: {e}")
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

    def _extract_csv_text(self, body: str) -> str | None:
        """
        Savant sometimes returns HTML (bot block, error page) with HTTP 200, or a preamble
        before the CSV. Find the header row and strip anything before it.
        """
        text = body.lstrip("\ufeff\u200b").strip()
        if not text:
            return None

        first_nonempty = next((ln.strip() for ln in text.splitlines() if ln.strip()), "")
        if first_nonempty.startswith("<"):
            logger.error(
                "Baseball Savant returned HTML instead of CSV (blocked, error page, or unexpected response). "
                "First line: %s",
                first_nonempty[:120],
            )
            return None

        lines = text.splitlines()
        for i, line in enumerate(lines):
            if "player_id" in line and "," in line:
                return "\n".join(lines[i:])
        return text


    def _read_savant_csv(self, csv_text: str) -> pd.DataFrame:
        try:
            return pd.read_csv(StringIO(csv_text))
        except (ParserError, EmptyDataError) as e:
            logger.warning("Savant CSV parse failed with default engine, retrying: %s", e)
            return pd.read_csv(StringIO(csv_text), engine="python", on_bad_lines="skip")
