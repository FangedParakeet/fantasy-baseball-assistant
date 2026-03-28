from datetime import datetime
from models.score_calculator import ScoreCalculator
from utils.logger import logger

class QSScoreCalculator(ScoreCalculator):
    def __init__(self, conn):
        super().__init__(conn)

    def update_probables_qs_scores(self, season_year=None):
        start_date, end_date = self.get_window_dates()
        self.update_qs_likelihood_scores(start_date, end_date, season_year)

    def update_qs_likelihood_scores(self, start_date, end_date, season_year=None):
        if season_year is None:
            season_year = datetime.now().year
        logger.info(f"Updating QS likelihood scores for probable pitchers from {start_date} to {end_date} (season {season_year})")

        # Build the INSERT query using subquery instead of WITH clause.
        # ON DUPLICATE KEY UPDATE guards against fan-out from joined percentile
        # tables that may have multiple rows per player/team (e.g. multiple
        # season_year values), which would otherwise produce duplicate pp_id rows.
        insert_query = f"""
            INSERT INTO tmp_qs_scores (pp_id, qs_score)
            SELECT
                s.pp_id,
                ROUND( 
                (
                    s.comp_qs_rate         * 0.40 +
                    s.comp_ip_per_start    * 0.15 +
                    s.comp_fip_minus_inv   * 0.10 +
                    s.comp_bb_pct_inv      * 0.05 +
                    s.comp_k_pct           * 0.05 +
                    s.comp_hr9_inv         * 0.05 +
                    s.comp_opp_runs_inv    * 0.10 +
                    s.comp_opp_ops_inv     * 0.07 +
                    s.comp_opp_so          * 0.03
                )
                , 1) AS qs_likelihood_score
            FROM (
                SELECT
                    a.pp_id,

                    /* --- Components (0–100) with float math + small-sample guard --- */

                    -- QS rate over last N days; soften <3 starts
                    CASE
                        WHEN a.qs_games >= 3 THEN LEAST( (a.qs * 100.0) / NULLIF(a.qs_games,0), 100 )
                        WHEN a.qs_games > 0  THEN LEAST( (a.qs * 100.0) / NULLIF(a.qs_games,0), 100 ) * 0.80
                        ELSE 0
                    END AS comp_qs_rate,

                    -- IP per start; cap at 7.0; soften <3 starts
                    CASE
                        WHEN a.roll_g >= 3 THEN LEAST( (a.roll_ip / NULLIF(a.roll_g,0)), 7.0 ) / 6.0 * 100
                        WHEN a.roll_g > 0  THEN (LEAST( (a.roll_ip / NULLIF(a.roll_g,0)), 7.0 ) / 6.0 * 100) * 0.90
                        ELSE 0
                    END AS comp_ip_per_start,

                    CASE WHEN a.fip_minus_pct IS NOT NULL THEN (100 - a.fip_minus_pct) ELSE 0 END AS comp_fip_minus_inv,
                    CASE WHEN a.bb_pct_pct    IS NOT NULL THEN (100 - a.bb_pct_pct)    ELSE 0 END AS comp_bb_pct_inv,
                    COALESCE(a.k_pct_pct, 0)                                                AS comp_k_pct,
                    CASE WHEN a.hr_per_9_pct  IS NOT NULL THEN (100 - a.hr_per_9_pct)  ELSE 0 END AS comp_hr9_inv,

                    -- Opponent recent scoring (lower better) using home/away split
                    CASE WHEN a.opp_runs_split_pct IS NOT NULL THEN (100 - a.opp_runs_split_pct) ELSE 0 END AS comp_opp_runs_inv,

                    -- Opponent OPS vs our hand (lower better)
                    CASE WHEN a.opp_ops_vs_hand_pct IS NOT NULL THEN (100 - a.opp_ops_vs_hand_pct) ELSE 0 END AS comp_opp_ops_inv,

                    -- Opponent SO% vs our hand (higher better)
                    COALESCE(a.opp_so_vs_hand_pct, 0) AS comp_opp_so

                FROM (
                    SELECT
                        u.pp_id,
                        u.player_id,
                        u.pitcher_team,
                        u.opp_team,
                        u.home,  -- 1 if our pitcher_team is home

                        ph.throws,

                        pr.ip                    AS roll_ip,
                        pr.games                 AS roll_g,

                        pq.qs,
                        pq.qs_games,

                        ps.k_pct_pct,
                        ps.bb_pct_pct,
                        ps.hr_per_9_pct,

                        prp.fip_minus_pct,

                        -- choose opponent runs split by game venue
                        CASE WHEN u.home = 1 THEN t_opp_away.avg_runs_scored_pct ELSE t_opp_home.avg_runs_scored_pct END AS opp_runs_split_pct,

                        ovh.ops_pct             AS opp_ops_vs_hand_pct,
                        ovh.so_rate_pct         AS opp_so_vs_hand_pct

                    FROM (
                        SELECT
                            pp.id               AS pp_id,
                            pp.game_date,
                            pp.team             AS pitcher_team,
                            pp.opponent         AS opp_team,
                            pp.player_id,
                            pp.home
                        FROM {self.probable_pitchers_table} pp
                        WHERE pp.game_date BETWEEN %s AND %s
                            AND pp.player_id IS NOT NULL
                    ) u

                    LEFT JOIN (
                        SELECT pl.player_id, pl.throws FROM {self.player_lookup_table} pl WHERE pl.position = 'P'
                    ) ph  ON ph.player_id = u.player_id

                    LEFT JOIN (
                        SELECT pars.player_id, pars.ip, pars.games
                        FROM {self.player_advanced_rolling_stats_table} pars
                        WHERE pars.span_days = %s AND pars.split_type = 'overall' AND pars.position = 'P'
                            AND pars.season_year = %s
                    ) pr  ON pr.player_id = u.player_id

                    LEFT JOIN (
                        SELECT prs.player_id, prs.qs, prs.games AS qs_games
                        FROM {self.player_rolling_stats_table} prs
                        WHERE prs.span_days = %s AND prs.split_type = 'overall' AND prs.position = 'P'
                            AND prs.season_year = %s
                    ) pq  ON pq.player_id = u.player_id

                    LEFT JOIN (
                        SELECT ps.player_id, ps.k_pct_pct, ps.bb_pct_pct, ps.hr_per_9_pct
                        FROM {self.player_season_stats_percentiles_table} ps
                        WHERE ps.position = 'P' AND ps.season_year = %s
                    ) ps ON ps.player_id = u.player_id

                    LEFT JOIN (
                        SELECT pars_pct.player_id, pars_pct.fip_minus_pct
                        FROM {self.player_advanced_rolling_stats_percentiles_table} pars_pct
                        WHERE pars_pct.span_days = %s AND pars_pct.split_type = 'overall' AND pars_pct.position = 'P'
                            AND pars_pct.season_year = %s
                    ) prp ON prp.player_id = u.player_id

                    -- Opponent recent runs by home/away split (team_rolling_stats_percentiles)
                    LEFT JOIN (
                        SELECT team, avg_runs_scored_pct
                        FROM {self.team_rolling_stats_percentiles_table}
                        WHERE span_days = %s AND split_type = 'home' AND season_year = %s
                    ) t_opp_home ON t_opp_home.team = u.opp_team

                    LEFT JOIN (
                        SELECT team, avg_runs_scored_pct
                        FROM {self.team_rolling_stats_percentiles_table}
                        WHERE span_days = %s AND split_type = 'away' AND season_year = %s
                    ) t_opp_away ON t_opp_away.team = u.opp_team

                    -- Opponent vs our pitcher handedness (team_vs_pitcher_splits_percentiles)
                    LEFT JOIN (
                        SELECT tvpp.team, tvpp.throws, tvpp.ops_pct, tvpp.so_rate_pct
                        FROM {self.team_vs_pitcher_splits_percentiles_table} tvpp
                        WHERE tvpp.span_days = %s AND tvpp.season_year = %s
                    ) ovh ON ovh.team = u.opp_team AND ovh.throws = ph.throws
                ) a
            ) s
            ON DUPLICATE KEY UPDATE qs_score = VALUES(qs_score);
        """
        
        
        params = [
            start_date, end_date,
            self.PITCHER_SPAN_DAYS, season_year,  # player_advanced_rolling_stats (pr)
            self.PITCHER_SPAN_DAYS, season_year,  # player_rolling_stats (pq)
            season_year,                           # player_season_stats_percentiles (ps)
            self.PITCHER_SPAN_DAYS, season_year,  # player_advanced_rolling_stats_percentiles (prp)
            self.TEAM_SPAN_DAYS, season_year,     # team_rolling_stats_percentiles home (t_opp_home)
            self.TEAM_SPAN_DAYS, season_year,     # team_rolling_stats_percentiles away (t_opp_away)
            self.TEAM_SPAN_DAYS, season_year,     # team_vs_pitcher_splits_percentiles (ovh)
        ]
        
        update_query = f"""
            UPDATE {self.probable_pitchers_table} pp
            JOIN tmp_qs_scores t ON t.pp_id = pp.id
            SET pp.qs_likelihood_score = LEAST(GREATEST(t.qs_score, 0), 100);
        """
        
        # Execute the complex query within a transaction
        self.begin_transaction()
        try:
            # Drop any existing temporary table first
            self.execute_query_in_transaction("DROP TEMPORARY TABLE IF EXISTS tmp_qs_scores")

            # Create temporary table
            self.execute_query_in_transaction("""
                CREATE TEMPORARY TABLE tmp_qs_scores (
                    pp_id INT PRIMARY KEY,
                    qs_score DECIMAL(5,1)
                ) ENGINE=MEMORY
            """)

            # INSERT with ON DUPLICATE KEY UPDATE to handle any fan-out from JOINs
            # producing multiple rows for the same pp_id (e.g. percentile tables
            # storing data across multiple season_years or span_day buckets).
            self.execute_query_in_transaction(insert_query, params)

            # Execute the UPDATE query (no parameters needed)
            self.execute_query_in_transaction(update_query)

            self.execute_query_in_transaction("DROP TEMPORARY TABLE IF EXISTS tmp_qs_scores")
            self.commit_transaction()
            logger.info("QS likelihood scores updated successfully")
        except Exception as e:
            logger.exception(f"Error updating QS likelihood scores: {e}")
            self.rollback_transaction()
            # Best-effort cleanup: temp tables are session-scoped so survive a rollback
            try:
                self.execute_query("DROP TEMPORARY TABLE IF EXISTS tmp_qs_scores")
            except Exception:
                pass
            raise e
