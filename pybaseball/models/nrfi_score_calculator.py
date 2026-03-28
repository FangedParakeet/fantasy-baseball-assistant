from datetime import datetime
from models.score_calculator import ScoreCalculator
from utils.logger import logger

class NRFIScoreCalculator(ScoreCalculator):
    def __init__(self, conn):
        super().__init__(conn)

    def update_probables_nrfi_scores(self, season_year=None):
        start_date, end_date = self.get_window_dates()
        self.update_nrfi_likelihood_scores(start_date, end_date, season_year)

    def update_nrfi_likelihood_scores(self, start_date, end_date, season_year=None):
        if season_year is None:
            season_year = datetime.now().year
        logger.info(f"Updating NRFI likelihood scores for probable pitchers from {start_date} to {end_date} (season {season_year})")

        insert_query = f"""
            INSERT INTO tmp_nrfi_scores (pp_id, nrfi_score)
            SELECT
                s.pp_id,
                ROUND(
                    CASE
                    -- Reweight if we don't know opponent SP (or their rolling NRFI rate)
                    WHEN s.comp_opp_p_nrfi_rate IS NULL
                        THEN (
                        s.comp_our_p_nrfi_rate           * 0.44 +     -- 0.35 / 0.80
                        s.comp_opp_off_nrfi_vs_hand      * 0.25 +     -- 0.20 / 0.80
                        s.comp_our_off_nrfi_vs_opp_hand  * 0.19 +     -- 0.15 / 0.80
                        s.comp_our_team_nrfi_split       * 0.06 +     -- 0.05 / 0.80
                        s.comp_opp_team_nrfi_split       * 0.06       -- 0.05 / 0.80
                        )
                    ELSE (
                        s.comp_our_p_nrfi_rate           * 0.35 +
                        s.comp_opp_p_nrfi_rate           * 0.20 +
                        s.comp_opp_off_nrfi_vs_hand      * 0.20 +
                        s.comp_our_off_nrfi_vs_opp_hand  * 0.15 +
                        s.comp_our_team_nrfi_split       * 0.05 +
                        s.comp_opp_team_nrfi_split       * 0.05
                    )
                    END
                , 1) AS nrfi_likelihood_score
            FROM (
                SELECT
                    a.pp_id,

                    /* ------------ Components (0–100) ------------ */

                    -- Our pitcher NRFI rate last N days (cap; float math)
                    CASE
                        WHEN a.our_g >= 3 THEN LEAST( (a.our_nrfi * 100.0) / NULLIF(a.our_g,0), 100 )
                        WHEN a.our_g > 0 THEN LEAST( (a.our_nrfi * 100.0) / NULLIF(a.our_g,0), 100 ) * 0.70
                        ELSE 0
                    END AS comp_our_p_nrfi_rate,

                    -- Opp pitcher NRFI rate (if known)
                    CASE
                        WHEN a.opp_g >= 3 THEN LEAST( (a.opp_nrfi * 100.0) / NULLIF(a.opp_g,0), 100 )
                        WHEN a.opp_g > 0 THEN LEAST( (a.opp_nrfi * 100.0) / NULLIF(a.opp_g,0), 100 ) * 0.70
                        ELSE NULL
                    END AS comp_opp_p_nrfi_rate,

                    -- Opp offense NRFI vs our hand (and the correct vs-split)
                    COALESCE(a.opp_off_nrfi_vs_our_hand_pct, 0) AS comp_opp_off_nrfi_vs_hand,

                    -- Our offense NRFI vs opponent hand (and the correct vs-split)
                    COALESCE(a.our_off_nrfi_vs_opp_hand_pct, 0) AS comp_our_off_nrfi_vs_opp_hand,

                    -- Team NRFI by home/away split (small weight)
                    COALESCE(a.our_team_nrfi_split, 0) AS comp_our_team_nrfi_split,
                    COALESCE(a.opp_team_nrfi_split, 0) AS comp_opp_team_nrfi_split

            FROM (
                SELECT
                    bp.pp_id,
                    bp.game_date,
                    bp.pitcher_team,
                    bp.opp_team,
                    bp.player_id,
                    bp.opp_pitcher_id,
                    bp.home,                  -- 1 if our pitcher_team is home

                    h1.throws AS our_hand,
                    h2.throws AS opp_hand,

                    -- our pitcher form
                    pr1.nrfi  AS our_nrfi,
                    pr1.games AS our_g,

                    -- opp pitcher form (optional)
                    pr2.nrfi  AS opp_nrfi,
                    pr2.games AS opp_g,

                    /* Team vs-hand NRFI percentiles:
                        - For opponent offense vs our hand, use split_type = ('vs_rhp' or 'vs_lhp') + throws = our_hand
                        - For our offense vs opponent hand, use split_type = ('vs_rhp' or 'vs_lhp') + throws = opp_hand
                    */
                    o1.nrfi_pct AS opp_off_nrfi_vs_our_hand_pct,
                    o2.nrfi_pct AS our_off_nrfi_vs_opp_hand_pct,

                    /* Team overall NRFI by home/away:
                        If our pitcher_team is HOME (home=1):
                            our split  = 'home'
                            opp split  = 'away'
                        Else:
                            our split  = 'away'
                            opp split  = 'home'
                    */
                    CASE WHEN bp.home = 1 THEN t1h.nrfi_pct ELSE t1a.nrfi_pct END AS our_team_nrfi_split,
                    CASE WHEN bp.home = 1 THEN t2a.nrfi_pct ELSE t2h.nrfi_pct END AS opp_team_nrfi_split

                FROM (
                /* Attach opponent SP (if game_id present) + compute split labels */
                    SELECT
                        u.*,
                        gp.home_team,
                        gp.away_team,
                        CASE
                        WHEN u.game_id IS NOT NULL AND u.pitcher_team = gp.home_team THEN gp.away_pitcher_id
                        WHEN u.game_id IS NOT NULL AND u.pitcher_team = gp.away_team THEN gp.home_pitcher_id
                        ELSE NULL
                        END AS opp_pitcher_id
                    FROM (
                        SELECT
                        pp.id       AS pp_id,
                        pp.game_id,
                        pp.game_date,
                        pp.team     AS pitcher_team,
                        pp.opponent AS opp_team,
                        pp.player_id,
                        pp.home
                        FROM {self.probable_pitchers_table} pp
                        WHERE pp.game_date BETWEEN %s AND %s
                        AND pp.player_id IS NOT NULL
                    ) u
                    LEFT JOIN {self.game_pitchers_table} gp
                        ON gp.game_id = u.game_id
                    ) bp

                    -- Hands
                    LEFT JOIN {self.player_lookup_table} h1 ON h1.player_id = bp.player_id AND h1.position = 'P'
                    LEFT JOIN {self.player_lookup_table} h2 ON h2.player_id = bp.opp_pitcher_id AND h2.position = 'P'

                    -- Pitcher rolling NRFI (our & opp), last :pitcher_span_days
                    LEFT JOIN (
                        SELECT prs.player_id, prs.nrfi, prs.games
                        FROM {self.player_rolling_stats_table} prs
                        WHERE prs.span_days = %s
                            AND prs.split_type = 'overall'
                            AND prs.position = 'P'
                            AND prs.season_year = %s
                    ) pr1 ON pr1.player_id = bp.player_id

                    LEFT JOIN (
                        SELECT prs.player_id, prs.nrfi, prs.games
                        FROM {self.player_rolling_stats_table} prs
                        WHERE prs.span_days = %s
                            AND prs.split_type = 'overall'
                            AND prs.position = 'P'
                            AND prs.season_year = %s
                    ) pr2 ON pr2.player_id = bp.opp_pitcher_id

                    /* Opponent offense NRFI vs our hand */
                    LEFT JOIN (
                        SELECT tvpp.team, tvpp.throws, tvpp.nrfi_pct
                        FROM {self.team_vs_pitcher_splits_percentiles_table} tvpp
                        WHERE tvpp.span_days = %s AND tvpp.season_year = %s
                    ) o1
                    ON o1.team = bp.opp_team
                    AND o1.throws = h1.throws

                    /* Our offense vs opponent hand */
                    LEFT JOIN (
                        SELECT tvpp.team, tvpp.throws, tvpp.nrfi_pct
                        FROM {self.team_vs_pitcher_splits_percentiles_table} tvpp
                        WHERE tvpp.span_days = %s AND tvpp.season_year = %s
                    ) o2
                    ON o2.team = bp.pitcher_team
                    AND o2.throws = h2.throws

                    /* Team NRFI by home/away split (small weight) */
                    LEFT JOIN (
                        SELECT trsp.team, trsp.nrfi_pct
                        FROM {self.team_rolling_stats_percentiles_table} trsp
                        WHERE trsp.span_days = %s
                            AND trsp.split_type = 'home'
                            AND trsp.season_year = %s
                    ) t1h ON t1h.team = bp.pitcher_team

                    LEFT JOIN (
                        SELECT trsp.team, trsp.nrfi_pct
                        FROM {self.team_rolling_stats_percentiles_table} trsp
                        WHERE trsp.span_days = %s
                            AND trsp.split_type = 'away'
                            AND trsp.season_year = %s
                    ) t1a ON t1a.team = bp.pitcher_team

                    LEFT JOIN (
                        SELECT trsp.team, trsp.nrfi_pct
                        FROM {self.team_rolling_stats_percentiles_table} trsp
                        WHERE trsp.span_days = %s
                            AND trsp.split_type = 'home'
                            AND trsp.season_year = %s
                    ) t2h ON t2h.team = bp.opp_team

                    LEFT JOIN (
                        SELECT trsp.team, trsp.nrfi_pct
                        FROM {self.team_rolling_stats_percentiles_table} trsp
                        WHERE trsp.span_days = %s
                            AND trsp.split_type = 'away'
                            AND trsp.season_year = %s
                    ) t2a ON t2a.team = bp.opp_team

                ) a
            ) s
            ON DUPLICATE KEY UPDATE nrfi_score = VALUES(nrfi_score);
        """

        params = [
            start_date, end_date,
            self.PITCHER_SPAN_DAYS, season_year,  # player_rolling_stats our pitcher (pr1)
            self.PITCHER_SPAN_DAYS, season_year,  # player_rolling_stats opp pitcher (pr2)
            self.TEAM_SPAN_DAYS, season_year,     # team_vs_pitcher_splits_percentiles opp offense (o1)
            self.TEAM_SPAN_DAYS, season_year,     # team_vs_pitcher_splits_percentiles our offense (o2)
            self.TEAM_SPAN_DAYS, season_year,     # team_rolling_stats_percentiles our team home (t1h)
            self.TEAM_SPAN_DAYS, season_year,     # team_rolling_stats_percentiles our team away (t1a)
            self.TEAM_SPAN_DAYS, season_year,     # team_rolling_stats_percentiles opp team home (t2h)
            self.TEAM_SPAN_DAYS, season_year,     # team_rolling_stats_percentiles opp team away (t2a)
        ]

        update_query = f"""
            UPDATE {self.probable_pitchers_table} pp
            JOIN tmp_nrfi_scores t ON t.pp_id = pp.id
            SET pp.nrfi_likelihood_score = LEAST(GREATEST(t.nrfi_score, 0), 100);
        """

        self.begin_transaction()
        try:
            self.execute_query_in_transaction("DROP TEMPORARY TABLE IF EXISTS tmp_nrfi_scores")

            self.execute_query_in_transaction("""
                CREATE TEMPORARY TABLE tmp_nrfi_scores (
                    pp_id INT PRIMARY KEY,
                    nrfi_score DECIMAL(5,1)
                ) ENGINE=MEMORY
            """)

            self.execute_query_in_transaction(insert_query, params)

            self.execute_query_in_transaction(update_query)

            self.execute_query_in_transaction("DROP TEMPORARY TABLE IF EXISTS tmp_nrfi_scores")
            self.commit_transaction()
            logger.info("Updated NRFI likelihood scores for probable pitchers successfully")
        except Exception as e:
            logger.exception(f"Error updating NRFI likelihood scores: {e}")
            self.rollback_transaction()
            try:
                self.execute_query("DROP TEMPORARY TABLE IF EXISTS tmp_nrfi_scores")
            except Exception:
                pass
            raise e