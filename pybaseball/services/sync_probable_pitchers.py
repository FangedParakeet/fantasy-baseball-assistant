from models.db import get_db_connection
from models.api.espn_api import EspnApi
from models.probable_pitchers import ProbablePitchers
from models.player_lookup import PlayerLookup

def main():
    conn = get_db_connection()
    espn_api = EspnApi()
    player_lookup = PlayerLookup(conn)
    probable_pitchers = ProbablePitchers(conn, espn_api)

    probable_pitchers.purge_old_pitcher_games()
    probable_pitchers.upsert_all_probable_pitchers()
    player_lookup.update_probable_pitchers_from_lookup()

if __name__ == "__main__":
    main()
