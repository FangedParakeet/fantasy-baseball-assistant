from datetime import datetime, timedelta
from models.db import get_db_connection
from models.logger import logger
from utils.constants import ROLLING_TEAM_WINDOWS

def get_rolling_windows():
    today = datetime.today()
    windows = {}
    for days in ROLLING_TEAM_WINDOWS:
        windows[f'{days}d'] = today - timedelta(days=days)
    windows['season'] = datetime(today.year, 1, 1)
    return windows

def main():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    insert_cursor = conn.cursor()

    date_windows = get_rolling_windows()

    for label, start_date in date_windows.items():
        logger.info(f"Processing team stats for {label} (since {start_date.date()})")

        # Fetch relevant game logs
        cursor.execute("""
            SELECT * FROM player_game_logs
            WHERE game_date >= %s
        """, (start_date,))
        rows = cursor.fetchall()
        if not rows:
            logger.warning(f"No player game logs found for period {label}")
            continue

        # Organise by team
        from collections import defaultdict
        team_data = defaultdict(list)
        for row in rows:
            team = row['team']
            if team:  # Only include rows with team data
                team_data[team].append(row)

        for team, logs in team_data.items():
            total_runs = sum([r['r'] or 0 for r in logs])
            total_games = len(set((r['game_date'], r['team']) for r in logs))

            home_games = [r for r in logs if r['is_home']]
            away_games = [r for r in logs if not r['is_home']]
            home_runs = sum([r['r'] or 0 for r in home_games])
            away_runs = sum([r['r'] or 0 for r in away_games])

            vs_lhp = [r for r in logs if r.get('opponent_hand') == 'L']
            vs_rhp = [r for r in logs if r.get('opponent_hand') == 'R']
            runs_vs_lhp = sum([r['r'] or 0 for r in vs_lhp])
            runs_vs_rhp = sum([r['r'] or 0 for r in vs_rhp])

            # Estimate LHB/RHB ratio
            lhb_pa = sum([1 for r in logs if r.get('bats') == 'L'])
            rhb_pa = sum([1 for r in logs if r.get('bats') == 'R'])
            total_batters = lhb_pa + rhb_pa
            lhb_ratio = lhb_pa / total_batters if total_batters else 0
            rhb_ratio = rhb_pa / total_batters if total_batters else 0

            # Handle period_days - convert label to integer
            if label == 'season':
                period_days = 365  # Use 365 for season
            else:
                period_days = int(label.replace('d', ''))
            
            insert_cursor.execute("""
                INSERT INTO team_stats (
                    team_abbr, period_days, games, runs_scored, runs_allowed,
                    avg, obp, slg, ops
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                ON DUPLICATE KEY UPDATE
                    games=VALUES(games), runs_scored=VALUES(runs_scored),
                    runs_allowed=VALUES(runs_allowed), avg=VALUES(avg),
                    obp=VALUES(obp), slg=VALUES(slg), ops=VALUES(ops)
            """, (
                team, period_days, total_games, total_runs,
                0,  # runs_allowed - would need to calculate from opponent data
                0.0,  # avg - would need to calculate from batting data
                0.0,  # obp - would need to calculate from batting data
                0.0,  # slg - would need to calculate from batting data
                0.0   # ops - would need to calculate from batting data
            ))

    conn.commit()
    logger.info("Team stats sync complete.")

if __name__ == "__main__":
    main()
