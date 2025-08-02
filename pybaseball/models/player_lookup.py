from models.logger import logger
from models.db_recorder import DB_Recorder
from utils.constants import MLB_TEAM_IDS
from utils.functions import normalise_name

class PlayerLookup(DB_Recorder):
    LOOKUP_TABLE = "player_lookup"

    def __init__(self, conn, mlb_api):
        self.conn = conn
        self.mlb_api = mlb_api

    def create_player_lookup_table(self):
        """Create a player lookup table using MLB Stats API"""
        
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
                            
                            # logger.info(f"    {full_name} (ID: {player_id})")
                else:
                    logger.warning(f"  No roster found for {team_code}")
            
            # Insert into database
            if all_players:
                logger.info(f"Inserting {len(all_players)} player records")
                
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
                
                logger.info("Player lookup table created successfully")
                
            else:
                logger.warning("No player data to insert")
                
        except Exception as e:
            logger.error(f"Error creating player lookup table: {e}")
        finally:
            self.conn.close()

    def get_player_data_from_lookup(self, player_ids):
        """Get player data from lookup table using player IDs"""
        if not player_ids:
            return {}
        
        try:
            logger.info(f"Getting player data for {len(player_ids)} players from lookup table")
            
            # Create a temporary table with the player IDs we need
            with self.conn.cursor() as cursor:
                # Create temp table
                cursor.execute("""
                    CREATE TEMPORARY TABLE temp_player_ids (
                        player_id INT
                    )
                """)
                
                # Insert player IDs (remove duplicates)
                unique_player_ids = list(set(player_ids))
                for player_id in unique_player_ids:
                    cursor.execute("INSERT INTO temp_player_ids (player_id) VALUES (%s)", (player_id,))
                
                # Join with player_lookup table
                cursor.execute(f"""
                    SELECT pl.player_id, pl.normalised_name, pl.team
                    FROM {self.LOOKUP_TABLE} pl
                    INNER JOIN temp_player_ids t ON pl.player_id = t.player_id
                """)
                
                results = cursor.fetchall()
                
                # Create mapping
                player_data = {}
                for player_id, normalised_name, team in results:
                    player_data[player_id] = {
                        'name': normalised_name,
                        'team': team
                    }
                    logger.info(f"Mapped player ID {player_id} to {normalised_name} ({team})")
                
                # Clean up temp table
                cursor.execute("DROP TEMPORARY TABLE temp_player_ids")
                
                logger.info(f"Successfully mapped {len(player_data)} out of {len(player_ids)} player IDs")
                return player_data
                
        except Exception as e:
            logger.error(f"Error getting player data from lookup: {e}")
            return {}


    def get_player_name_from_lookup(self, player_id):
        """Get player name from the lookup table"""
        try:
            with self.conn.cursor() as cursor:
                cursor.execute(f"SELECT normalised_name FROM {self.LOOKUP_TABLE} WHERE player_id = %s", (player_id,))
                result = cursor.fetchone()
                return result[0] if result else None
        except Exception as e:
            logger.error(f"Error looking up player {player_id}: {e}")
            return None
        finally:
            self.conn.close()

    def get_player_team_from_lookup(self, player_id):
        """Get player team from the lookup table"""
        try:
            with self.conn.cursor() as cursor:
                cursor.execute(f"SELECT team FROM {self.LOOKUP_TABLE} WHERE player_id = %s", (player_id,))
                result = cursor.fetchone()
                return result[0] if result else None
        except Exception as e:
            logger.error(f"Error looking up player team {player_id}: {e}")
            return None
        finally:
            self.conn.close()

