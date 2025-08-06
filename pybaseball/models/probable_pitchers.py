from datetime import datetime, timedelta
from collections import defaultdict
from utils.logger import logger
from utils.constants import MLB_TEAM_IDS_REVERSE_MAP
from models.db_recorder import DB_Recorder
from models.api.mlb_api import MlbApi
from models.api.espn_api import EspnApi
from models.game_logs.logs_inserter import LogsInserter
from models.game_logs.probable_pitcher import ProbablePitcher
from models.game_logs.projected_pitcher import ProjectedPitcher
from models.team_pitching_rotations import TeamPitchingRotations

class ProbablePitchers(DB_Recorder):
    MAX_DAYS_AHEAD = 10
    MAX_PROJECTED_DAYS_AHEAD = 14
    MAX_ROTATION_DAYS_BEHIND = 14
    MAX_ROTATION_GAMES_BEHIND = 10
    PROBABLE_PITCHERS_TABLE = "probable_pitchers"
    
    def __init__(self, conn, espn_api: EspnApi, mlb_api: MlbApi, team_pitching_rotations: TeamPitchingRotations):
        self.probable_pitchers_table = self.PROBABLE_PITCHERS_TABLE
        self.espn_api = espn_api
        self.mlb_api = mlb_api
        self.team_pitching_rotations = team_pitching_rotations
        super().__init__(conn)

    def purge_old_probable_pitchers(self):
        self.purge_old_records(self.probable_pitchers_table)

    def purge_all_projected_pitchers(self):
        self.purge_records_with_conditions(self.probable_pitchers_table, ["accuracy = 'projected'"])

    def get_latest_probable_pitcher_date(self):
        return self.get_latest_record_date(self.probable_pitchers_table, ["accuracy = 'confirmed'", "espn_pitcher_id IS NOT NULL"])

    def upsert_all_probable_pitchers(self):
        events = self.fetch_probable_pitchers()
        all_probable_pitchers = self.process_events(events)
        self.upsert_probable_pitchers(all_probable_pitchers)

    def fetch_probable_pitchers(self):
        start_date, end_date = self.get_window_dates()
        try:
            logger.info(f"Fetching probable pitchers from {start_date} to {end_date}")
            
            # Get the API response
            response = self.espn_api.get_probable_pitchers(start_date, end_date)
            
            # Extract events from the response
            if isinstance(response, dict) and 'events' in response:
                events = response['events']
                logger.info(f"Extracted {len(events)} events from API response")
                return events
            else:
                logger.error(f"Unexpected API response format: {type(response)}")
                return []
        except Exception as e:    
            logger.error(f"Error fetching probable pitchers: {e}")
            return []

    def process_events(self, events):
        if not events:
            logger.error("No events data returned")
            return
        
        logger.info(f"Processing {len(events)} events")
        all_probable_pitchers = LogsInserter(ProbablePitcher.KEYS, ProbablePitcher.ID_KEYS)
        
        for event in events:
            if not event:
                logger.error("No event data")
                continue
                                
            if 'competitions' not in event:
                logger.info(f"No competitions data in event {event.get('id', 'unknown')}")
                continue
            
            competitions = event.get('competitions', [])
            if not competitions:
                logger.info(f"No competitions found in event {event.get('id', 'unknown')}")
                continue
            
            logger.info(f"Processing {len(competitions)} competitions for event {event.get('id', 'unknown')}")
            
            for competition in competitions:
                competitors = competition.get('competitors', [])
                if len(competitors) < 2:
                    logger.info(f"Not enough competitors ({len(competitors)}) to process competition {competition.get('id', 'unknown')}")
                    continue
                
                for team in competitors:
                    team_abbr = team.get('team', {}).get('abbreviation', 'unknown')
                    probables = team.get('probables', [])
                    
                    if not probables:
                        logger.info(f"No probable pitchers for team {team_abbr}")
                        continue
                    
                    # Find the probable starting pitcher
                    probable_pitcher = None
                    for probable in probables:
                        if probable.get('name') == 'probableStartingPitcher':
                            probable_pitcher = probable
                            break
                    
                    if not probable_pitcher:
                        logger.info(f"No probable starting pitcher found for team {team_abbr}")
                        continue
                    
                    logger.info(f"Found probable pitcher: {probable_pitcher.get('athlete', {}).get('displayName', 'Unknown')} for {team_abbr}")
                    all_probable_pitchers.add_row(ProbablePitcher(event, team, competitors, probable_pitcher))
        
        return all_probable_pitchers

    def get_window_dates(self):
        start_date = datetime.today().date()
        end_date = start_date + timedelta(days=self.MAX_DAYS_AHEAD)
        return start_date, end_date

    def infer_projected_probable_pitchers(self):
        logger.info("Inferring projected probable pitchers")
        self.team_pitching_rotations.initialise_team_rotations()
        existing_probable_pitchers = self.team_pitching_rotations.get_new_probable_pitchers()

        start_date = self.get_latest_probable_pitcher_date()
        end_date = datetime.today().date() + timedelta(days=self.MAX_PROJECTED_DAYS_AHEAD)
        logger.info(f"Projecting probable pitchers from {start_date} to {end_date}")
        scheduled_games = self.get_future_scheduled_games(start_date, end_date)
        logger.info(f"Found {len(scheduled_games)} scheduled games between {start_date} and {end_date}")

        inferred_probable_pitchers = LogsInserter(ProjectedPitcher.KEYS, ProjectedPitcher.ID_KEYS)

        for game in scheduled_games:
            for team, opponent, home in [
                (game['home_team'], game['away_team'], True),
                (game['away_team'], game['home_team'], False)
            ]:
                logger.info(f"Processing team {team} for game on {game['game_date']}")
                
                # Check for any existing probable pitchers (confirmed or projected)
                # Convert string date to datetime.date for comparison
                if (game['game_date'], team) in existing_probable_pitchers:
                    logger.info(f"Already have probable pitcher for {team} on {game['game_date']}")
                    continue

                if not self.team_pitching_rotations.rotations_exist_for_team(team):
                    logger.info(f"No rotation found for team {team}")
                    continue

                [pitcher_id, espn_pitcher_id, normalised_name] = self.team_pitching_rotations.infer_next_pitcher_in_rotation(team)
                if not pitcher_id and not espn_pitcher_id:
                    logger.info(f"No next pitcher found for team {team}")
                    continue

                logger.info(f"Adding projected pitcher {normalised_name} for {team} on {game['game_date']}")
                inferred_probable_pitchers.add_row(ProjectedPitcher(game['mlb_game_id'], game['game_date'], team, opponent, pitcher_id, espn_pitcher_id, normalised_name, home))

        logger.info(f"Upserting {inferred_probable_pitchers.get_row_count()} inferred projected probable pitchers")
        self.upsert_probable_pitchers(inferred_probable_pitchers)
                
    def get_future_scheduled_games(self, start_date, end_date):
        scheduled_games = self.mlb_api.get_schedule(start_date, end_date)
        processed_games = []
        for day in scheduled_games.get('dates', []):
            for game in day.get("games", []):
                home_team_id = game.get('teams', {}).get('home', {}).get('team', {}).get('id')
                away_team_id = game.get('teams', {}).get('away', {}).get('team', {}).get('id')
                processed_games.append({
                    'mlb_game_id': game.get('gamePk'),
                    'game_date': datetime.strptime(game['gameDate'][:10], '%Y-%m-%d').date(),
                    'home_team': MLB_TEAM_IDS_REVERSE_MAP.get(home_team_id, 'UNK'),
                    'away_team': MLB_TEAM_IDS_REVERSE_MAP.get(away_team_id, 'UNK')
                })
        return processed_games

    def upsert_probable_pitchers(self, probable_pitchers: LogsInserter):
        if len(probable_pitchers.rows) == 0:
            logger.info("No probable pitchers to insert")
            return
        
        logger.info(f"Upserting {probable_pitchers.get_row_count()} probable pitchers")
        insert_query = f"""
            INSERT INTO {self.probable_pitchers_table} ({probable_pitchers.get_insert_keys()})
            VALUES ({probable_pitchers.get_placeholders()})
            ON DUPLICATE KEY UPDATE
                {probable_pitchers.get_duplicate_update_keys()}
        """
        self.batch_upsert(insert_query, probable_pitchers.get_rows())

