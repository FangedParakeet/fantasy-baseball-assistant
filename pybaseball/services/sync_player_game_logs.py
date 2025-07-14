import logging
from datetime import datetime, timedelta
from pybaseball import statcast
from models.db import get_db_connection
from models.logger import logger
from utils.constants import ROLLING_WINDOWS, MAX_AGE_DAYS, BUFFER_DAYS, BATCH_SIZE
from utils.functions import chunked, normalise_name

def fetch_player_game_logs(start_date, end_date):
    logger.info(f"Fetching player game logs from {start_date} to {end_date}")
    return statcast(start_dt=start_date, end_dt=end_date)


def purge_old_logs(conn):
    cutoff_date = datetime.today() - timedelta(days=MAX_AGE_DAYS)
    logger.info(f"Purging player_game_logs older than {cutoff_date.date()}")
    with conn.cursor() as cursor:
        cursor.execute("""
            DELETE FROM player_game_logs WHERE game_date < %s
        """, (cutoff_date.date(),))
    conn.commit()


def get_latest_game_log_date(conn):
    with conn.cursor() as cursor:
        cursor.execute("SELECT MAX(game_date) FROM player_game_logs")
        row = cursor.fetchone()
        return row[0] if row[0] else None

def get_player_hand_map(conn):
    with conn.cursor() as cursor:
        cursor.execute("SELECT id, bats, throws FROM player_stats WHERE stat_period = 'season'")
        return {
            row[0]: {"bats": row[1], "throws": row[2]} for row in cursor.fetchall()
        }


def upsert_game_logs(conn, logs, handedness_map):
    rows = []
    for _, row in logs.iterrows():
        player_id = row.player_id
        player_team = row.team
        opponent = row.opponent

        player_name = getattr(row, "player_name", None)
        normalised_name = normalise_name(player_name) if player_name else None

        hand_info = handedness_map.get(player_id, {})
        bats = hand_info.get("bats")
        opponent_hand = None

        # Infer opponent_hand by looking up the opposing pitcher (simplified heuristic: first pitcher ID logged for opponent team)
        for opp_id, info in handedness_map.items():
            if info.get("throws") and row.pitcher == opp_id:
                opponent_hand = info["throws"]
                break
        
        if bats is None or opponent_hand is None:
            logger.debug(f"Missing handedness for player_id={player_id}, opponent={opponent}")

        rows.append((
            player_id,
            row.game_date,
            player_team,
            opponent,
            player_team == row.home_team,
            row.position,
            row.pa, row.ab, row.h, row.hr, row.rbi, row.sb,
            row.so, row.bb, row.avg, row.obp, row.slg, row.ops,
            row.ip, row.er, row.pitch_so, row.pitch_bb, row.h_allowed, row.whip,
            bats, opponent_hand, normalised_name
        ))

    insert_query = """
        INSERT INTO player_game_logs (
            player_id, game_date, team, opponent, is_home, position,
            pa, ab, hits, hr, rbi, sb, k, bb, avg, obp, slg, ops,
            innings_pitched, earned_runs, strikeouts, walks, hits_allowed, whip,
            bats, opponent_hand, normalised_name
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            team=VALUES(team), opponent=VALUES(opponent), is_home=VALUES(is_home),
            position=VALUES(position), pa=VALUES(pa), ab=VALUES(ab), hits=VALUES(hits),
            hr=VALUES(hr), rbi=VALUES(rbi), sb=VALUES(sb), k=VALUES(k), bb=VALUES(bb),
            avg=VALUES(avg), obp=VALUES(obp), slg=VALUES(slg), ops=VALUES(ops),
            innings_pitched=VALUES(innings_pitched), earned_runs=VALUES(earned_runs),
            strikeouts=VALUES(strikeouts), walks=VALUES(walks), hits_allowed=VALUES(hits_allowed),
            whip=VALUES(whip), bats=VALUES(bats), opponent_hand=VALUES(opponent_hand), normalised_name=VALUES(normalised_name)
    """

    with conn.cursor() as cursor:
        try:
            for batch in chunked(rows, BATCH_SIZE):
                cursor.executemany(insert_query, batch)
        except Exception as e:
            logger.warning(f"Failed to insert batch: {e}")
            conn.rollback()
        finally:
            conn.commit()


def compute_rolling_stats(conn):
    logger.info("Computing rolling stats")
    with conn.cursor() as cursor:
        for window in ROLLING_WINDOWS:
            cursor.execute("DELETE FROM player_rolling_stats WHERE window_days = %s", (window,))

            cursor.execute(f"""
                INSERT INTO player_rolling_stats (player_id, window_days, date_start, date_end, 
                    pa, ab, hits, hr, rbi, sb, k, bb, avg, obp, slg, ops, 
                    innings_pitched, earned_runs, strikeouts, walks, hits_allowed, whip, normalised_name)
                SELECT 
                    player_id,
                    %s AS window_days,
                    MIN(game_date) AS date_start,
                    MAX(game_date) AS date_end,
                    SUM(pa), SUM(ab), SUM(hits), SUM(hr), SUM(rbi), SUM(sb),
                    SUM(k), SUM(bb),
                    ROUND(SUM(hits)/NULLIF(SUM(ab),0), 3) AS avg,
                    ROUND(SUM(bb + hits)/NULLIF(SUM(pa),0), 3) AS obp,
                    ROUND(SUM(slg), 3),
                    ROUND(SUM(obp + slg), 3) AS ops,
                    ROUND(SUM(innings_pitched), 1),
                    SUM(earned_runs),
                    SUM(strikeouts),
                    SUM(walks),
                    SUM(hits_allowed),
                    ROUND(SUM(walks + hits_allowed)/NULLIF(SUM(innings_pitched),0), 3) AS whip,
                    normalised_name
                FROM player_game_logs
                WHERE game_date >= CURDATE() - INTERVAL %s DAY
                GROUP BY player_id
            """, (window, window))
    conn.commit()


def main():
    conn = get_db_connection()

    purge_old_logs(conn)

    latest_date = get_latest_game_log_date(conn)
    start_date = (latest_date - timedelta(days=BUFFER_DAYS)) if latest_date else datetime.today() - timedelta(days=MAX_AGE_DAYS)
    end_date = datetime.today()

    logs = fetch_player_game_logs(start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d'))
    if logs.empty:
        logger.info("No game logs found for this window.")
        return

    handedness_map = get_player_hand_map(conn)
    upsert_game_logs(conn, logs, handedness_map)
    compute_rolling_stats(conn)
    logger.info("Sync complete.")


if __name__ == "__main__":
    main()
