from models.player_lookup import PlayerLookup
from models.mlb_api import MlbApi
from models.db import get_db_connection

def main():
    conn = get_db_connection()
    mlb_api = MlbApi()
    player_lookup = PlayerLookup(conn, mlb_api)
    player_lookup.create_player_lookup_table()

if __name__ == "__main__":
    main() 