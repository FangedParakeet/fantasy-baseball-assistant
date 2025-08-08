from models.api.mlb_api import MlbApi
from models.sync_status import SyncStatus
from models.db_recorder import DB_Recorder
from utils.logger import logger
from models.player_lookups import PlayerLookups
from models.game_logs.player_lookup import PlayerLookup
from models.game_logs.logs_inserter import LogsInserter
from models.player_game_logs import PlayerGameLogs
from models.probable_pitchers import ProbablePitchers
from utils.constants import MLB_TEAM_IDS

class PlayerHydrator(DB_Recorder):
    HYDRATE_PLAYER_LOOKUP_SYNC_NAME = "hydrate_player_lookup"
    UPDATE_ACTIVE_TEAM_ROSTERS_SYNC_NAME = "update_active_team_rosters"

    def __init__(self, conn, mlb_api: MlbApi, sync_status: SyncStatus, player_lookups: PlayerLookups):
        super().__init__(conn)
        self.conn = conn
        self.mlb_api = mlb_api
        self.sync_status = sync_status
        self.player_lookups = player_lookups

    def hydrate_players(self, force: bool=False) -> None:
        if not self.should_run_sync(self.HYDRATE_PLAYER_LOOKUP_SYNC_NAME, force):
            return

        player_ids = self.player_lookups.get_stale_player_ids()
        logger.info(f"Hydrating {len(player_ids)} players")

        players = self.mlb_api.get_player_info(player_ids)
        all_rows = self.process_players(players)
        logger.info(f"Found data for {all_rows.get_row_count()} players")
        if all_rows.is_empty():
            logger.info("No players found")
            self.set_sync_status(self.HYDRATE_PLAYER_LOOKUP_SYNC_NAME, "warning", "No players found")
            return

        self.player_lookups.insert_rows_into_lookup_table(all_rows)

        self.set_sync_status(self.HYDRATE_PLAYER_LOOKUP_SYNC_NAME, "success", f"Hydrated {all_rows.get_row_count()} players")
        logger.info(f"Hydrated {all_rows.get_row_count()} players")


    def update_active_team_rosters(self, force: bool=False) -> None:
        if not self.should_run_sync(self.UPDATE_ACTIVE_TEAM_ROSTERS_SYNC_NAME, force):
            return

        logger.info("Updating player lookup table with active team rosters")
        try:        
            # Get rosters for all MLB teams
            extra_keys = ['team', 'status']
            all_players = LogsInserter(PlayerLookup.KEYS + extra_keys, PlayerLookup.ID_KEYS)
            all_player_ids = []
            logger.info(f"Getting rosters for {len(MLB_TEAM_IDS)} MLB teams...")
            
            for team_code, team_id in MLB_TEAM_IDS.items():
                logger.info(f"Getting roster for {team_code} (ID: {team_id})...")
                
                roster_data = self.mlb_api.get_team_roster(team_id)
                
                if roster_data and 'roster' in roster_data:
                    roster = roster_data['roster']
                    logger.info(f"  Found {len(roster)} players")
                    
                    for player in roster:
                        person = player.get('person', {})
                        player_id = person.get('id')
                        full_name = person.get('fullName')
                        
                        if player_id and full_name:
                            # Split name into first and last
                            all_player_ids.append(player_id)
                            all_players.add_row(PlayerLookup(extra_keys, person, team_code))
                else:
                    logger.warning(f"No roster found for {team_code}")
            
            # Insert into database
            if not all_players.is_empty():
                logger.info(f"Upserting {all_players.get_row_count()} player records")
                
                self.player_lookups.insert_rows_into_lookup_table(all_players)
                self.set_sync_status(self.UPDATE_ACTIVE_TEAM_ROSTERS_SYNC_NAME, "success", f"Updated {all_players.get_row_count()} player records")
                self.player_lookups.set_unrostered_players_to_inactive(all_player_ids)
                logger.info("Player lookup table updated successfully")
            else:
                logger.warning("No player data to insert")
                self.set_sync_status(self.UPDATE_ACTIVE_TEAM_ROSTERS_SYNC_NAME, "warning", "No player data to insert")

        except Exception as e:
            logger.error(f"Error updating player lookup table with active team rosters: {e}")
            self.set_sync_status(self.UPDATE_ACTIVE_TEAM_ROSTERS_SYNC_NAME, "error", f"Error updating player lookup table with active team rosters: {e}")

    def process_players(self, player_info: list[dict]) -> LogsInserter:
        extra_keys = ['bats', 'throws']
        all_rows = LogsInserter(PlayerLookup.KEYS + extra_keys, PlayerLookup.ID_KEYS)
        for player in player_info:
            all_rows.add_row(PlayerLookup(extra_keys, player))
        return all_rows

    def update_table_from_lookup(self, table_name: str) -> None:
        logger.info(f"Updating {table_name} from player lookup table")
        if table_name == PlayerGameLogs.GAME_LOGS_TABLE:
            self.player_lookups.update_player_names_from_lookup(table_name)
        elif table_name == ProbablePitchers.PROBABLE_PITCHERS_TABLE:
            self.player_lookups.update_player_names_from_lookup(table_name)
            self.player_lookups.update_player_ids_from_lookup(table_name)

    def should_run_sync(self, sync_name: str, force: bool=False) -> bool:
        if not self.sync_status.should_sync(sync_name, force):
            logger.info(f"Skipping {sync_name} sync as it was run less than {self.sync_status.THROTTLE_HOURS} hours ago")
            return False
        return True

    def set_sync_status(self, sync_name: str, status: str, message: str) -> None:
        self.sync_status.set_sync_status(sync_name, status, message)