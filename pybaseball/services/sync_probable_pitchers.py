from models.db import get_db_connection
from models.mlb_api import MlbApi
from models.probable_pitcher import ProbablePitcher

def main():
    conn = get_db_connection()
    mlb_api = MlbApi()
    probable_pitcher = ProbablePitcher(conn, mlb_api)

    probable_pitcher.purge_old_pitcher_games()
    games = probable_pitcher.fetch_probable_pitchers()
    probable_pitcher.upsert_probable_pitchers(games)

if __name__ == "__main__":
    main()
