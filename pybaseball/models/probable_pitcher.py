from models.db_recorder import DB_Recorder
from utils.functions import normalise_name
from datetime import datetime, timedelta
from utils.constants import MAX_AGE_DAYS, MLB_TEAM_IDS_REVERSE_MAP
from models.logger import logger

class ProbablePitcher(DB_Recorder):
    def __init__(self, conn, mlb_api):
        self.probable_pitchers_table = "probable_pitchers"
        self.game_pitchers_table = "game_pitchers"
        self.conn = conn
        self.mlb_api = mlb_api
        super().__init__(conn)

    def get_latest_pitcher_game_date(self):
        latest_probable_pitcher_date = self.get_latest_record_date(self.probable_pitchers_table)
        latest_game_pitcher_date = self.get_latest_record_date(self.game_pitchers_table)

        # If either date is None, return None to use fallback_date
        if latest_probable_pitcher_date is None or latest_game_pitcher_date is None:
            return None

        # Both dates exist, return the earliest
        return min(latest_probable_pitcher_date, latest_game_pitcher_date)

    def purge_old_pitcher_games(self):
        self.purge_old_records(self.probable_pitchers_table)
        self.purge_old_records(self.game_pitchers_table)

    def upsert_all_pitchers(self, games):
        probable_pitcher_rows, game_pitcher_rows = self.process_games(games)
        self.upsert_probable_pitchers(probable_pitcher_rows)
        self.upsert_game_pitchers(game_pitcher_rows)

    def fetch_probable_pitchers(self):
        start_date, end_date = self.get_window_dates()
        try:
            logger.info(f"Fetching probable pitchers from {start_date} to {end_date}")
            
            # First get the schedule to get game IDs
            schedule = self.mlb_api.get_schedule(start_date, end_date)
            if not schedule or 'dates' not in schedule:
                logger.error("No schedule data returned")
                return []
            
            return schedule
        except Exception as e:    
            logger.error(f"Error fetching probable pitchers: {e}")
            return []

    def get_window_dates(self):
        today = datetime.today().date()
        monday = today - timedelta(days=today.weekday())
        try:
            latest_log_date = self.get_latest_pitcher_game_date()
        except ValueError:
            # If both tables are empty, latest_log_date will be None
            latest_log_date = None
        fallback_date = datetime.today().date() - timedelta(days=MAX_AGE_DAYS)

        # If latest_log_date is None, use fallback_date as start_date
        if latest_log_date is None:
            start_date = fallback_date
        else:
            start_date = max(fallback_date, latest_log_date)
        end_date = (monday + timedelta(days=13)).strftime("%Y-%m-%d")
        return start_date, end_date

    def parse_game_date(self, game_date_str):
        """Convert ISO datetime string to date string for database"""
        try:
            # Parse the ISO datetime string and extract just the date part
            dt = datetime.fromisoformat(game_date_str.replace('Z', '+00:00'))
            return dt.strftime('%Y-%m-%d')
        except (ValueError, AttributeError) as e:
            logger.warning(f"Failed to parse game date '{game_date_str}': {e}")
            return None

    def process_games(self, games):
        probable_pitcher_rows = []
        game_pitcher_rows = []
        
        for date_info in games.get("dates", []):
            for game in date_info.get("games", []):
                game_id = game["gamePk"]
                game_date_str = game.get("gameDate")
                
                # Skip games without a date
                if not game_date_str:
                    logger.warning(f"No gameDate found for game {game_id}")
                    continue
                
                # Parse the game date
                game_date = self.parse_game_date(game_date_str)
                if not game_date:
                    logger.warning(f"Failed to parse game date for game {game_id}: {game_date_str}")
                    continue
                
                teams = game.get("teams", {})

                # Process game pitchers
                home_team = teams.get("home", {})
                away_team = teams.get("away", {})
                home_pitcher = home_team.get("probablePitcher", {})
                away_pitcher = away_team.get("probablePitcher", {})

                # Validate that we have team information
                home_team_id = home_team.get("team", {}).get("id")
                away_team_id = away_team.get("team", {}).get("id")
                
                # Check if team IDs are in our mapping
                if home_team_id not in MLB_TEAM_IDS_REVERSE_MAP:
                    home_team_name = home_team.get("team", {}).get("name", "Unknown")
                    logger.warning(f"Unknown home team ID: {home_team_id} ({home_team_name}) for game {game_id}")
                    continue
                if away_team_id not in MLB_TEAM_IDS_REVERSE_MAP:
                    away_team_name = away_team.get("team", {}).get("name", "Unknown")
                    logger.warning(f"Unknown away team ID: {away_team_id} ({away_team_name}) for game {game_id}")
                    continue
                
                home_team_abbr = MLB_TEAM_IDS_REVERSE_MAP[home_team_id]
                away_team_abbr = MLB_TEAM_IDS_REVERSE_MAP[away_team_id]
                
                if not home_team_abbr or not away_team_abbr:
                    logger.warning(f"Missing team information for game {game_id}: home={home_team_abbr}, away={away_team_abbr}")
                    continue

                # Skip if we don't have any pitcher information
                home_pitcher_id = home_pitcher.get("id")
                away_pitcher_id = away_pitcher.get("id")
                if not home_pitcher_id and not away_pitcher_id:
                    logger.info(f"Game {game_id} skipping - no pitcher data for either team")
                    continue

                game_pitcher_rows.append((
                    str(game_id),
                    home_team_abbr,
                    away_team_abbr,
                    home_pitcher.get("id"),
                    home_pitcher.get("pitchHand", {}).get("code"),
                    away_pitcher.get("id"),
                    away_pitcher.get("pitchHand", {}).get("code"),
                    game_date
                ))

                # Process probable pitchers
                for side in ["home", "away"]:
                    info = teams.get(side, {})
                    team_id = info.get("team", {}).get("id")
                    opponent_id = teams.get("away" if side == "home" else "home", {}).get("team", {}).get("id")
                    
                    # Check if team IDs are in our mapping
                    if team_id not in MLB_TEAM_IDS_REVERSE_MAP:
                        team_name = info.get("team", {}).get("name", "Unknown")
                        logger.warning(f"Unknown {side} team ID: {team_id} ({team_name}) for game {game_id}")
                        continue
                    if opponent_id not in MLB_TEAM_IDS_REVERSE_MAP:
                        opponent_name = teams.get("away" if side == "home" else "home", {}).get("team", {}).get("name", "Unknown")
                        logger.warning(f"Unknown opponent team ID: {opponent_id} ({opponent_name}) for game {game_id}")
                        continue
                    
                    team = MLB_TEAM_IDS_REVERSE_MAP[team_id]
                    opponent = MLB_TEAM_IDS_REVERSE_MAP[opponent_id]
                    
                    # Skip if we don't have valid team information
                    if not team or not opponent:
                        continue
                        
                    pitcher = info.get("probablePitcher", {})
                    
                    pitcher_id = pitcher.get("id")
                    pitcher_name = pitcher.get("fullName")
                    throws = pitcher.get("pitchHand", {}).get("code")
                    normalised_name = normalise_name(pitcher_name) if pitcher_name else None
                    
                    # Skip if we don't have pitcher information
                    if not pitcher_id or not pitcher_name:
                        logger.info(f"Game {game_id} {side} skipping - no pitcher data")
                        continue
                    
                    probable_pitcher_rows.append((
                        str(game_id),
                        game_date,
                        team,
                        opponent,
                        pitcher_id,
                        pitcher_name,
                        throws,
                        side == "home",
                        normalised_name
                    ))

        return probable_pitcher_rows, game_pitcher_rows

    def upsert_probable_pitchers(self, rows):
        if len(rows) == 0:
            logger.info("No probable pitchers to insert")
            return
        
        logger.info(f"Upserting {len(rows)} probable pitchers")
        insert_query = f"""
            INSERT INTO {self.probable_pitchers_table} (game_id, game_date, team, opponent, pitcher_id, pitcher_name, throws, home, normalised_name)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
            pitcher_id = VALUES(pitcher_id),
            pitcher_name = VALUES(pitcher_name),
            throws = VALUES(throws),
            opponent = VALUES(opponent),
            home = VALUES(home),
            normalised_name = VALUES(normalised_name)
        """
        self.batch_upsert(insert_query, rows)

    def upsert_game_pitchers(self, rows):
        if len(rows) == 0:
            logger.info("No game pitchers to insert")
            return
        
        logger.info(f"Upserting {len(rows)} game pitchers")
        insert_query = f"""
            INSERT INTO {self.game_pitchers_table} (
                game_id, home_team, away_team,
                home_pitcher_id, home_pitcher_throws,
                away_pitcher_id, away_pitcher_throws,
                game_date
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
            home_pitcher_id = VALUES(home_pitcher_id),
            home_pitcher_throws = VALUES(home_pitcher_throws),
            away_pitcher_id = VALUES(away_pitcher_id),
            away_pitcher_throws = VALUES(away_pitcher_throws)
        """
        self.batch_upsert(insert_query, rows)
