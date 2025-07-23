import logging
from datetime import datetime, timedelta
from pybaseball import statcast, playerid_reverse_lookup
from models.db import get_db_connection
from models.logger import logger
from utils.constants import ROLLING_PLAYER_WINDOWS, MAX_AGE_DAYS, BUFFER_DAYS, BATCH_SIZE
from utils.functions import chunked, normalise_name
import pandas as pd

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

def get_player_data_from_lookup(conn, player_ids):
    """Get player data (names and teams) from lookup table using efficient join"""
    if not player_ids:
        return {}
    
    try:
        logger.info(f"Getting player data for {len(player_ids)} players from lookup table")
        
        # Create a temporary table with the player IDs we need
        with conn.cursor() as cursor:
            # Create temp table
            cursor.execute("""
                CREATE TEMPORARY TABLE temp_player_ids (
                    player_id INT PRIMARY KEY
                )
            """)
            
            # Insert player IDs
            for player_id in player_ids:
                cursor.execute("INSERT INTO temp_player_ids (player_id) VALUES (%s)", (player_id,))
            
            # Join with player_lookup table
            cursor.execute("""
                SELECT pl.player_id, pl.normalised_name, pl.team
                FROM player_lookup pl
                INNER JOIN temp_player_ids t ON pl.player_id = t.player_id
            """)
            
            results = cursor.fetchall()
            
            # Create mapping
            player_data = {}
            for player_id, normalised_name, team in results:
                player_data[player_id] = {
                    'name': normalised_name,
                    'team': team
                }
                logger.info(f"Mapped player ID {player_id} to {normalised_name} ({team})")
            
            # Clean up temp table
            cursor.execute("DROP TEMPORARY TABLE temp_player_ids")
            
            logger.info(f"Successfully mapped {len(player_data)} out of {len(player_ids)} player IDs")
            return player_data
            
    except Exception as e:
        logger.error(f"Error getting player data from lookup: {e}")
        return {}

def aggregate_pitch_data_to_game_stats(pitch_data, conn):
    """Aggregate pitch-level statcast data into game-level statistics"""
    
    if pitch_data.empty:
        return pd.DataFrame()
    
    # Get all unique player IDs (batters and pitchers)
    batter_ids = pitch_data['batter'].unique().tolist()
    pitcher_ids = pitch_data['pitcher'].unique().tolist()
    all_player_ids = list(set(batter_ids + pitcher_ids))
    
    # Get player data from lookup table
    player_data = get_player_data_from_lookup(conn, all_player_ids)
    
    # Group by game_date, batter, and pitcher to get game-level stats
    game_stats = []
    
    # For batters
    batter_stats = pitch_data.groupby(['game_date', 'batter', 'home_team', 'away_team']).agg({
        'events': lambda x: list(x),
        'description': lambda x: list(x),
        'launch_speed': 'mean',
        'launch_angle': 'mean',
        'hit_distance_sc': 'max',
        'bb_type': lambda x: list(x.dropna()),
        'balls': 'sum',
        'strikes': 'sum',
        'at_bat_number': 'max',
        'inning_topbot': lambda x: list(x.dropna())
    }).reset_index()
    
    for _, row in batter_stats.iterrows():
        events = row['events']
        descriptions = row['description']
        
        # Calculate batting stats
        ab = len([e for e in events if e in ['single', 'double', 'triple', 'home_run', 'field_out', 'force_out', 'double_play', 'sac_fly', 'sac_bunt', 'field_error']])
        h = len([e for e in events if e in ['single', 'double', 'triple', 'home_run']])
        r = len([e for e in events if e == 'home_run'])  # Simplified - would need to track actual runs
        rbi = len([e for e in events if e in ['single', 'double', 'triple', 'home_run']])  # Simplified
        hr = len([e for e in events if e == 'home_run'])
        bb = len([e for e in events if e == 'walk'])
        so = len([e for e in events if e == 'strikeout'])
        
        avg = h / ab if ab > 0 else 0.0
        
        # Get player data from lookup
        player_info = player_data.get(row['batter'], {})
        player_name = player_info.get('name') if player_info else None
        player_team = player_info.get('team') if player_info else None
        
        # Determine team and opponent
        batter_team = player_team
        opponent_team = None
        is_home = False
        
        # If we have the actual team from lookup, determine opponent and home/away
        if batter_team and row['home_team'] and row['away_team']:
            if batter_team == row['home_team']:
                opponent_team = row['away_team']
                is_home = True
            elif batter_team == row['away_team']:
                opponent_team = row['home_team']
                is_home = False
            else:
                # Player's team is not in this game, use fallback
                opponent_team = row['away_team'] if batter_team == row['home_team'] else row['home_team']
                is_home = batter_team == row['home_team']
        else:
            # Fallback to inning context if no lookup data
            if row['home_team'] and row['away_team'] and row['inning_topbot']:
                inning_context = row['inning_topbot'][0] if row['inning_topbot'] else None
                
                if inning_context == 'Bot':  # Home team is batting
                    batter_team = row['home_team']
                    opponent_team = row['away_team']
                    is_home = True
                elif inning_context == 'Top':  # Away team is batting
                    batter_team = row['away_team']
                    opponent_team = row['home_team']
                    is_home = False
                else:
                    # Fallback if inning context is unclear
                    batter_team = row['home_team']
                    opponent_team = row['away_team']
                    is_home = True
            else:
                # Fallback if no inning context
                batter_team = row['home_team'] if row['home_team'] else row['away_team']
                opponent_team = row['away_team'] if row['home_team'] else row['home_team']
                is_home = row['home_team'] is not None
        
        game_stats.append({
            'player_id': row['batter'],
            'game_date': row['game_date'],
            'player_name': player_name,
            'team': batter_team,
            'opponent': opponent_team,
            'is_home': is_home,
            'position': 'B',  # Default to batter
            'ab': ab,
            'h': h,
            'r': r,
            'rbi': rbi,
            'hr': hr,
            'sb': 0,  # Would need separate tracking
            'bb': bb,
            'k': so,
            'ip': 0,  # Not applicable for batters
            'er': 0,  # Not applicable for batters
            'hits_allowed': 0,  # Not applicable for batters
            'walks_allowed': 0,  # Not applicable for batters
            'strikeouts': 0,  # Not applicable for batters
            'qs': 0,  # Not applicable for batters
            'bats': None,  # Would need to look up
            'opponent_hand': None,  # Would need to look up
            'normalised_name': player_name  # Use the name from lookup directly
        })
    
    # Process pitcher stats
    pitcher_stats = pitch_data.groupby(['game_date', 'pitcher', 'home_team', 'away_team']).agg({
        'pitch_type': lambda x: list(x),
        'balls': 'sum',
        'strikes': 'sum',
        'inning_topbot': lambda x: list(x.dropna())
    }).reset_index()
    
    for _, row in pitcher_stats.iterrows():
        pitch_types = row['pitch_type']
        balls = row['balls']
        strikes = row['strikes']
        
        # Get player data from lookup
        player_info = player_data.get(row['pitcher'], {})
        player_name = player_info.get('name') if player_info else None
        player_team = player_info.get('team') if player_info else None
        
        # Calculate pitching stats (simplified)
        ip = len(pitch_types) / 3  # Rough estimate of innings pitched
        er = 0  # Would need to track actual earned runs
        hits_allowed = 0  # Would need to track
        walks_allowed = balls
        strikeouts = strikes
        qs = 1 if ip >= 6 and er <= 3 else 0  # Quality start logic
        
        # Determine team and opponent
        pitcher_team = player_team
        opponent_team = None
        is_home = False
        
        # If we have the actual team from lookup, determine opponent and home/away
        if pitcher_team and row['home_team'] and row['away_team']:
            if pitcher_team == row['home_team']:
                opponent_team = row['away_team']
                is_home = True
            elif pitcher_team == row['away_team']:
                opponent_team = row['home_team']
                is_home = False
            else:
                # Player's team is not in this game, use fallback
                opponent_team = row['away_team'] if pitcher_team == row['home_team'] else row['home_team']
                is_home = pitcher_team == row['home_team']
        else:
            # Fallback to inning context if no lookup data
            if row['home_team'] and row['away_team'] and row['inning_topbot']:
                inning_context = row['inning_topbot'][0] if row['inning_topbot'] else None
                
                if inning_context == 'Top':  # Away team is batting, so pitcher is from home team
                    pitcher_team = row['home_team']
                    opponent_team = row['away_team']
                    is_home = True
                elif inning_context == 'Bot':  # Home team is batting, so pitcher is from away team
                    pitcher_team = row['away_team']
                    opponent_team = row['home_team']
                    is_home = False
                else:
                    # Fallback if inning context is unclear
                    pitcher_team = row['home_team']
                    opponent_team = row['away_team']
                    is_home = True
            else:
                # Fallback if no inning context
                pitcher_team = row['home_team'] if row['home_team'] else row['away_team']
                opponent_team = row['away_team'] if row['home_team'] else row['home_team']
                is_home = row['home_team'] is not None
        
        game_stats.append({
            'player_id': row['pitcher'],
            'game_date': row['game_date'],
            'player_name': player_name,
            'team': pitcher_team,
            'opponent': opponent_team,
            'is_home': is_home,
            'position': 'P',  # Default to pitcher
            'ab': 0,  # Not applicable for pitchers
            'h': 0,  # Not applicable for pitchers
            'r': 0,  # Not applicable for pitchers
            'rbi': 0,  # Not applicable for pitchers
            'hr': 0,  # Not applicable for pitchers
            'sb': 0,  # Not applicable for pitchers
            'bb': 0,  # Not applicable for pitchers
            'k': 0,  # Not applicable for pitchers
            'ip': ip,
            'er': er,
            'hits_allowed': hits_allowed,
            'walks_allowed': walks_allowed,
            'strikeouts': strikeouts,
            'qs': qs,
            'bats': None,  # Would need to look up
            'opponent_hand': None,  # Would need to look up
            'normalised_name': player_name  # Use the name from lookup directly
        })
    
    return pd.DataFrame(game_stats)


def upsert_game_logs(conn, logs, handedness_map):
    if logs.empty:
        logger.info("No game logs to insert")
        return
    
    rows = []
    for _, row in logs.iterrows():
        player_id = row['player_id']
        player_name = row['player_name']
        team = row['team']
        opponent = row['opponent']
        
        normalised_name = normalise_name(player_name) if player_name else None
        
        # Look up handedness info
        hand_info = handedness_map.get(player_id, {})
        bats = hand_info.get("bats")
        opponent_hand = None  # Would need more complex logic to determine
        
        rows.append((
            player_id,
            row['game_date'].date() if hasattr(row['game_date'], 'date') else row['game_date'],
            opponent,
            row['is_home'],
            row['position'],
            row['ab'], row['h'], row['r'], row['rbi'], row['hr'], row['sb'],
            row['bb'], row['k'], row['ip'], row['er'], row['hits_allowed'], row['walks_allowed'], row['strikeouts'], row['qs'],
            None, None, None,  # sv, hld, fantasy_points (not calculated yet)
            bats, opponent_hand, normalised_name, team
        ))

    insert_query = """
        INSERT INTO player_game_logs (
            player_id, game_date, opponent, is_home, position,
            ab, h, r, rbi, hr, sb, bb, k, ip, er, hits_allowed, walks_allowed, strikeouts, qs,
            sv, hld, fantasy_points, bats, opponent_hand, normalised_name, team
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            opponent=VALUES(opponent), is_home=VALUES(is_home), position=VALUES(position),
            ab=VALUES(ab), h=VALUES(h), r=VALUES(r), rbi=VALUES(rbi), hr=VALUES(hr), sb=VALUES(sb),
            bb=VALUES(bb), k=VALUES(k), ip=VALUES(ip), er=VALUES(er), hits_allowed=VALUES(hits_allowed),
            walks_allowed=VALUES(walks_allowed), strikeouts=VALUES(strikeouts), qs=VALUES(qs),
            sv=VALUES(sv), hld=VALUES(hld), fantasy_points=VALUES(fantasy_points),
            bats=VALUES(bats), opponent_hand=VALUES(opponent_hand), normalised_name=VALUES(normalised_name), team=VALUES(team)
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
        for window in ROLLING_PLAYER_WINDOWS:
            cursor.execute("DELETE FROM player_rolling_stats WHERE span_days = %s", (window,))

            cursor.execute(f"""
                INSERT INTO player_rolling_stats (player_id, span_days, start_date, end_date, 
                    abs, hits, hr, rbi, sb, k, avg, 
                    ip, er, qs, whip, era, normalised_name)
                SELECT 
                    player_id,
                    %s AS span_days,
                    MIN(game_date) AS start_date,
                    MAX(game_date) AS end_date,
                    SUM(ab), SUM(h), SUM(hr), SUM(rbi), SUM(sb),
                    SUM(k),
                    ROUND(SUM(h)/NULLIF(SUM(ab),0), 3) AS avg,
                    ROUND(SUM(ip), 2),
                    SUM(er),
                    SUM(CASE WHEN qs = 1 THEN 1 ELSE 0 END),
                    ROUND(SUM(walks_allowed + hits_allowed)/NULLIF(SUM(ip),0), 2) AS whip,
                    ROUND(SUM(er)*9/NULLIF(SUM(ip),0), 2) AS era,
                    MAX(normalised_name)
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

    pitch_data = fetch_player_game_logs(start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d'))
    if pitch_data.empty:
        logger.info("No pitch data found for this window.")
        return

    # Aggregate pitch data to game-level stats
    logs = aggregate_pitch_data_to_game_stats(pitch_data, conn)
    if logs.empty:
        logger.info("No game logs generated from pitch data.")
        return

    handedness_map = get_player_hand_map(conn)
    upsert_game_logs(conn, logs, handedness_map)
    compute_rolling_stats(conn)
    logger.info("Sync complete.")


if __name__ == "__main__":
    main()
