from datetime import datetime, timedelta
from utils.logger import logger
from models.db_recorder import DB_Recorder
from models.api.espn_api import EspnApi
from models.game_logs.logs_inserter import LogsInserter
from models.game_logs.probable_pitcher import ProbablePitcher

class ProbablePitchers(DB_Recorder):
    MAX_DAYS_AHEAD = 10
    PROBABLE_PITCHERS_TABLE = "probable_pitchers"
    
    def __init__(self, conn, espn_api: EspnApi):
        self.probable_pitchers_table = "probable_pitchers"
        self.game_pitchers_table = "game_pitchers"
        self.conn = conn
        self.espn_api = espn_api
        super().__init__(conn)

    def purge_old_pitcher_games(self):
        self.purge_old_records(self.probable_pitchers_table)

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
                    logger.info(f"Team {team_abbr} has {len(probables)} probables")
                    
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

