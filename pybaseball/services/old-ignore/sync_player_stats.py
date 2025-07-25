import logging
from datetime import datetime, timedelta
from pybaseball import batting_stats_range, pitching_stats_range, playerid_reverse_lookup
from models.db import get_db_connection
from models.logger import logger
from utils.constants import ROLLING_PLAYER_WINDOWS, BATCH_SIZE
from utils.functions import chunked, normalise_name

def fetch_player_stats(start_date, end_date):
    batting = batting_stats_range(start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d'))
    pitching = pitching_stats_range(start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d'))
    return batting, pitching

def get_player_handedness(player_ids):
    try:
        info_df = playerid_reverse_lookup(player_ids, key_type='fangraphs')
        handedness_map = {}
        for _, row in info_df.iterrows():
            player_id = int(row['key_fangraphs'])
            bats = row.get('bats')
            throws = row.get('throws')
            handedness_map[player_id] = (bats, throws)
        return handedness_map
    except Exception as e:
        logger.warning(f"Failed to lookup handedness: {e}")
        return {}


def upsert_stats(conn, data, stat_period, handedness_map):
    logger.info(f"Upserting {stat_period} stats for {len(data)} players")
    rows = []

    for _, row in data.iterrows():
        player_name = row['Name']
        player_id = int(row.get('IDfg') or row.get('playerid'))
        if not player_id:
            continue

        bats, throws = handedness_map.get(player_id, (None, None))
        normalised_name = normalise_name(player_name) if player_name else None
        rows.append((
            player_id, stat_period,
            row.get('G', 0), row.get('AVG', 0.0), row.get('OBP', 0.0), row.get('SLG', 0.0), row.get('OPS', 0.0),
            row.get('HR', 0), row.get('R', 0), row.get('RBI', 0), row.get('SB', 0), row.get('SO', 0),
            row.get('BB', 0), row.get('SF', 0), row.get('ERA', 0.0), row.get('WHIP', 0.0),
            row.get('QS', 0), row.get('IP', 0.0), row.get('SV', 0), row.get('HLD', 0),
            bats, throws, normalised_name
        ))

    insert_query = """
        INSERT INTO player_stats (player_id, stat_period, games, avg, obp, slg, ops, hr, r, rbi, sb, k, bb, sf, era, whip, qs, ip, sv, hld, bats, throws, normalised_name)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
        games = VALUES(games), avg = VALUES(avg), obp = VALUES(obp), slg = VALUES(slg), ops = VALUES(ops), hr = VALUES(hr), r = VALUES(r), rbi = VALUES(rbi), sb = VALUES(sb), k = VALUES(k), bb = VALUES(bb), sf = VALUES(sf), era = VALUES(era), whip = VALUES(whip), qs = VALUES(qs), ip = VALUES(ip), sv = VALUES(sv), hld = VALUES(hld), bats = VALUES(bats), throws = VALUES(throws), normalised_name = VALUES(normalised_name)
    """

    with conn.cursor() as cursor:
        for batch in chunked(rows, BATCH_SIZE):
            try:
                cursor.executemany(insert_query, batch)
            except Exception as e:
                logger.warning(f"Failed to insert batch: {e}")
                conn.rollback()
            finally:
                conn.commit()


def main():
    conn = get_db_connection()
    today = datetime.today()

    # Full season
    logger.info("Fetching full season batting and pitching stats")
    batting, pitching = fetch_player_stats(datetime(today.year, 1, 1), today)
    
    all_ids = set(batting['IDfg'].dropna().astype(int)).union(set(pitching['IDfg'].dropna().astype(int)))
    all_ids = list(all_ids)
    handedness_map = get_player_handedness(list(map(int, all_ids)))

    upsert_stats(conn, batting, 'season', handedness_map)
    upsert_stats(conn, pitching, 'season', handedness_map)

    # Rolling stats
    for days in ROLLING_PLAYER_WINDOWS:
        start = (today - timedelta(days=days))
        logger.info(f"Fetching {days}-day rolling stats")
        batting, pitching = fetch_player_stats(start, today)
        upsert_stats(conn, batting, f"{days}d", handedness_map)
        upsert_stats(conn, pitching, f"{days}d", handedness_map)

    logger.info("Player stat sync complete.")


if __name__ == "__main__":
    main()
