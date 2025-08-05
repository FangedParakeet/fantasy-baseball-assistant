from models.game_logs_db import GameLogsDB
from utils.logger import logger
from utils.constants import ROLLING_WINDOWS
from models.player_game_logs import PlayerGameLogs
from models.game_pitchers import GamePitchers
from models.player_lookup import PlayerLookup
from models.game_logs.logs_inserter import LogsInserter

class TeamGameLogs(GameLogsDB):
    GAME_LOGS_TABLE = "team_game_logs"
    ROLLING_STATS_TABLE = "team_rolling_stats"
    TEAM_VS_BATTER_SPLITS_TABLE = "team_vs_batter_splits"
    TEAM_VS_PITCHER_SPLITS_TABLE = "team_vs_pitcher_splits"

    def __init__(self, conn, team_rolling_stats=None):
        self.conn = conn
        self.team_rolling_stats = team_rolling_stats
        super().__init__(conn, self.GAME_LOGS_TABLE)

    def upsert_game_logs(self, team_game_logs: LogsInserter):
        """Upsert team game logs to database"""
        if team_game_logs.is_empty():
            logger.info("No team game logs to insert")
            return
        
        logger.info(f"Upserting {team_game_logs.get_row_count()} team game logs")        
        super().upsert_game_logs(team_game_logs)

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
                FROM {PlayerGameLogs.GAME_LOGS_TABLE}
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
                    ROUND((SUM(er) * 9) / NULLIF(SUM(ip), 0), 2) AS era,
                    SUM(batters_faced) AS batters_faced,
                    SUM(wild_pitches) AS wild_pitches,
                    SUM(balks) AS balks,
                    SUM(home_runs_allowed) AS home_runs_allowed,
                    SUM(inherited_runners) AS inherited_runners,
                    SUM(inherited_runners_scored) AS inherited_runners_scored
                FROM {PlayerGameLogs.GAME_LOGS_TABLE}
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
                tgl.era = agg.era,
                tgl.batters_faced = agg.batters_faced,
                tgl.wild_pitches = agg.wild_pitches,
                tgl.balks = agg.balks,
                tgl.home_runs_allowed = agg.home_runs_allowed,
                tgl.inherited_runners = agg.inherited_runners,
                tgl.inherited_runners_scored = agg.inherited_runners_scored;
        """
        self.execute_query(pitching_update_query)

    def compute_rolling_stats(self):
        self.team_rolling_stats.compute_rolling_stats()
        self.compute_team_vs_batter_splits()
        self.compute_team_vs_pitcher_splits()
        self.team_rolling_stats.compute_team_vs_splits_percentiles()

    def compute_team_vs_batter_splits(self):
        # Clear all existing team vs batter splits before computing new ones
        logger.info("Clearing all existing team vs batter splits")
        self.purge_all_records(self.TEAM_VS_BATTER_SPLITS_TABLE)

        for window in ROLLING_WINDOWS:
            logger.info(f"Computing team vs batter splits for {window} days")
        
            insert_query = f"""
                INSERT INTO {self.TEAM_VS_BATTER_SPLITS_TABLE} (
                    team, bats, span_days, start_date, end_date, games_played,
                    ab, hits, doubles, triples, hr, rbi, runs, sb, bb, k,
                    sac_flies, hbp, ground_into_dp,
                    avg, obp, slg, ops, so_rate, bb_rate
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
                    ) AS ops,
                    ROUND(SUM(pgl.k) / NULLIF(SUM(pgl.ab + pgl.bb + pgl.hit_by_pitch + pgl.sac_flies), 0), 3) AS so_rate,
                    ROUND(SUM(pgl.bb) / NULLIF(SUM(pgl.ab + pgl.bb + pgl.hit_by_pitch + pgl.sac_flies), 0), 3) AS bb_rate

                FROM {PlayerGameLogs.GAME_LOGS_TABLE} AS pgl
                JOIN {PlayerLookup.LOOKUP_TABLE} AS pl ON pgl.player_id = pl.player_id

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
        self.purge_all_records(self.TEAM_VS_PITCHER_SPLITS_TABLE)

        for window in ROLLING_WINDOWS:
            logger.info(f"Computing team vs pitcher splits for {window} days")

            insert_query = f"""
                INSERT INTO {self.TEAM_VS_PITCHER_SPLITS_TABLE} (
                    team, throws, span_days, start_date, end_date, games_played,
                    ab, hits, doubles, triples, hr, rbi, runs, sb, bb, k,
                    sac_flies, hbp, ground_into_dp,
                    avg, obp, slg, ops, so_rate, bb_rate
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
                    ) AS ops,
                    ROUND(SUM(pgl.k) / NULLIF(SUM(pgl.ab + pgl.bb + pgl.hit_by_pitch + pgl.sac_flies), 0), 3) AS so_rate,
                    ROUND(SUM(pgl.bb) / NULLIF(SUM(pgl.ab + pgl.bb + pgl.hit_by_pitch + pgl.sac_flies), 0), 3) AS bb_rate

                FROM {PlayerGameLogs.GAME_LOGS_TABLE} AS pgl
                LEFT JOIN {GamePitchers.GAME_PITCHERS_TABLE} AS gp ON pgl.game_id = gp.game_id
                LEFT JOIN {PlayerLookup.LOOKUP_TABLE} AS opp_pl ON (
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



