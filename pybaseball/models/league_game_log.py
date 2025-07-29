import time
from datetime import datetime, timedelta
import pandas as pd
from models.logger import logger
from utils.constants import MAX_AGE_DAYS, MLB_TEAM_IDS

class LeagueGameLog():
    def __init__(self, mlb_api, player_game_log, team_game_log):
        self.mlb_api = mlb_api
        self.player_game_log = player_game_log
        self.team_game_log = team_game_log

    def purge_old_game_logs(self):
        self.player_game_log.purge_old_game_logs()
        self.team_game_log.purge_old_game_logs()

    def get_latest_game_log_date(self):
        latest_player_date = self.player_game_log.get_latest_game_log_date()
        latest_team_date = self.team_game_log.get_latest_game_log_date()
        
        # If either date is None, return None to use fallback_date
        if latest_player_date is None or latest_team_date is None:
            return None
            
        return min(latest_player_date, latest_team_date)

    def upsert_game_logs(self, games):
        player_game_logs, team_game_logs, all_player_ids = self.process_game_logs(games)
        self.player_game_log.upsert_game_logs(player_game_logs, all_player_ids)
        self.team_game_log.upsert_game_logs(team_game_logs)

    def compute_rolling_stats(self):
        self.player_game_log.compute_rolling_stats()
        self.team_game_log.compute_rolling_stats()

    def fetch_game_logs(self):
        start_date, end_date = self.get_window_dates()
        """Get game logs from MLB Stats API"""
        try:
            logger.info(f"Fetching MLB Stats API game logs from {start_date} to {end_date}")
            
            # Get games for the date range
            games_data = self.mlb_api.get_schedule(start_date, end_date)
            
            # Create reverse mapping from team ID to abbreviation
            team_id_to_abbr = {v: k for k, v in MLB_TEAM_IDS.items()}
            
            games = []
            
            for date_data in games_data.get('dates', []):
                for game in date_data.get('games', []):
                    away_team_id = game['teams']['away']['team']['id']
                    home_team_id = game['teams']['home']['team']['id']
                    
                    games.append({
                        'game_pk': game['gamePk'],
                        'game_date': game['gameDate'],
                        'away_team': team_id_to_abbr.get(away_team_id, 'UNK'),
                        'home_team': team_id_to_abbr.get(home_team_id, 'UNK')
                    })
            
            logger.info(f"Found {len(games)} games")
            return games
        except Exception as e:
            logger.error(f"Error fetching game logs: {e}")
            return []

    def get_window_dates(self):
        try:
            latest_log_date = self.get_latest_game_log_date()
        except ValueError:
            # If both tables are empty, latest_log_date will be None
            latest_log_date = None
        fallback_date = datetime.today().date() - timedelta(days=MAX_AGE_DAYS)

        # If latest_log_date is None, use fallback_date as start_date
        if latest_log_date is None:
            start_date = fallback_date
        else:
            start_date = max(latest_log_date, fallback_date)
        end_date = datetime.today().date()
        
        # Format dates as YYYY-MM-DD strings
        start_date_str = start_date.strftime('%Y-%m-%d')
        end_date_str = end_date.strftime('%Y-%m-%d')

        return start_date_str, end_date_str


    def process_game_logs(self, games):
        # Get boxscores for each game
        all_player_game_logs = []
        all_player_ids = []
        all_team_game_logs = []
        
        for i, game in enumerate(games):  # Process all games instead of limiting to 10
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
                    logger.warning(f"Failed to get boxscore for game {game['game_pk']}: Missing data")
                    continue
                
                for team_type in ['away', 'home']:
                    team_data = box_score_data.get('teams', {}).get(team_type, {})
                    opponent_team_type = 'home' if team_type == 'away' else 'away'
                    batters = team_data.get('batters', [])

                    # Process team stats
                    team_name = team_data.get('team', {}).get('abbreviation', None)
                    opponent_abbreviation = game.get(f'{opponent_team_type}_team', None)
                    stats = team_data.get("teamStats", {}).get("batting", {})
                    pitching = team_data.get("teamStats", {}).get("pitching", {})
                    
                    # Safely get runs from line score
                    try:
                        if line_score_data and "teams" in line_score_data:
                            runs_scored = line_score_data["teams"][team_type]["runs"]
                            opponent_runs = line_score_data["teams"][opponent_team_type]["runs"]
                            is_win = runs_scored > opponent_runs
                        else:
                            logger.warning(f"No line score data available for game {game['game_pk']}")
                            runs_scored = 0
                            opponent_runs = 0
                            is_win = False
                    except (KeyError, TypeError) as e:
                        logger.warning(f"Failed to get runs for game {game['game_pk']}: {e}")
                        runs_scored = 0
                        opponent_runs = 0
                        is_win = False

                    all_team_game_logs.append((
                        team_name,
                        game['game_date'][:10],
                        opponent_abbreviation,
                        team_type == "home",
                        is_win,                        
                        runs_scored,
                        opponent_runs,
                        None, # TODO: Add pitcher hand later
                        float(stats.get("avg", 0.0)),
                        float(stats.get("obp", 0.0)),
                        float(stats.get("slg", 0.0)),
                        float(stats.get("ops", 0.0)),
                        pitching.get("earnedRuns", 0),
                        float(pitching.get("whip", 0.0)),
                        pitching.get("strikeOuts", 0),
                        pitching.get("baseOnBalls", 0),
                        float(pitching.get("inningsPitched", "0").replace("0.1", "0.333").replace("0.2", "0.667")),
                        pitching.get("hits", 0),
                        game['game_pk'],
                    ))
                    
                    # Process batting stats
                    for batter_id in batters:
                        batter_stats = team_data.get('players', {}).get(f'ID{batter_id}', {})
                        stats = batter_stats.get('stats', {}).get('batting', {})
                        
                        if stats:
                            all_player_game_logs.append({
                                'game_id': game['game_pk'],
                                'player_id': batter_id,
                                'game_date': game['game_date'][:10],
                                'team': None,  # Will be set from lookup table
                                'opponent': opponent_abbreviation,
                                'is_home': team_type == 'home',
                                'position': 'B',
                                'ab': stats.get('atBats', 0),
                                'h': stats.get('hits', 0),
                                'r': stats.get('runs', 0),
                                'rbi': stats.get('rbi', 0),
                                'hr': stats.get('homeRuns', 0),
                                'sb': stats.get('stolenBases', 0),
                                'bb': stats.get('baseOnBalls', 0),
                                'k': stats.get('strikeOuts', 0),
                                'ip': 0,
                                'er': 0,
                                'hits_allowed': 0,
                                'walks_allowed': 0,
                                'strikeouts': 0,
                                'qs': 0
                            })
                            all_player_ids.append(batter_id)
                
                    # Process pitching stats
                    pitchers = team_data.get('pitchers', [])
                    for pitcher_id in pitchers:
                        pitcher_stats = team_data.get('players', {}).get(f'ID{pitcher_id}', {})
                        stats = pitcher_stats.get('stats', {}).get('pitching', {})
                        
                        if stats:
                            ip_str = stats.get('inningsPitched', '0')
                            ip_decimal = float(ip_str) if ip_str else 0
                            
                            qs = 1 if ip_decimal >= 6 and stats.get('earnedRuns', 0) <= 3 else 0
                            
                            all_player_game_logs.append({
                                'game_id': game['game_pk'],
                                'player_id': pitcher_id,
                                'game_date': game['game_date'][:10],
                                'team': None,  # Will be set from lookup table
                                'opponent': opponent_abbreviation,
                                'is_home': team_type == 'home',
                                'position': 'P',
                                'ab': 0,
                                'h': 0,
                                'r': 0,
                                'rbi': 0,
                                'hr': 0,
                                'sb': 0,
                                'bb': 0,
                                'k': 0,
                                'ip': ip_decimal,
                                'er': stats.get('earnedRuns', 0),
                                'hits_allowed': stats.get('hits', 0),
                                'walks_allowed': stats.get('baseOnBalls', 0),
                                'strikeouts': stats.get('strikeOuts', 0),
                                'qs': qs
                            })
                            all_player_ids.append(pitcher_id)
            except Exception as e:
                logger.warning(f"Failed to get boxscore for game {game['game_pk']}: {e}")
            
            # Add a small delay between requests to be respectful to the API
            if i < len(games) - 1:  # Don't delay after the last request
                time.sleep(0.1)  # 100ms delay

        return pd.DataFrame(all_player_game_logs), pd.DataFrame(all_team_game_logs), all_player_ids
