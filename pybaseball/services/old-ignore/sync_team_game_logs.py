import logging
from datetime import datetime, timedelta
from pybaseball import team_game_logs
from models.db import get_db_connection
from models.logger import logger
from utils.constants import ROLLING_TEAM_WINDOWS, BUFFER_DAYS, MLB_TEAM_CODES
import pandas as pd

def fetch_team_game_logs(start_date, team):
    season_year = start_date.year
    all_logs = []

    logger.info(f"Fetching game logs for {team} in {season_year}")
    try:
        logs = team_game_logs(season_year, team)
        # Filter by date range
        logs['Date'] = pd.to_datetime(logs['Date'])
        filtered = logs[(logs['Date'] >= start_date)]
        filtered['team'] = team  # Add team column manually
        all_logs.append(filtered)
    except Exception as e:
        logger.warning(f"Failed to fetch logs for {team}: {e}")

    return pd.concat(all_logs, ignore_index=True) if all_logs else pd.DataFrame()

def purge_old_logs(conn):
    today = datetime.today()
    year_start = datetime(today.year, 1, 1)
    logger.info(f"Purging team_game_logs older than {year_start.date()}")
    with conn.cursor() as cursor:
        cursor.execute("""
            DELETE FROM team_game_logs WHERE game_date < %s
        """, (year_start.date(),))
    conn.commit()

def get_latest_game_log_date(conn):
    with conn.cursor() as cursor:
        cursor.execute("SELECT MAX(game_date) FROM team_game_logs")
        row = cursor.fetchone()
        return row[0] if row[0] else None

def upsert_game_logs(conn, logs):
    with conn.cursor() as cursor:
        for _, row in logs.iterrows():
            cursor.execute("""
                INSERT INTO team_game_logs (
                    team, game_date, opponent, is_home, runs_scored, runs_allowed, pitcher_hand
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE 
                    opponent = VALUES(opponent), is_home = VALUES(is_home),
                    runs_scored = VALUES(runs_scored), runs_allowed = VALUES(runs_allowed),
                    pitcher_hand = VALUES(pitcher_hand)
            """, (
                row['team'], row['game_date'], row['opponent'],
                row['is_home'], row['runs_scored'], row['runs_allowed'], row['pitcher_hand']
            ))
    conn.commit()

def compute_rolling_stats(conn):
    logger.info("Computing team rolling stats")
    with conn.cursor() as cursor:
        for window in ROLLING_TEAM_WINDOWS:
            cursor.execute("DELETE FROM team_rolling_stats WHERE window_days = %s", (window,))

            cursor.execute(f"""
                INSERT INTO team_rolling_stats (
                    team, split_type, window_days, games_played, runs_scored, runs_allowed, run_diff, avg_runs_scored, avg_runs_allowed
                )
                SELECT
                    team,
                    'overall' AS split_type,
                    %s AS window_days,
                    COUNT(*) AS games_played,
                    SUM(runs_scored) AS runs_scored,
                    SUM(runs_allowed) AS runs_allowed,
                    SUM(runs_scored - runs_allowed) AS run_diff,
                    ROUND(AVG(runs_scored), 2) AS avg_runs_scored,
                    ROUND(AVG(runs_allowed), 2) AS avg_runs_allowed
                FROM team_game_logs
                WHERE game_date >= CURDATE() - INTERVAL %s DAY
                GROUP BY team
            """, (window, window))

        # Full season (no limit)
        cursor.execute("DELETE FROM team_rolling_stats WHERE window_days = 0")
        cursor.execute("""
            INSERT INTO team_rolling_stats (
                team, split_type, window_days, games_played, runs_scored, runs_allowed, run_diff, avg_runs_scored, avg_runs_allowed
            )
            SELECT
                team,
                'overall' AS split_type,
                0 AS window_days,
                COUNT(*) AS games_played,
                SUM(runs_scored) AS runs_scored,
                SUM(runs_allowed) AS runs_allowed,
                SUM(runs_scored - runs_allowed) AS run_diff,
                ROUND(AVG(runs_scored), 2) AS avg_runs_scored,
                ROUND(AVG(runs_allowed), 2) AS avg_runs_allowed
            FROM team_game_logs
            GROUP BY team
        """)
    conn.commit()

def main():
    conn = get_db_connection()

    purge_old_logs(conn)

    today = datetime.today()
    latest_date = get_latest_game_log_date(conn)
    start_date = (latest_date - timedelta(days=BUFFER_DAYS)) if latest_date else datetime(today.year, 1, 1)
    end_date = datetime.today()

    for team in MLB_TEAM_CODES:
        logs = fetch_team_game_logs(start_date, team)
        if logs.empty:
            logger.info(f"No game logs found for {team} in {start_date.year}")
            continue
        upsert_game_logs(conn, logs)

    compute_rolling_stats(conn)
    logger.info("Team sync complete.")

if __name__ == "__main__":
    main()
