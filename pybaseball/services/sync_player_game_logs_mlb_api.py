import pandas as pd
import time
from datetime import datetime, timedelta
from models.db import get_db_connection
from models.logger import logger
from models.mlb_api import MlbApi
from models.player_lookup import PlayerLookup
from utils.constants import BUFFER_DAYS, BATCH_SIZE, MAX_AGE_DAYS, ROLLING_PLAYER_WINDOWS

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

def fetch_game_logs(start_date, end_date):
    """Get game logs from MLB Stats API"""
    try:
        logger.info(f"Fetching MLB Stats API game logs from {start_date} to {end_date}")
        
        # Get games for the date range
        mlb_api = MlbApi()
        games_data = mlb_api.get_game_logs(start_date, end_date)
        
        games = []
        
        for date_data in games_data.get('dates', []):
            for game in date_data.get('games', []):
                games.append({
                    'game_pk': game['gamePk'],
                    'game_date': game['gameDate'],
                    'away_team': game['teams']['away']['team']['name'],
                    'home_team': game['teams']['home']['team']['name']
                })
        
        logger.info(f"Found {len(games)} games")
        
        # Get boxscores for each game
        all_game_logs = []
        
        for i, game in enumerate(games):  # Process all games instead of limiting to 10
            logger.info(f"Getting boxscore for game {game['game_pk']} ({i+1}/{len(games)})")
            
            try:
                box_data = mlb_api.get_box_score(game['game_pk'])
                
                # Process batting stats
                for team_type in ['away', 'home']:
                    team_data = box_data.get('teams', {}).get(team_type, {})
                    batters = team_data.get('batters', [])
                    
                    for batter_id in batters:
                        batter_stats = team_data.get('players', {}).get(f'ID{batter_id}', {})
                        stats = batter_stats.get('stats', {}).get('batting', {})
                        
                        if stats:
                            all_game_logs.append({
                                'player_id': batter_id,
                                'game_date': game['game_date'][:10],
                                'team': None,  # Will be set from lookup table
                                'opponent': game['home_team'] if team_type == 'away' else game['away_team'],
                                'is_home': team_type == 'home',
                                'position': 'B',
                                'ab': stats.get('atBats', 0),
                                'h': stats.get('hits', 0),
                                'r': stats.get('runs', 0),
                                'rbi': stats.get('rbi', 0),
                                'hr': stats.get('homeRuns', 0),
                                'sb': stats.get('stolenBases', 0),
                                'bb': stats.get('baseOnBalls', 0),
                                'k': stats.get('strikeOuts', 0),
                                'ip': 0,
                                'er': 0,
                                'hits_allowed': 0,
                                'walks_allowed': 0,
                                'strikeouts': 0,
                                'qs': 0
                            })
                
                # Process pitching stats
                pitchers = team_data.get('pitchers', [])
                for pitcher_id in pitchers:
                    pitcher_stats = team_data.get('players', {}).get(f'ID{pitcher_id}', {})
                    stats = pitcher_stats.get('stats', {}).get('pitching', {})
                    
                    if stats:
                        ip_str = stats.get('inningsPitched', '0')
                        ip_decimal = float(ip_str) if ip_str else 0
                        
                        qs = 1 if ip_decimal >= 6 and stats.get('earnedRuns', 0) <= 3 else 0
                        
                        all_game_logs.append({
                            'player_id': pitcher_id,
                            'game_date': game['game_date'][:10],
                            'team': None,  # Will be set from lookup table
                            'opponent': game['home_team'] if team_type == 'away' else game['away_team'],
                            'is_home': team_type == 'home',
                            'position': 'P',
                            'ab': 0,
                            'h': 0,
                            'r': 0,
                            'rbi': 0,
                            'hr': 0,
                            'sb': 0,
                            'bb': 0,
                            'k': 0,
                            'ip': ip_decimal,
                            'er': stats.get('earnedRuns', 0),
                            'hits_allowed': stats.get('hits', 0),
                            'walks_allowed': stats.get('baseOnBalls', 0),
                            'strikeouts': stats.get('strikeOuts', 0),
                            'qs': qs
                        })
            except Exception as e:
                logger.warning(f"Failed to get boxscore for game {game['game_pk']}: {e}")
            
            # Add a small delay between requests to be respectful to the API
            if i < len(games) - 1:  # Don't delay after the last request
                time.sleep(0.1)  # 100ms delay
        
        logger.info(f"Processed {len(all_game_logs)} game log entries")
        return pd.DataFrame(all_game_logs)
        
    except Exception as e:
        logger.error(f"Error fetching MLB Stats API game logs: {e}")
        return pd.DataFrame()


def process_game_logs(player_lookup, game_logs):
    """Process MLB API game logs into our format"""
    if game_logs.empty:
        return pd.DataFrame()
    
    # Get all unique player IDs
    player_ids = game_logs['player_id'].unique().tolist()
    
    # Get player data from lookup table
    player_data = player_lookup.get_player_data_from_lookup(player_ids)
    
    processed_logs = []
    
    for _, row in game_logs.iterrows():
        player_id = row['player_id']
        
        # Get player data from lookup
        player_info = player_data.get(player_id, {})
        player_name = player_info.get('name') if player_info else None
        team = player_info.get('team') if player_info else None
        
        # Skip if we don't have player data
        if not player_name:
            logger.warning(f"No player data found for ID {player_id}")
            continue
        
        processed_logs.append({
            'player_id': player_id,
            'game_date': row['game_date'],
            'player_name': player_name,
            'team': team,  # Use team from lookup table, not from game data
            'opponent': row['opponent'][:10] if row['opponent'] else None,  # Truncate opponent name
            'is_home': row['is_home'],
            'position': row['position'],
            'ab': row['ab'],
            'h': row['h'],
            'r': row['r'],
            'rbi': row['rbi'],
            'hr': row['hr'],
            'sb': row['sb'],
            'bb': row['bb'],
            'k': row['k'],
            'ip': row['ip'],
            'er': row['er'],
            'hits_allowed': row['hits_allowed'],
            'walks_allowed': row['walks_allowed'],
            'strikeouts': row['strikeouts'],
            'qs': row['qs'],
            'bats': None,
            'opponent_hand': None,
            'normalised_name': player_name
        })
    
    return pd.DataFrame(processed_logs)

def upsert_game_logs(conn, logs):
    """Upsert game logs to database"""
    if logs.empty:
        logger.info("No game logs to insert")
        return
    
    logger.info(f"Upserting {len(logs)} game logs")
    
    rows = []
    for _, row in logs.iterrows():
        rows.append((
            row['player_id'],
            row['game_date'],
            row['opponent'],
            row['is_home'],
            row['position'],
            row['ab'], row['h'], row['r'], row['rbi'], row['hr'], row['sb'],
            row['bb'], row['k'], row['ip'], row['er'], row['hits_allowed'], row['walks_allowed'], row['strikeouts'], row['qs'],
            None, None, None,  # sv, hld, fantasy_points (not calculated yet)
            row['bats'], row['opponent_hand'], row['normalised_name'], row['team']
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
            for batch in [rows[i:i + BATCH_SIZE] for i in range(0, len(rows), BATCH_SIZE)]:
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
    
    # Format dates as YYYY-MM-DD strings
    start_date_str = start_date.strftime('%Y-%m-%d')
    end_date_str = end_date.strftime('%Y-%m-%d')
    
    # Fetch game logs from MLB Stats API
    game_logs = fetch_game_logs(start_date_str, end_date_str)
    
    if game_logs.empty:
        logger.info("No game logs found for this window.")
        return
    
    # Process game logs
    player_lookup = PlayerLookup(conn, MlbApi())
    processed_logs = process_game_logs(player_lookup, game_logs)
    
    if processed_logs.empty:
        logger.info("No processed game logs generated.")
        return
    
    # Upsert to database
    upsert_game_logs(conn, processed_logs)

    compute_rolling_stats(conn)
    
    logger.info("MLB Stats API game logs sync complete.")

if __name__ == "__main__":
    main() 