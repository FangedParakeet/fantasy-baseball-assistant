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
            team = row['mlb_team']
            team_data[team].append(row)

        for team, logs in team_data.items():
            total_runs = sum([r['r'] or 0 for r in logs])
            total_games = len(set((r['game_date'], r['mlb_team']) for r in logs))

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

            insert_cursor.execute("""
                INSERT INTO team_stats (
                    mlb_team, stat_period, games, runs, home_runs, away_runs,
                    runs_vs_lhp, runs_vs_rhp, lhb_ratio, rhb_ratio
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                ON DUPLICATE KEY UPDATE
                    games=VALUES(games), runs=VALUES(runs),
                    home_runs=VALUES(home_runs), away_runs=VALUES(away_runs),
                    runs_vs_lhp=VALUES(runs_vs_lhp), runs_vs_rhp=VALUES(runs_vs_rhp),
                    lhb_ratio=VALUES(lhb_ratio), rhb_ratio=VALUES(rhb_ratio)
            """, (
                team, label, total_games, total_runs,
                home_runs, away_runs,
                runs_vs_lhp, runs_vs_rhp,
                lhb_ratio, rhb_ratio
            ))

    conn.commit()
    logger.info("Team stats sync complete.")

if __name__ == "__main__":
    main()
