import time
from datetime import datetime, timedelta
from utils.logger import logger
from utils.constants import MAX_AGE_DAYS, MLB_TEAM_IDS_REVERSE_MAP
from models.game_logs.logs_inserter import LogsInserter
from models.game_logs.player_game_log import PlayerGameLog
from models.game_logs.team_game_log import TeamGameLog
from models.game_logs.game_pitcher import GamePitcher
from models.game_logs.batter_game_log import BatterGameLog
from models.game_logs.pitcher_game_log import PitcherGameLog

class LeagueGameLogs():
    def __init__(self, mlb_api, player_game_logs, team_game_logs, game_pitchers, league_statistics=None):
        self.mlb_api = mlb_api
        self.player_game_logs = player_game_logs
        self.team_game_logs = team_game_logs
        self.game_pitchers = game_pitchers
        self.league_statistics = league_statistics

    def purge_old_game_logs(self):
        self.player_game_logs.purge_old_game_logs()
        self.team_game_logs.purge_old_game_logs()
        self.game_pitchers.purge_old_game_logs()

    def get_latest_game_log_date(self):
        latest_player_date = self.player_game_logs.get_latest_game_log_date()
        latest_team_date = self.team_game_logs.get_latest_game_log_date()
        latest_game_pitcher_date = self.game_pitchers.get_latest_game_log_date()
        
        # If either date is None, return None to use fallback_date
        if latest_player_date is None or latest_team_date is None or latest_game_pitcher_date is None:
            return None
            
        return min(latest_player_date, latest_team_date, latest_game_pitcher_date)

    def upsert_game_logs(self, games):
        player_game_logs, team_game_logs, game_pitchers = self.process_game_logs(games)
        self.player_game_logs.upsert_game_logs(player_game_logs)
        self.team_game_logs.upsert_game_logs(team_game_logs)
        self.game_pitchers.upsert_game_pitchers(game_pitchers)
        self.team_game_logs.update_advanced_statistics()

    def compute_rolling_stats(self):
        self.player_game_logs.compute_rolling_stats()
        self.team_game_logs.compute_rolling_stats()
        self.league_statistics.compute_league_averages()

    def fetch_game_logs(self):
        start_date, end_date = self.get_window_dates()
        """Get game logs from MLB Stats API"""
        try:
            logger.info(f"Fetching MLB Stats API game logs from {start_date} to {end_date}")
            
            # Get games for the date range
            games_data = self.mlb_api.get_schedule(start_date, end_date)
            
            # Check if API call failed
            if games_data is None:
                logger.error("API call failed - exiting")
                return []
        
            
            games = []
            
            for date_data in games_data.get('dates', []):
                for game in date_data.get('games', []):
                    away_team_id = game['teams']['away']['team']['id']
                    home_team_id = game['teams']['home']['team']['id']
                    
                    games.append({
                        'game_pk': game['gamePk'],
                        'game_date': game['gameDate'],
                        'away_team': MLB_TEAM_IDS_REVERSE_MAP.get(away_team_id, 'UNK'),
                        'home_team': MLB_TEAM_IDS_REVERSE_MAP.get(home_team_id, 'UNK')
                    })
            
            logger.info(f"Found {len(games)} games")
            return games
        except Exception as e:
            logger.error(f"Error fetching game logs: {e}")
            return []

    def process_game_logs(self, games):
        all_player_game_logs = LogsInserter(PlayerGameLog.KEYS, PlayerGameLog.ID_KEYS)
        all_team_game_logs = LogsInserter(TeamGameLog.KEYS, TeamGameLog.ID_KEYS)
        all_game_pitchers = LogsInserter(GamePitcher.KEYS, GamePitcher.ID_KEYS)

        for i, game in enumerate(games):
            logger.info(f"Getting boxscore for game {game['game_pk']} ({i+1}/{len(games)})")

            try:
                box_score_data = self.mlb_api.get_box_score(game['game_pk'])
                
                # Try to get line score data, but don't fail if it's not available
                try:
                    line_score_data = self.mlb_api.get_line_score(game['game_pk'])
                except Exception as e:
                    logger.warning(f"Failed to get line score for game {game['game_pk']}: {e}")
                    line_score_data = None
                
                # Check if we have valid data
                if not box_score_data or not line_score_data:
                    logger.warning(f"Failed to get detailed score data for game {game['game_pk']}: Missing data")
                    continue
                
                # Process team game logs
                home_starting_pitcher_id = None
                away_starting_pitcher_id = None

                for team_type in ['away', 'home']:
                    all_team_game_logs.add_row(TeamGameLog(team_type, game, box_score_data, line_score_data))

                    team_data = box_score_data.get('teams', {}).get(team_type, {})
                    batters = team_data.get('batters', [])
                    pitchers = team_data.get('pitchers', [])

                    for batter_id in batters:
                        batter_game_log = BatterGameLog(batter_id, team_type, game, box_score_data)
                        all_player_game_logs.add_row(batter_game_log)

                    for pitcher_id in pitchers:
                        pitcher_game_log = PitcherGameLog(pitcher_id, team_type, game, box_score_data, line_score_data)
                        all_player_game_logs.add_row(pitcher_game_log)

                        if pitcher_game_log.is_starting_pitcher():
                            if team_type == 'home':
                                home_starting_pitcher_id = pitcher_game_log.get_player_id()
                            else:
                                away_starting_pitcher_id = pitcher_game_log.get_player_id()


                all_game_pitchers.add_row(GamePitcher(game, home_starting_pitcher_id, away_starting_pitcher_id))

            except Exception as e:
                logger.warning(f"Failed to get boxscore for game {game['game_pk']}: {e}")
                continue

            # Add a small delay between requests to be respectful to the API
            if i < len(games) - 1:  # Don't delay after the last request
                time.sleep(0.1)  # 100ms delay

        return all_player_game_logs, all_team_game_logs, all_game_pitchers



    def get_window_dates(self):
        today = datetime.today().date()
        try:
            latest_log_date = self.get_latest_game_log_date()
        except ValueError:
            # If both tables are empty, latest_log_date will be None
            latest_log_date = None
        fallback_date = today - timedelta(days=MAX_AGE_DAYS)

        # If latest_log_date is None, use fallback_date as start_date
        if latest_log_date is None:
            start_date = fallback_date
        else:
            start_date = max(latest_log_date, fallback_date)
        
        # Ensure start_date is not after today
        start_date = min(start_date, today)
        end_date = today
        
        # Format dates as YYYY-MM-DD strings
        start_date_str = start_date.strftime('%Y-%m-%d')
        end_date_str = end_date.strftime('%Y-%m-%d')

        return start_date_str, end_date_str

