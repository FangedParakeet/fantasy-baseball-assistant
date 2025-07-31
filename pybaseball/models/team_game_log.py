from models.game_log import GameLog
from models.logger import logger
from utils.constants import SPLITS, ROLLING_WINDOWS

class TeamGameLog(GameLog):
    GAME_LOGS_TABLE = "team_game_logs"
    PLAYER_GAME_LOGS_TABLE = "player_game_logs"
    GAME_PITCHERS_TABLE = "game_pitchers"
    PLAYER_LOOKUP_TABLE = "player_lookup"
    ROLLING_STATS_TABLE = "team_rolling_stats"
    TEAM_VS_BATTER_SPLITS_TABLE = "team_vs_batter_splits"

    def __init__(self, conn):
        self.conn = conn
        super().__init__(conn, self.GAME_LOGS_TABLE, self.ROLLING_STATS_TABLE)

    def upsert_game_logs(self, logs):
        """Upsert team game logs to database"""
        if logs.empty:
            logger.info("No team game logs to insert")
            return
        
        logger.info(f"Upserting {len(logs)} team game logs")
        
        insert_query = f"""
            INSERT INTO {self.GAME_LOGS_TABLE} (
                team, game_date, opponent, is_home, is_win, runs_scored, runs_allowed,
                avg, obp, slg, ops, er, whip, strikeouts, walks, ip, hits_allowed, game_id
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                opponent = VALUES(opponent),
                is_home = VALUES(is_home),
                is_win = VALUES(is_win),
                runs_scored = VALUES(runs_scored),
                runs_allowed = VALUES(runs_allowed),
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

    def build_where_clause_for_split(self, split):
        if split in ['overall', 'home', 'away']:
            return super().build_where_clause_for_split(split)
        elif split == 'vs_lhp':
            return """
            AND (
                (gl.is_home = 1 AND gp.away_pitcher_id IS NOT NULL AND opp_pl.throws = 'L')
                OR (gl.is_home = 0 AND gp.home_pitcher_id IS NOT NULL AND opp_pl.throws = 'L')
            )
            """
        elif split == 'vs_rhp':
            return """
            AND (
                (gl.is_home = 1 AND gp.away_pitcher_id IS NOT NULL AND opp_pl.throws = 'R')
                OR (gl.is_home = 0 AND gp.home_pitcher_id IS NOT NULL AND opp_pl.throws = 'R')
            )
            """
        return ''

    def compute_rolling_stats(self):
        self.compute_team_rolling_stats()
        self.compute_team_vs_batter_splits()

    def compute_team_rolling_stats(self):
        # Clear all existing rolling stats before computing new ones
        logger.info("Clearing all existing team rolling stats")
        delete_query = f"DELETE FROM {self.ROLLING_STATS_TABLE}"
        self.execute_query(delete_query)
        
        for split in SPLITS:
            for window in ROLLING_WINDOWS:
                logger.info(f"Computing team {split} rolling stats for {window} days")

                where_clause = self.build_where_clause_for_split(split)

                insert_query = f"""
                    INSERT INTO {self.ROLLING_STATS_TABLE} (
                        team, split_type, span_days, games_played,
                        runs_scored, runs_allowed, run_diff,
                        avg_runs_scored, avg_runs_allowed,
                        avg, obp, slg, ops,
                        er, whip, strikeouts, walks, ip, hits_allowed
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
                        ROUND(SUM(COALESCE(gl.whip, 0)) / NULLIF(COUNT(*), 0), 3),
                        SUM(COALESCE(gl.strikeouts, 0)),
                        SUM(COALESCE(gl.walks, 0)),
                        ROUND(SUM(COALESCE(gl.ip, 0)), 2),
                        SUM(COALESCE(gl.hits_allowed, 0))
                    FROM {self.GAME_LOGS_TABLE} gl
                    LEFT JOIN {self.GAME_PITCHERS_TABLE} gp ON gl.game_id = gp.game_id
                    LEFT JOIN {self.PLAYER_LOOKUP_TABLE} opp_pl ON (
                        (gl.is_home = 1 AND opp_pl.player_id = gp.away_pitcher_id)
                        OR (gl.is_home = 0 AND opp_pl.player_id = gp.home_pitcher_id)
                    )
                    WHERE gl.game_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                    {where_clause}
                    GROUP BY gl.team;
                """

                params = (split, window, window)
                self.execute_query(insert_query, params)

    def compute_team_vs_batter_splits(self):
        # Clear all existing team vs batter splits before computing new ones
        logger.info("Clearing all existing team vs batter splits")
        delete_query = f"DELETE FROM {self.TEAM_VS_BATTER_SPLITS_TABLE}"
        self.execute_query(delete_query)

        for window in ROLLING_WINDOWS:
            logger.info(f"Computing team vs batter splits for {window} days")
        
            insert_query = f"""
                SELECT
                    pgl.opponent AS team,
                    pl.bats,
                    %s AS span_days,
                    DATE_SUB(CURDATE(), INTERVAL %s DAY) AS start_date,
                    CURDATE() AS end_date,
                    COUNT(*) AS games,
                    SUM(COALESCE(pgl.ab, 0)) AS ab,
                    SUM(COALESCE(pgl.h, 0)) AS hits,
                    SUM(COALESCE(pgl.hr, 0)) AS hr,
                    SUM(COALESCE(pgl.r, 0)) AS runs,
                    SUM(COALESCE(pgl.rbi, 0)) AS rbi,
                    SUM(COALESCE(pgl.sb, 0)) AS sb,
                    ROUND(SUM(COALESCE(pgl.h, 0)) / NULLIF(SUM(COALESCE(pgl.ab, 0)), 0), 3) AS avg,
                    ROUND((SUM(pgl.h) + SUM(pgl.bb)) / NULLIF(SUM(pgl.ab) + SUM(pgl.bb), 0), 3) AS obp
                FROM {self.PLAYER_GAME_LOGS_TABLE} pgl
                JOIN {self.PLAYER_LOOKUP_TABLE} pl ON pgl.player_id = pl.player_id
                WHERE pgl.game_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                AND pl.bats IN ('L', 'R')
                GROUP BY pgl.opponent, pl.bats;
            """

            params = (window, window, window)
            self.execute_query(insert_query, params)

