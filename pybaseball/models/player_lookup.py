from models.logger import logger
from models.db_recorder import DB_Recorder
from models.player_game_logs import PlayerGameLogs
from utils.constants import MLB_TEAM_IDS
from utils.functions import normalise_name

class PlayerLookup(DB_Recorder):
    LOOKUP_TABLE = "player_lookup"

    def __init__(self, conn, mlb_api):
        self.conn = conn
        self.mlb_api = mlb_api
        self.player_game_logs_table = PlayerGameLogs.GAME_LOGS_TABLE

    def update_active_team_rosters(self):
        logger.info("Updating player lookup table with active team rosters")
        try:        
            # Get rosters for all MLB teams
            all_players = []
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
                            name_parts = full_name.split(' ', 1)
                            first_name = name_parts[0] if len(name_parts) > 0 else ''
                            last_name = name_parts[1] if len(name_parts) > 1 else ''
                            
                            all_players.append((
                                player_id,
                                normalise_name(full_name),
                                first_name,
                                last_name,
                                team_code
                            ))
                else:
                    logger.warning(f"No roster found for {team_code}")
            
            # Insert into database
            if all_players:
                logger.info(f"Upserting {len(all_players)} player records")
                
                insert_query = f"""
                    INSERT INTO {self.LOOKUP_TABLE} (player_id, normalised_name, first_name, last_name, team)
                    VALUES (%s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                    normalised_name = VALUES(normalised_name),
                    first_name = VALUES(first_name),
                    last_name = VALUES(last_name),
                    team = VALUES(team),
                    updated_at = CURRENT_TIMESTAMP
                """
                
                self.batch_upsert(insert_query, all_players)
                logger.info("Player lookup table updated successfully")
                
            else:
                logger.warning("No player data to insert")
                
        except Exception as e:
            logger.error(f"Error updating player lookup table with active team rosters: {e}")

    def update_player_game_log_names_from_lookup(self):
        logger.info("Updating player game log names from lookup table")
        try:
            update_query = f"""
                UPDATE {self.player_game_logs_table} pgl
                JOIN {self.LOOKUP_TABLE} pl ON pgl.player_id = pl.player_id
                SET pgl.normalised_name = pl.normalised_name
                WHERE pgl.normalised_name IS NULL
            """
            self.execute_query(update_query)
            logger.info("Player game log names updated successfully")
        except Exception as e:
            logger.error(f"Error updating player game log names from lookup table: {e}")