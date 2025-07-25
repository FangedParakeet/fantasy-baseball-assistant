from models.db_recorder import DB_Recorder
from utils.functions import normalise_name
from datetime import datetime, timedelta
from utils.constants import MAX_AGE_DAYS
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
        return min(filter(None, [latest_probable_pitcher_date, latest_game_pitcher_date]))

    def purge_old_pitcher_games(self):
        self.purge_old_records(self.probable_pitchers_table)
        self.purge_old_records(self.game_pitchers_table)

    def upsert_probable_pitchers(self, games):
        probable_pitcher_rows, game_pitcher_rows = self.process_games(games)
        self.upsert_probable_pitchers(probable_pitcher_rows)
        self.upsert_game_pitchers(game_pitcher_rows)

    def fetch_probable_pitchers(self):
        start_date, end_date = self.get_window_dates()
        try:
            logger.info(f"Fetching probable pitchers from {start_date} to {end_date}")
            games = self.mlb_api.get_probable_pitchers(start_date, end_date)
            return games
        except Exception as e:    
            logger.error(f"Error fetching probable pitchers: {e}")
            return []

    def get_window_dates(self):
        today = datetime.today().date()
        monday = today - timedelta(days=today.weekday())
        latest_log_date = self.get_latest_pitcher_game_date()
        fallback_date = datetime.today().date() - timedelta(days=MAX_AGE_DAYS)

        start_date = max(fallback_date, latest_log_date)
        end_date = (monday + timedelta(days=13)).strftime("%Y-%m-%d")
        return start_date, end_date

    def process_games(self, games):
        probable_pitcher_rows = []
        game_pitcher_rows = []
        for date_info in games.get("dates", []):
            game_date = date_info["date"]
            for game in date_info.get("games", []):
                game_id = game["gamePk"]
                teams = game.get("teams", {})

                # Process game pitchers
                home_team = teams.get("home", {})
                away_team = teams.get("away", {})
                home_pitcher = home_team.get("probablePitcher", {})
                away_pitcher = away_team.get("probablePitcher", {})

                game_pitcher_rows.append((
                    str(game_id),
                    home_team.get("team", {}).get("abbreviation"),
                    away_team.get("team", {}).get("abbreviation"),
                    home_pitcher.get("id"),
                    home_pitcher.get("pitchHand", {}).get("code"),
                    away_pitcher.get("id"),
                    away_pitcher.get("pitchHand", {}).get("code"),
                    game_date
                ))

                # Process probable pitchers
                for side in ["home", "away"]:
                    info = teams.get(side, {})
                    team = info.get("team", {}).get("abbreviation")
                    opponent = teams.get("away" if side == "home" else "home", {}).get("team", {}).get("abbreviation")
                    pitcher = info.get("probablePitcher", {})
                    pitcher_id = pitcher.get("id")
                    pitcher_name = pitcher.get("fullName")
                    throws = pitcher.get("pitchHand", {}).get("code")
                    normalised_name = normalise_name(pitcher_name) if pitcher_name else None
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
        logger.info(f"Upserting {len(rows)} probable pitchers")
        insert_query = """
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
        logger.info(f"Upserting {len(rows)} game pitchers")
        insert_query = """
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
