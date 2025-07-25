from models.db import get_db_connection
from models.mlb_api import MlbApi
from models.player_lookup import PlayerLookup
from models.player_game_log import PlayerGameLog
from models.team_game_log import TeamGameLog
from models.league_game_log import LeagueGameLog
from models.logger import logger
        
def main():
    conn = get_db_connection()
    mlb_api = MlbApi()
    player_lookup = PlayerLookup(conn, mlb_api)
    player_game_log = PlayerGameLog(conn, player_lookup)
    team_game_log = TeamGameLog(conn)
    league_game_log = LeagueGameLog(mlb_api, player_game_log, team_game_log)

    league_game_log.purge_old_game_logs()

    games = league_game_log.fetch_game_logs()
    league_game_log.upsert_game_logs(games)
    league_game_log.compute_rolling_stats()
    
    logger.info("MLB Stats API game logs sync complete.")

if __name__ == "__main__":
    main() 