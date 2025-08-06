from models.db_recorder import DB_Recorder
from utils.logger import logger
from collections import defaultdict
from datetime import datetime

class TeamPitchingRotations(DB_Recorder):
    MAX_ROTATION_DAYS_BEHIND = 10
    MAX_ROTATION_GAMES_BEHIND = 20
    MAX_PITCHERS_IN_ROTATION = 6

    def __init__(self, conn, probable_pitchers_table_name: str, player_lookups_table_name: str, game_pitchers_table_name: str):
        self.conn = conn
        self.probable_pitchers_table = probable_pitchers_table_name
        self.player_lookups_table = player_lookups_table_name
        self.game_pitchers_table = game_pitchers_table_name
        self.team_rotations_full = None
        self.team_rotations_names = None
        self.projected_pitcher_count = None
        self.new_probable_pitchers = None

    def rotations_exist_for_team(self, team: str) -> bool:
        return team in self.team_rotations_full

    def infer_next_pitcher_in_rotation(self, team):
        rotation = self.team_rotations_full.get(team, [])
        if not rotation:
            return None

        index = self.projected_pitcher_count[team] % len(rotation)
        pitcher = rotation[index]
        self.increment_projected_pitcher_count(team)
        return pitcher

    def increment_projected_pitcher_count(self, team: str):
        self.projected_pitcher_count[team] += 1

    def get_new_probable_pitchers(self):
        return {(game['game_date'], game['team']) for game in self.new_probable_pitchers}

    def initialise_team_rotations(self):
        logger.info("Initialising team rotations")
        recent_games = self.get_team_last_pitchers()
        last_complete_game_pitcher_date = self.get_latest_complete_game_pitcher_date()
        self.new_probable_pitchers = self.get_probable_pitchers_after_date(last_complete_game_pitcher_date)
        
        # Merge historical games with confirmed future games to build complete rotation picture
        merged_games = self.merge_game_lists(self.new_probable_pitchers, recent_games)
        
        self.team_rotations_full, self.team_rotations_names = self.get_team_rotations_from_recent_games(merged_games)
        self.initialise_projected_pitcher_count()
        logger.info(f"Built rotations for {len(self.team_rotations_full)} teams")

    def initialise_projected_pitcher_count(self):
        logger.info("Initialising projected pitcher count")
        projected_pitcher_count = defaultdict(int)
        teams_with_rotations = set(self.team_rotations_full.keys())

        # For each team, find the last confirmed pitcher and determine next position in rotation
        for team in teams_with_rotations:
            rotation = self.team_rotations_names[team]
            if not rotation:
                continue
                
            # Get the most recent confirmed game for this team (data already sorted by date DESC)
            team_confirmed_games = [game for game in self.new_probable_pitchers 
                                  if game['team'] == team]
            
            if team_confirmed_games:
                # First game is the most recent since data is already sorted DESC
                last_confirmed_pitcher_name = team_confirmed_games[0]['normalised_name']
                
                # Find this pitcher's position in the rotation
                try:
                    last_pitcher_index = rotation.index(last_confirmed_pitcher_name)
                    # Next pitcher should be at the next index in rotation
                    projected_pitcher_count[team] = (last_pitcher_index + 1) % len(rotation)
                except ValueError:
                    # If the last confirmed pitcher isn't in our rotation, start from beginning
                    logger.warning(f"Last confirmed pitcher {last_confirmed_pitcher_name} for team {team} not found in rotation {rotation}")
                    projected_pitcher_count[team] = 0
            else:
                # No confirmed games, start from beginning of rotation
                projected_pitcher_count[team] = 0
        
        self.projected_pitcher_count = projected_pitcher_count

    def get_probable_pitchers_after_date(self, start_date):
        records = self.get_records_with_conditions(self.probable_pitchers_table, [start_date], ['team', 'player_id', 'espn_pitcher_id', 'normalised_name', 'game_date'], ['game_date >= %s', "accuracy = 'confirmed'"], ['game_date DESC'])
        return records

    def get_latest_complete_game_pitcher_date(self) -> datetime:
        query = f"""
            SELECT MAX(game_date) as latest_complete_game_date
            FROM {self.game_pitchers_table} gp1
            WHERE NOT EXISTS (
                SELECT 1 
                FROM {self.game_pitchers_table} gp2 
                WHERE gp2.game_date = gp1.game_date 
                AND (gp2.home_pitcher_id IS NULL OR gp2.away_pitcher_id IS NULL)
            );
        """
        return self.get_query(query)[0]['latest_complete_game_date']

    def get_team_rotations_from_recent_games(self, recent_games):
        team_rotations_full = defaultdict(list)
        team_rotations_names = defaultdict(list)
        seen_pitchers = defaultdict(set)
        completed_teams = set()
        
        # Group games by team and build rotations
        for game in recent_games:
            team = game['team']
            
            # Skip if we've already completed this team's rotation
            if team in completed_teams:
                continue
            
            pitcher = (game['player_id'], game['espn_pitcher_id'], game['normalised_name'])
            # Skip if we've already seen this pitcher for this team
            if pitcher[2] in seen_pitchers[team]:
                continue
            
            # Add pitcher to rotation (insert at beginning to reverse chronological order)
            team_rotations_full[team].insert(0, pitcher)
            team_rotations_names[team].insert(0, pitcher[2])
            seen_pitchers[team].add(pitcher[2])

            if len(team_rotations_full[team]) == self.MAX_PITCHERS_IN_ROTATION:
                logger.info(f"Team {team} rotation complete: {team_rotations_names[team]} ({len(team_rotations_full[team])} pitchers)")
                completed_teams.add(team)
        
        # Log teams that didn't complete their rotation
        for team in team_rotations_full:
            if team not in completed_teams:
                logger.warning(f"Team {team} rotation incomplete: {team_rotations_names[team]} ({len(team_rotations_full[team])} pitchers) - may need more recent games")
        
        logger.info(f"Built rotations for {len(team_rotations_full)} teams")
        return team_rotations_full, team_rotations_names

    def get_team_last_pitchers(self):
        logger.info("Gathering recent pitchers for each team")
        try:
            # Get the most recent games for each team to build rotations
            query = f"""
                WITH team_recent_games AS (
                    SELECT 
                        team,
                        pitcher_id,
                        normalised_name,
                        game_date,
                        ROW_NUMBER() OVER (
                            PARTITION BY team 
                            ORDER BY game_date DESC
                        ) as rn
                    FROM (
                        SELECT home_team as team, home_pitcher_id as pitcher_id, pl.normalised_name, game_date
                        FROM {self.game_pitchers_table} gp
                        LEFT JOIN {self.player_lookups_table} pl ON gp.home_pitcher_id = pl.player_id
                        WHERE home_pitcher_id IS NOT NULL
                        AND game_date >= CURDATE() - INTERVAL {self.MAX_ROTATION_DAYS_BEHIND} DAY
                        AND pl.status = 'Active'
                        AND pl.team = home_team
                        
                        UNION ALL
                        
                        SELECT away_team as team, away_pitcher_id as pitcher_id, pl.normalised_name, game_date
                        FROM {self.game_pitchers_table} gp
                        LEFT JOIN {self.player_lookups_table} pl ON gp.away_pitcher_id = pl.player_id
                        WHERE away_pitcher_id IS NOT NULL
                        AND game_date >= CURDATE() - INTERVAL {self.MAX_ROTATION_DAYS_BEHIND} DAY
                        AND pl.status = 'Active'
                        AND pl.team = away_team
                    ) all_games
                    WHERE pitcher_id IS NOT NULL
                )
                SELECT 
                    team,
                    pitcher_id AS player_id,
                    NULL AS espn_pitcher_id,
                    normalised_name,
                    game_date
                FROM team_recent_games
                WHERE rn <= {self.MAX_ROTATION_GAMES_BEHIND}
                ORDER BY team, game_date DESC
            """
            
            recent_games = self.get_query(query)
            return recent_games
        except Exception as e:
            logger.error(f"Error getting recent pitchers for each team: {e}")
            return {}

    def merge_game_lists(self, primary_list: list[dict], secondary_list: list[dict]) -> list[dict]:
        """
        Merge two lists of game dictionaries while maintaining order and removing duplicates.
        Primary list comes first, then secondary list items that aren't duplicates.
        Duplicates are identified by (team, normalised_name, game_date) tuple.
        """
        seen = set()
        merged = []
        
        # Add items from primary list first
        for game in primary_list:
            key = (game['team'], game['normalised_name'], game['game_date'])
            if key not in seen:
                seen.add(key)
                merged.append(game)
        
        # Add items from secondary list that aren't duplicates
        for game in secondary_list:
            key = (game['team'], game['normalised_name'], game['game_date'])
            if key not in seen:
                seen.add(key)
                merged.append(game)
        
        return merged
