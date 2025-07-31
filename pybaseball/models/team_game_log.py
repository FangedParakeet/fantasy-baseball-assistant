from models.game_log import GameLog
from models.logger import logger
from utils.constants import SPLITS, ROLLING_WINDOWS, FIP_CONSTANT

class TeamGameLog(GameLog):
    GAME_LOGS_TABLE = "team_game_logs"
    PLAYER_GAME_LOGS_TABLE = "player_game_logs"
    GAME_PITCHERS_TABLE = "game_pitchers"
    PLAYER_LOOKUP_TABLE = "player_lookup"
    ROLLING_STATS_TABLE = "team_rolling_stats"
    TEAM_VS_BATTER_SPLITS_TABLE = "team_vs_batter_splits"
    TEAM_VS_PITCHER_SPLITS_TABLE = "team_vs_pitcher_splits"

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

    def update_advanced_statistics(self):
        """Update advanced statistics for team game logs"""
        logger.info("Updating advanced statistics for team game logs")
        batting_update_query = f"""
            UPDATE {self.GAME_LOGS_TABLE} AS tgl
            JOIN (
                SELECT
                    team,
                    game_id,
                    SUM(doubles) AS doubles,
                    SUM(triples) AS triples,
                    SUM(sac_flies) AS sac_flies,
                    SUM(hit_by_pitch) AS hbp,
                    SUM(ground_into_dp) AS ground_into_dp,
                    SUM(k) AS strikeouts,
                    SUM(bb) AS walks
                FROM player_game_logs
                WHERE position = 'B'
                GROUP BY team, game_id
            ) AS agg
            ON tgl.team = agg.team AND tgl.game_id = agg.game_id
            SET
                tgl.doubles = agg.doubles,
                tgl.triples = agg.triples,
                tgl.sac_flies = agg.sac_flies,
                tgl.hit_by_pitch = agg.hbp,
                tgl.ground_into_dp = agg.ground_into_dp,
                tgl.strikeouts = agg.strikeouts,
                tgl.walks = agg.walks;
        """
        self.execute_query(batting_update_query)
        pitching_update_query = f"""
            UPDATE {self.GAME_LOGS_TABLE} AS tgl
            JOIN (
                SELECT
                    team,
                    game_id,
                    SUM(ip) AS ip,
                    SUM(er) AS er,
                    SUM(walks_allowed) AS walks,
                    SUM(strikeouts) AS strikeouts,
                    SUM(hits_allowed) AS hits_allowed,
                    ROUND(SUM(walks_allowed + hits_allowed) / NULLIF(SUM(ip), 0), 2) AS whip,
                    SUM(batters_faced) AS batters_faced,
                    SUM(wild_pitches) AS wild_pitches,
                    SUM(balks) AS balks,
                    SUM(home_runs_allowed) AS home_runs_allowed,
                    SUM(inherited_runners) AS inherited_runners,
                    SUM(inherited_runners_scored) AS inherited_runners_scored
                FROM player_game_logs
                WHERE position != 'B'
                GROUP BY team, game_id
            ) AS agg
            ON tgl.team = agg.team AND tgl.game_id = agg.game_id
            SET
                tgl.ip = agg.ip,
                tgl.er = agg.er,
                tgl.walks = agg.walks,
                tgl.strikeouts = agg.strikeouts,
                tgl.hits_allowed = agg.hits_allowed,
                tgl.whip = agg.whip,
                tgl.batters_faced = agg.batters_faced,
                tgl.wild_pitches = agg.wild_pitches,
                tgl.balks = agg.balks,
                tgl.home_runs_allowed = agg.home_runs_allowed,
                tgl.inherited_runners = agg.inherited_runners,
                tgl.inherited_runners_scored = agg.inherited_runners_scored;
        """
        self.execute_query(pitching_update_query)

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
        self.compute_team_vs_pitcher_splits()

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
                        er, whip, strikeouts, walks, ip, hits_allowed,
                        singles, doubles, triples, total_bases, sac_flies, hit_by_pitch,
                        ground_outs, air_outs, left_on_base, ground_into_dp,
                        batters_faced, wild_pitches, balks, home_runs_allowed,
                        inherited_runners, inherited_runners_scored,
                        babip, lob_pct, fip
                        )
                    SELECT
                        gl.team,
                        %s AS split_type,
                        %s AS span_days,
                        COUNT(*) AS games_played,

                        SUM(gl.runs_scored),
                        SUM(gl.runs_allowed),
                        SUM(gl.runs_scored) - SUM(gl.runs_allowed) AS run_diff,

                        ROUND(SUM(gl.runs_scored) / COUNT(*), 2),
                        ROUND(SUM(gl.runs_allowed) / COUNT(*), 2),

                        ROUND(AVG(gl.avg), 3),
                        ROUND(AVG(gl.obp), 3),
                        ROUND(AVG(gl.slg), 3),
                        ROUND(AVG(gl.ops), 3),

                        SUM(gl.er),
                        ROUND(SUM(gl.walks + gl.hits_allowed) / NULLIF(SUM(gl.ip), 0), 2),
                        SUM(gl.strikeouts),
                        SUM(gl.walks),
                        ROUND(SUM(gl.ip), 2),
                        SUM(gl.hits_allowed),

                        SUM(gl.singles),
                        SUM(gl.doubles),
                        SUM(gl.triples),
                        SUM(gl.total_bases),
                        SUM(gl.sac_flies),
                        SUM(gl.hit_by_pitch),
                        SUM(gl.ground_outs),
                        SUM(gl.air_outs),
                        SUM(gl.left_on_base),
                        SUM(gl.ground_into_dp),
                        SUM(gl.batters_faced),
                        SUM(gl.wild_pitches),
                        SUM(gl.balks),
                        SUM(gl.home_runs_allowed),
                        SUM(gl.inherited_runners),
                        SUM(gl.inherited_runners_scored),

                        ROUND(
                            (
                            SUM(gl.hits_allowed) - SUM(gl.home_runs_allowed)
                            ) / NULLIF(
                            SUM(gl.batters_faced - gl.strikeouts - gl.home_runs_allowed + gl.sac_flies), 0
                            ), 3
                        ) AS babip,

                        ROUND(
                            (
                            SUM(gl.hits_allowed + gl.walks + gl.hit_by_pitch - gl.runs_allowed)
                            ) / NULLIF(
                            SUM(gl.hits_allowed + gl.walks + gl.hit_by_pitch - (1.4 * gl.home_runs_allowed)), 0
                            ), 2
                        ) AS lob_pct,

                        ROUND(
                            (
                            (13 * SUM(gl.home_runs_allowed)) +
                            (3 * SUM(gl.walks)) -
                            (2 * SUM(gl.strikeouts))
                            ) / NULLIF(SUM(gl.ip), 0) + {FIP_CONSTANT}, 2
                        ) AS fip

                    FROM {self.GAME_LOGS_TABLE} AS gl
                    LEFT JOIN {self.GAME_PITCHERS_TABLE} AS gp ON gl.game_id = gp.game_id
                    LEFT JOIN {self.PLAYER_LOOKUP_TABLE} AS opp_pl ON (
                        (gl.is_home = 1 AND gp.away_pitcher_id IS NOT NULL AND opp_pl.player_id = gp.away_pitcher_id)
                        OR
                        (gl.is_home = 0 AND gp.home_pitcher_id IS NOT NULL AND opp_pl.player_id = gp.home_pitcher_id)
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
                INSERT INTO {self.TEAM_VS_BATTER_SPLITS_TABLE} (
                    team, bats, span_days, start_date, end_date, games_played,
                    ab, hits, doubles, triples, hr, rbi, runs, sb, bb, k,
                    sac_flies, hbp, ground_into_dp,
                    avg, obp, slg, ops
                    )
                SELECT
                    pgl.opponent AS team,
                    pl.bats,
                    %s AS span_days,
                    DATE_SUB(CURDATE(), INTERVAL %s DAY) AS start_date,
                    CURDATE() AS end_date,
                    COUNT(*) AS games_played,

                    SUM(COALESCE(pgl.ab, 0)) AS ab,
                    SUM(COALESCE(pgl.h, 0)) AS hits,
                    SUM(COALESCE(pgl.doubles, 0)) AS doubles,
                    SUM(COALESCE(pgl.triples, 0)) AS triples,
                    SUM(COALESCE(pgl.hr, 0)) AS hr,
                    SUM(COALESCE(pgl.rbi, 0)) AS rbi,
                    SUM(COALESCE(pgl.r, 0)) AS runs,
                    SUM(COALESCE(pgl.sb, 0)) AS sb,
                    SUM(COALESCE(pgl.bb, 0)) AS bb,
                    SUM(COALESCE(pgl.k, 0)) AS k,

                    SUM(COALESCE(pgl.sac_flies, 0)) AS sac_flies,
                    SUM(COALESCE(pgl.hit_by_pitch, 0)) AS hbp,
                    SUM(COALESCE(pgl.ground_into_dp, 0)) AS ground_into_dp,

                    ROUND(SUM(COALESCE(pgl.h, 0)) / NULLIF(SUM(COALESCE(pgl.ab, 0)), 0), 3) AS avg,
                    ROUND((SUM(pgl.h) + SUM(pgl.bb) + SUM(pgl.hit_by_pitch)) / NULLIF(SUM(pgl.ab) + SUM(pgl.bb) + SUM(pgl.hit_by_pitch) + SUM(pgl.sac_flies), 0), 3) AS obp,
                    ROUND(SUM(pgl.total_bases) / NULLIF(SUM(pgl.ab), 0), 3) AS slg,
                    ROUND(
                        (SUM(pgl.h) + SUM(pgl.bb) + SUM(pgl.hit_by_pitch)) / NULLIF(SUM(pgl.ab) + SUM(pgl.bb) + SUM(pgl.hit_by_pitch) + SUM(pgl.sac_flies), 0) +
                        (SUM(pgl.total_bases) / NULLIF(SUM(pgl.ab), 0)), 3
                    ) AS ops

                FROM {self.PLAYER_GAME_LOGS_TABLE} AS pgl
                JOIN {self.PLAYER_LOOKUP_TABLE} AS pl ON pgl.player_id = pl.player_id

                WHERE pgl.game_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                    AND pgl.position = 'B'
                    AND pl.bats IN ('L', 'R')

                GROUP BY pgl.opponent, pl.bats;
            """

            params = (window, window, window)
            self.execute_query(insert_query, params)

    def compute_team_vs_pitcher_splits(self):
        # Clear all existing team vs pitcher splits before computing new ones
        logger.info("Clearing all existing team vs pitcher splits")
        delete_query = f"DELETE FROM {self.TEAM_VS_PITCHER_SPLITS_TABLE}"
        self.execute_query(delete_query)

        for window in ROLLING_WINDOWS:
            logger.info(f"Computing team vs pitcher splits for {window} days")

            insert_query = f"""
                INSERT INTO {self.TEAM_VS_PITCHER_SPLITS_TABLE} (
                    team, throws, span_days, start_date, end_date, games_played,
                    ab, hits, doubles, triples, hr, rbi, runs, sb, bb, k,
                    sac_flies, hbp, ground_into_dp,
                    avg, obp, slg, ops
                )
                SELECT
                    pgl.team,
                    opp_pl.throws,
                    %s AS span_days,
                    DATE_SUB(CURDATE(), INTERVAL %s DAY) AS start_date,
                    CURDATE() AS end_date,
                    COUNT(*) AS games_played,

                    SUM(COALESCE(pgl.ab, 0)) AS ab,
                    SUM(COALESCE(pgl.h, 0)) AS hits,
                    SUM(COALESCE(pgl.doubles, 0)) AS doubles,
                    SUM(COALESCE(pgl.triples, 0)) AS triples,
                    SUM(COALESCE(pgl.hr, 0)) AS hr,
                    SUM(COALESCE(pgl.rbi, 0)) AS rbi,
                    SUM(COALESCE(pgl.r, 0)) AS runs,
                    SUM(COALESCE(pgl.sb, 0)) AS sb,
                    SUM(COALESCE(pgl.bb, 0)) AS bb,
                    SUM(COALESCE(pgl.k, 0)) AS k,
                    SUM(COALESCE(pgl.sac_flies, 0)) AS sac_flies,
                    SUM(COALESCE(pgl.hit_by_pitch, 0)) AS hbp,
                    SUM(COALESCE(pgl.ground_into_dp, 0)) AS ground_into_dp,

                    ROUND(SUM(pgl.h) / NULLIF(SUM(pgl.ab), 0), 3) AS avg,
                    ROUND((SUM(pgl.h) + SUM(pgl.bb) + SUM(pgl.hit_by_pitch)) / NULLIF(SUM(pgl.ab) + SUM(pgl.bb) + SUM(pgl.hit_by_pitch) + SUM(pgl.sac_flies), 0), 3) AS obp,
                    ROUND(SUM(pgl.total_bases) / NULLIF(SUM(pgl.ab), 0), 3) AS slg,
                    ROUND(
                        (SUM(pgl.h) + SUM(pgl.bb) + SUM(pgl.hit_by_pitch)) / NULLIF(SUM(pgl.ab) + SUM(pgl.bb) + SUM(pgl.hit_by_pitch) + SUM(pgl.sac_flies), 0)
                        + (SUM(pgl.total_bases) / NULLIF(SUM(pgl.ab), 0)),
                        3
                    ) AS ops

                FROM {self.PLAYER_GAME_LOGS_TABLE} AS pgl
                LEFT JOIN {self.GAME_PITCHERS_TABLE} AS gp ON pgl.game_id = gp.game_id
                LEFT JOIN {self.PLAYER_LOOKUP_TABLE} AS opp_pl ON (
                    (pgl.is_home = 1 AND opp_pl.player_id = gp.away_pitcher_id)
                    OR
                    (pgl.is_home = 0 AND opp_pl.player_id = gp.home_pitcher_id)
                )
                WHERE pgl.game_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                    AND pgl.position = 'B'
                    AND opp_pl.throws IN ('L', 'R')
                GROUP BY pgl.team, opp_pl.throws;
            """
            params = (window, window, window)
            self.execute_query(insert_query, params)



