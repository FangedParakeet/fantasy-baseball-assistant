import os
import base64
import requests
from urllib.parse import quote
import time
from lxml import etree
from datetime import datetime
from models.yahoo_token import YahooToken
from utils.logger import logger
from utils.functions import normalise_name

class YahooApi:
    BASE_AUTH_URL = 'https://api.login.yahoo.com/oauth2/get_token'
    BASE_API_URL = 'https://fantasysports.yahooapis.com/fantasy/v2'
    NAMESPACE = {'yahoo': 'http://fantasysports.yahooapis.com/fantasy/v2/base.rng'}
    MAX_RETRIES = 3
    RETRY_WAIT_TIME = 0.4
    MAX_TIMEOUT = 20
    MAX_PAGE_SIZE = 25

    def __init__(self, yahoo_token: YahooToken):
        self.session = requests.Session()
        self.yahoo_token = yahoo_token
        self.client_id = os.getenv('YAHOO_CLIENT_ID')
        self.client_secret = os.getenv('YAHOO_CLIENT_SECRET')

    def token_request(self, params: dict) -> dict:
        url = f"{self.BASE_AUTH_URL}"
        auth_string = f"{self.client_id}:{self.client_secret}"
        auth = base64.b64encode(auth_string.encode()).decode()
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': f"Basic {auth}"
        }

        response = self.session.post(url, headers=headers, data=params)
        return response.json()
        
    def api_request(self, endpoint: str, params: dict) -> dict:
        if self.yahoo_token.should_refresh_token():
            self.refresh_token()
        token = self.yahoo_token.get_token()
        url = f"{self.BASE_API_URL}/{endpoint}"
        headers = {
            'Authorization': f"Bearer {token.get('yahoo_access_token', None)}",
            'Accept': 'application/xml',
            'User-Agent': 'Mozilla/5.0'
        }

        if params:
            filter_string = ';'.join(f"{k}={quote(str(v), safe='')}" for k, v in params.items())
            url = f"{url};{filter_string}"

        attempt = 0
        did_refresh = False
        while attempt < self.MAX_RETRIES:
            try:
                response = self.session.get(url, headers=headers, timeout=self.MAX_TIMEOUT)
                # Handle auth expiry once
                if response.status_code == 401 and not did_refresh:
                    self.refresh_token()
                    headers['Authorization'] = f"Bearer {self.yahoo_token.get_token().get('yahoo_access_token')}"
                    did_refresh = True
                    attempt += 1
                    time.sleep(self.RETRY_WAIT_TIME)
                    continue

                # Retry on transient status codes
                if response.status_code in (429, 500, 502, 503, 504):
                    attempt += 1
                    wait = min(5.0, self.RETRY_WAIT_TIME * (2 ** (attempt - 1)))
                    logger.warning(f"Yahoo {response.status_code}; retrying in {wait:.1f}s… [{attempt}/{self.MAX_RETRIES}]")
                    time.sleep(wait)
                    continue

                response.raise_for_status()
                return etree.fromstring(response.content)
            except requests.RequestException as e:
                logger.error(f"Error fetching Yahoo data: {e}. Retrying in {self.RETRY_WAIT_TIME}s...")
                attempt += 1
                time.sleep(self.RETRY_WAIT_TIME)

        logger.error(f"Max retries ({self.MAX_RETRIES}) exceeded. URL: {url}")
        return None

    def refresh_token(self):
        refresh_token = self.yahoo_token.get_token().get('yahoo_refresh_token', None)
        if not refresh_token:
            raise Exception('No refresh token found')

        params = {
            'grant_type': 'refresh_token',
            'refresh_token': refresh_token
        }
        token_response = self.token_request(params)
        if token_response.get('error', None):
            raise Exception(f'Error refreshing token: {token_response.get("error")}')

        access_token = token_response.get('access_token', None)
        refresh_token = token_response.get('refresh_token', None)
        expires_in = token_response.get('expires_in', None)
        if not access_token or not refresh_token or not expires_in:
            raise Exception('No access token or refresh token found')

        # Convert Unix timestamp to MySQL datetime string
        expiry_timestamp = time.time() + expires_in
        expiry_datetime = datetime.fromtimestamp(expiry_timestamp).strftime('%Y-%m-%d %H:%M:%S')

        new_token = {
            'yahoo_access_token': access_token,
            'yahoo_refresh_token': refresh_token,
            'yahoo_token_expires_at': expiry_datetime
        }
        self.yahoo_token.set_token(new_token)
        return new_token

    def get_all_league_players(self) -> dict:
        league_key = self.get_user_league_key()
        if not league_key:
            raise Exception('No league key found')

        all_players = []
        index_offset = 0
        while True:
            batch = self.get_league_players_batch(league_key, index_offset, self.MAX_PAGE_SIZE)
            if not batch:
                break
            all_players.extend(batch)
            logger.info("Fetched %d players (total=%d)", len(batch), len(all_players))
            if len(batch) < self.MAX_PAGE_SIZE:
                break
            index_offset += self.MAX_PAGE_SIZE
            time.sleep(self.RETRY_WAIT_TIME)
        return all_players

    def get_league_players_by_keys(self, keys: list[str]) -> list[dict]:
        league_key = self.get_user_league_key()
        if not league_key:
            raise Exception('No league key found')

        results = []
        for i in range(0, len(keys), self.MAX_PAGE_SIZE):
            chunk = ",".join(keys[i:i+self.MAX_PAGE_SIZE])
            response = self.api_request(f"league/{league_key}/players", {'player_keys': chunk})
            results.extend(self.get_player_data_from_response(response))
            time.sleep(self.RETRY_WAIT_TIME)
        return results

    def get_user_league_key(self) -> str:
        leagues_root = self.get_user_leagues()

        # Find active (not over) MLB game and return its first league_key
        keys = leagues_root.xpath(
            "//yahoo:users/yahoo:user/yahoo:games/yahoo:game[yahoo:is_game_over='0']/yahoo:leagues/yahoo:league/yahoo:league_key/text()", 
            namespaces=self.NAMESPACE
        )
        
        if not keys:
            raise Exception('No active games/leagues found')
        return keys[0]

    def get_user_leagues(self) -> dict:
        return self.api_request('users;use_login=1/games;game_codes=mlb/leagues', {})

    def get_league_players_batch(self, league_key: str, start: int, count: int) -> dict:
        response = self.api_request(f'league/{league_key}/players', {'start': start, 'count': count})
        return self.get_player_data_from_response(response)

    def get_player_data_from_response(self, root) -> dict:
        if root is None:
            return []
        
        # Find players using namespace
        players = root.xpath('//yahoo:league/yahoo:players/yahoo:player', namespaces=self.NAMESPACE)
        
        all_player_data = []
        for p in players:
            try:
                player_data = self.flatten_yahoo_player(p)
                all_player_data.append(player_data)
            except Exception as e:
                logger.warning(f"Error flattening player: {e}")
        
        return all_player_data

    def flatten_yahoo_player(self, player_node) -> dict:
        # positions
        pos_nodes = player_node.xpath(self.prefix_subpaths("eligible_positions/position"), namespaces=self.NAMESPACE)
        positions = [n.text for n in pos_nodes if (n.text or "").strip()]

        return {
            "yahoo_player_id": self.parse_xml_path(player_node, "player_key"),
            "name": self.parse_xml_path(player_node, "name/full"),
            "mlb_team": self.parse_xml_path(player_node, "editorial_team_abbr"),
            "eligible_positions": sorted(set(positions)),
            "headshot_url": self.parse_xml_path(player_node, "headshot/url"),
        }

    def prefix_subpaths(self, rel_path: str) -> str:
        # convert "name/full" -> "f:name/f:full"
        return "/".join(f"yahoo:{seg}" for seg in rel_path.split("/"))

    def parse_xml_path(self, node, rel_path: str):
        return node.xpath(f"string({self.prefix_subpaths(rel_path)})", namespaces=self.NAMESPACE) or None


        
