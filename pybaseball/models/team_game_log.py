from models.game_log import GameLog
from models.logger import logger

class TeamGameLog(GameLog):
    def __init__(self, conn):
        self.conn = conn
        self.game_logs_table = "team_game_logs"
        self.rolling_stats_table = "team_rolling_stats"
        super().__init__(conn, self.game_logs_table, self.rolling_stats_table)

    def upsert_game_logs(self, logs):
        """Upsert team game logs to database"""
        if logs.empty:
            logger.info("No team game logs to insert")
            return
        
        logger.info(f"Upserting {len(logs)} team game logs")
        
        insert_query = f"""
            INSERT INTO {self.game_logs_table} (
                team, game_date, opponent, is_home, is_win, runs_scored, runs_allowed,
                pitcher_hand, avg, obp, slg, ops, er, whip, strikeouts, walks, ip, hits_allowed
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                opponent = VALUES(opponent),
                is_home = VALUES(is_home),
                is_win = VALUES(is_win),
                runs_scored = VALUES(runs_scored),
                runs_allowed = VALUES(runs_allowed),
                pitcher_hand = VALUES(pitcher_hand),
                avg = VALUES(avg),
                obp = VALUES(obp),
                slg = VALUES(slg),
                ops = VALUES(ops),
                er = VALUES(er),
                whip = VALUES(whip),
                strikeouts = VALUES(strikeouts),
                walks = VALUES(walks),
                ip = VALUES(ip),
                hits_allowed = VALUES(hits_allowed)
        """
        super().batch_upsert_game_logs(insert_query, logs)

    def compute_rolling_stats(self):
        compute_query = f"""
            INSERT INTO {self.rolling_stats_table} (
                team, split_type, span_days, games_played,
                runs_scored, runs_allowed, run_diff,
                avg_runs_scored, avg_runs_allowed,
                avg, obp, slg, ops, er, whip,
                strikeouts, walks, ip, hits_allowed
            )
            SELECT
                team,
                %s AS split_type,
                %s AS span_days,
                COUNT(*) AS games_played,
                SUM(runs_scored),
                SUM(runs_allowed),
                SUM(runs_scored) - SUM(runs_allowed) AS run_diff,
                ROUND(AVG(runs_scored), 2) AS avg_runs_scored,
                ROUND(AVG(runs_allowed), 2) AS avg_runs_allowed,
                ROUND(AVG(avg), 3),
                ROUND(AVG(obp), 3),
                ROUND(AVG(slg), 3),
                ROUND(AVG(ops), 3),
                SUM(er),
                ROUND(SUM(walks + hits_allowed) / NULLIF(SUM(ip), 0), 3) AS whip,
                SUM(strikeouts),
                SUM(walks),
                ROUND(SUM(ip), 1),
                SUM(hits_allowed)
            FROM {self.game_logs_table}
            WHERE game_date >= CURDATE() - INTERVAL %s DAY
            GROUP BY team;
        """
        super().compute_rolling_stats(compute_query)

