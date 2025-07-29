from models.game_log import GameLog
from models.logger import logger
from utils.constants import SPLITS, ROLLING_WINDOWS

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
                pitcher_hand, avg, obp, slg, ops, er, whip, strikeouts, walks, ip, hits_allowed, game_id
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                hits_allowed = VALUES(hits_allowed),
                game_id = VALUES(game_id)
        """
        self.batch_upsert(insert_query, logs)

    def compute_rolling_stats(self):
        # Clear all existing rolling stats before computing new ones
        logger.info("Clearing all existing team rolling stats")
        delete_query = f"DELETE FROM {self.rolling_stats_table}"
        self.execute_query(delete_query)
        
        for split in SPLITS:
            for window in ROLLING_WINDOWS:
                logger.info(f"Computing team {split} rolling stats for {window} days")

                where_clause = self.build_where_clause_for_split(split)

                insert_query = f"""
                    INSERT INTO {self.rolling_stats_table} (
                        team, split_type, span_days, games_played,
                        runs_scored, runs_allowed, run_diff,
                        avg_runs_scored, avg_runs_allowed,
                        avg, obp, slg, ops, er, whip, strikeouts, walks, ip, hits_allowed
                    )
                    SELECT
                        gl.team,
                        %s AS split_type,
                        %s AS span_days,
                        COUNT(*) AS games_played,
                        SUM(COALESCE(gl.runs_scored, 0)),
                        SUM(COALESCE(gl.runs_allowed, 0)),
                        SUM(COALESCE(gl.runs_scored, 0)) - SUM(COALESCE(gl.runs_allowed, 0)) AS run_diff,
                        ROUND(AVG(COALESCE(gl.runs_scored, 0)), 2),
                        ROUND(AVG(COALESCE(gl.runs_allowed, 0)), 2),
                        ROUND(AVG(COALESCE(gl.avg, 0)), 3),
                        ROUND(AVG(COALESCE(gl.obp, 0)), 3),
                        ROUND(AVG(COALESCE(gl.slg, 0)), 3),
                        ROUND(AVG(COALESCE(gl.ops, 0)), 3),
                        SUM(COALESCE(gl.er, 0)),
                        ROUND(SUM(COALESCE(gl.walks, 0) + gl.hits_allowed) / NULLIF(SUM(COALESCE(gl.ip, 0)), 0), 2),
                        SUM(COALESCE(gl.strikeouts, 0)),
                        SUM(COALESCE(gl.walks, 0)),
                        ROUND(SUM(COALESCE(gl.ip, 0)), 2),
                        SUM(COALESCE(gl.hits_allowed, 0))
                    FROM {self.game_logs_table} gl
                    LEFT JOIN game_pitchers gp ON gl.game_id = gp.game_id
                    WHERE gl.game_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                    {where_clause}
                    GROUP BY gl.team
                """

                self.execute_query(insert_query, (split, window, window))


