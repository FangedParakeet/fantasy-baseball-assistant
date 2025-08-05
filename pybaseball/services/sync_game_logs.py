from models.db import get_db_connection
from models.mlb_api import MlbApi
from models.player_game_logs import PlayerGameLogs
from models.team_game_logs import TeamGameLogs
from models.league_game_logs import LeagueGameLogs
from models.game_pitchers import GamePitchers
from models.logger import logger
        
def main():
    conn = get_db_connection()
    mlb_api = MlbApi()
    player_game_logs = PlayerGameLogs(conn)
    team_game_logs = TeamGameLogs(conn)
    game_pitchers = GamePitchers(conn)
    league_game_logs = LeagueGameLogs(mlb_api, player_game_logs, team_game_logs, game_pitchers)

    league_game_logs.purge_old_game_logs()

    games = league_game_logs.fetch_game_logs()
    league_game_logs.upsert_game_logs(games)
    
    logger.info("MLB Stats API game logs sync complete.")

if __name__ == "__main__":
    main() 