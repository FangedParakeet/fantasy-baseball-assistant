import logging
import requests
from datetime import datetime, timedelta
from models.db import get_db_connection
from models.logger import logger
from utils.functions import normalise_name
from models.mlb_api import MlbApi

def parse_games(data):
    records = []
    for date_info in data.get("dates", []):
        game_date = date_info["date"]
        for game in date_info.get("games", []):
            game_id = game["gamePk"]
            teams = game.get("teams", {})
            for side in ["home", "away"]:
                info = teams.get(side, {})
                team = info.get("team", {}).get("abbreviation")
                opponent = teams.get("away" if side == "home" else "home", {}).get("team", {}).get("abbreviation")
                pitcher = info.get("probablePitcher", {})
                pitcher_id = pitcher.get("id")
                pitcher_name = pitcher.get("fullName")
                throws = pitcher.get("pitchHand", {}).get("code")
                normalised_name = normalise_name(pitcher_name) if pitcher_name else None
                records.append((
                    game_id,
                    game_date,
                    team,
                    opponent,
                    pitcher_id,
                    pitcher_name,
                    throws,
                    side == "home",
                    normalised_name
                ))
    return records

def upsert_probable_pitchers(conn, records):
    logger.info(f"Upserting {len(records)} probable pitchers")
    query = """
        INSERT INTO probable_pitchers (
            game_id, game_date, team, opponent, pitcher_id, pitcher_name, throws, home, normalised_name
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            pitcher_id = VALUES(pitcher_id),
            pitcher_name = VALUES(pitcher_name),
            throws = VALUES(throws),
            opponent = VALUES(opponent),
            home = VALUES(home),
            normalised_name = VALUES(normalised_name)
    """
    with conn.cursor() as cursor:
        cursor.executemany(query, records)
    conn.commit()

def main():
    conn = get_db_connection()
    today = datetime.today()
    monday = today - timedelta(days=today.weekday())
    week_start = monday.strftime("%Y-%m-%d")
    next_week_end = (monday + timedelta(days=13)).strftime("%Y-%m-%d")

    try:
        mlb_api = MlbApi()
        data = mlb_api.get_probable_pitchers(week_start, next_week_end)
        records = parse_games(data)
        upsert_probable_pitchers(conn, records)
        logger.info("Probable pitchers sync complete.")
    except Exception as e:
        logger.error(f"Failed to sync probable pitchers: {e}")

if __name__ == "__main__":
    main()
