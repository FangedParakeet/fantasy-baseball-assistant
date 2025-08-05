from models.rolling_stats.player_rolling_stats import PlayerRollingStats
from models.player_game_logs import PlayerGameLogs
from utils.constants import FIP_CONSTANT, WOBASCALE
from utils.logger import logger

class PlayerAdvancedRollingStats(PlayerRollingStats):
    LEAGUE_AVERAGE_KEYS = ['obp', 'slg', 'ops', 'woba', 'fip']
    LEAGUE_AVERAGE_TABLE = 'league_advanced_rolling_stats'
    STATS_KEYS = {
        'batting': ['obp', 'slg', 'ops', 'bb_rate', 'k_rate', 'babip', 'iso', 'contact_pct', 'gb_fb_ratio', 'lob_batting_pct', 'woba'],
        'pitching': ['inherited_runners', 'inherited_runners_scored', 'irs_pct', 'fip', 'k_per_9', 'bb_per_9', 'hr_per_9', 'k_bb_ratio', 'lob_pitching_pct']
    }
    ADVANCED_STATS_KEYS = {
        'batting': ['woba_plus', 'obp_plus', 'slg_plus', 'ops_plus', 'wraa'],
        'pitching': ['fip_minus', 'era_minus']
    }

    def __init__(self, conn, rolling_stats_percentiles):
        super().__init__(conn, rolling_stats_percentiles)
        self.rolling_stats_table = PlayerGameLogs.ADVANCED_ROLLING_STATS_TABLE
        self.basic_rolling_stats_table = PlayerGameLogs.BASIC_ROLLING_STATS_TABLE
        self.game_logs_table = PlayerGameLogs.GAME_LOGS_TABLE

    def get_formulas(self):
        return super().get_formulas() | {
            'obp': """-- OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
                        ROUND(
                            (SUM(COALESCE(gl.h, 0)) + SUM(COALESCE(gl.bb, 0)) + SUM(COALESCE(gl.hit_by_pitch, 0))) /
                            NULLIF(
                                SUM(COALESCE(gl.ab, 0)) + SUM(COALESCE(gl.bb, 0)) + SUM(COALESCE(gl.hit_by_pitch, 0)) + SUM(COALESCE(gl.sac_flies, 0)),
                                0
                            ), 3
                        ) AS obp""",
            'slg': """-- SLG = total_bases / ab
                        ROUND(SUM(COALESCE(gl.total_bases, 0)) / NULLIF(SUM(COALESCE(gl.ab, 0)), 0), 3) AS slg  """,
            'ops': """-- OPS = OBP + SLG
                        ROUND(
                            (SUM(COALESCE(gl.h, 0)) + SUM(COALESCE(gl.bb, 0)) + SUM(COALESCE(gl.hit_by_pitch, 0))) /
                            NULLIF(
                                SUM(COALESCE(gl.ab, 0)) + SUM(COALESCE(gl.bb, 0)) + SUM(COALESCE(gl.hit_by_pitch, 0)) + SUM(COALESCE(gl.sac_flies, 0)),
                                0
                            ) +
                            SUM(COALESCE(gl.total_bases, 0)) / NULLIF(SUM(COALESCE(gl.ab, 0)), 0),
                            3
                        ) AS ops""",
            'bb_rate': """-- BB% = BB / PA
                        ROUND(
                            SUM(COALESCE(gl.bb, 0)) /
                            NULLIF(SUM(COALESCE(gl.ab, 0)) + SUM(COALESCE(gl.bb, 0)) + SUM(COALESCE(gl.sac_flies, 0)) + SUM(COALESCE(gl.hit_by_pitch, 0)), 0),
                            3
                        ) AS bb_rate""",
            'k_rate': """-- K% = K / PA
                        ROUND(
                            SUM(COALESCE(gl.k, 0)) /
                            NULLIF(SUM(COALESCE(gl.ab, 0)) + SUM(COALESCE(gl.bb, 0)) + SUM(COALESCE(gl.sac_flies, 0)) + SUM(COALESCE(gl.hit_by_pitch, 0)), 0),
                            3
                        ) AS k_rate""",
            'babip': """-- BABIP = (H - HR) / (AB - K - HR + SF)
                        ROUND(
                            (SUM(COALESCE(gl.h, 0)) - SUM(COALESCE(gl.hr, 0))) /
                            NULLIF(
                                SUM(COALESCE(gl.ab, 0)) - SUM(COALESCE(gl.k, 0)) - SUM(COALESCE(gl.hr, 0)) + SUM(COALESCE(gl.sac_flies, 0)),
                                0
                            ),
                            3
                        ) AS babip""",
            'iso': """-- ISO = SLG - AVG
                        ROUND(
                            (SUM(COALESCE(gl.total_bases, 0)) / NULLIF(SUM(COALESCE(gl.ab, 0)), 0)) -
                            (SUM(COALESCE(gl.h, 0)) / NULLIF(SUM(COALESCE(gl.ab, 0)), 0)),
                            3
                        ) AS iso""",
            'contact_pct': """-- Contact% = (AB - K) / AB (capped at 100.00 to fit DECIMAL(5,2))
                        LEAST(
                            ROUND(
                                (SUM(COALESCE(gl.ab, 0)) - SUM(COALESCE(gl.k, 0))) /
                                NULLIF(SUM(COALESCE(gl.ab, 0)), 0),
                                3
                            ),
                            100.00
                        ) AS contact_pct""",
            'gb_fb_ratio': """-- GB/FB Ratio = Ground Outs / Air Outs (capped at 9.999 to fit DECIMAL(4,3))
                        LEAST(
                            ROUND(
                                SUM(COALESCE(gl.ground_outs, 0)) /
                                NULLIF(SUM(COALESCE(gl.air_outs, 0)), 0),
                                3
                            ),
                            9.999
                        ) AS gb_fb_ratio""",
            'lob_batting_pct': """-- LOB% (Batting) = Left on Base / (H + BB + HBP - HR) (capped at 100.00 to fit DECIMAL(5,2))
                        LEAST(
                            ROUND(
                                SUM(COALESCE(gl.left_on_base, 0)) /
                                NULLIF(
                                    SUM(COALESCE(gl.h, 0)) + SUM(COALESCE(gl.bb, 0)) + SUM(COALESCE(gl.hit_by_pitch, 0)) - SUM(COALESCE(gl.hr, 0)),
                                    0
                                ),
                                3
                            ),
                            100.00
                        ) AS lob_batting_pct""",
            'woba': """-- wOBA = (0.69*BB + 0.72*HBP + 0.89*1B + 1.27*2B + 1.62*3B + 2.10*HR) / PA
                        ROUND(
                            (0.69 * SUM(COALESCE(gl.bb, 0)) +
                             0.72 * SUM(COALESCE(gl.hit_by_pitch, 0)) +
                             0.89 * (SUM(COALESCE(gl.h, 0)) - SUM(COALESCE(gl.doubles, 0)) - SUM(COALESCE(gl.triples, 0)) - SUM(COALESCE(gl.hr, 0))) +
                             1.27 * SUM(COALESCE(gl.doubles, 0)) +
                             1.62 * SUM(COALESCE(gl.triples, 0)) +
                             2.10 * SUM(COALESCE(gl.hr, 0))) /
                            NULLIF(
                                SUM(COALESCE(gl.ab, 0)) + SUM(COALESCE(gl.bb, 0)) + SUM(COALESCE(gl.sac_flies, 0)) + SUM(COALESCE(gl.hit_by_pitch, 0)),
                                0
                            ),
                            3
                        ) AS woba""",
            'inherited_runners': 'SUM(COALESCE(gl.inherited_runners, 0)) AS inherited_runners',
            'inherited_runners_scored': 'SUM(COALESCE(gl.inherited_runners_scored, 0)) AS inherited_runners_scored',
            'irs_pct': """-- IRS% = Inherited Runners Scored / Inherited Runners (capped at 100.00 to fit DECIMAL(5,2))
                        LEAST(
                            ROUND(
                                SUM(COALESCE(gl.inherited_runners_scored, 0)) /
                                NULLIF(SUM(COALESCE(gl.inherited_runners, 0)), 0),
                                3
                            ),
                            100.00
                        ) AS irs_pct""",
            'fip': f"""-- FIP = (13*HR + 3*BB - 2*K) / IP + constant)
                        ROUND(
                            (13 * SUM(COALESCE(gl.home_runs_allowed, 0)) +
                            3 * SUM(COALESCE(gl.walks_allowed, 0)) -
                            2 * SUM(COALESCE(gl.strikeouts, 0))) /
                            NULLIF(SUM(COALESCE(gl.ip, 0)), 0) + {FIP_CONSTANT},
                            2
                        ) AS fip""",
            'k_per_9': """-- K/9 = (K * 9) / IP
                        ROUND(
                            (SUM(COALESCE(gl.strikeouts, 0)) * 9) /
                            NULLIF(SUM(COALESCE(gl.ip, 0)), 0),
                            2
                        ) AS k_per_9""",
            'bb_per_9': """-- BB/9 = (BB * 9) / IP
                        ROUND(
                            (SUM(COALESCE(gl.walks_allowed, 0)) * 9) /
                            NULLIF(SUM(COALESCE(gl.ip, 0)), 0),
                            2
                        ) AS bb_per_9""",
            'hr_per_9': """-- HR/9 = (HR * 9) / IP
                        ROUND(
                            (SUM(COALESCE(gl.home_runs_allowed, 0)) * 9) /
                            NULLIF(SUM(COALESCE(gl.ip, 0)), 0),
                            2
                        ) AS hr_per_9""",
            'k_bb_ratio': """-- K/BB Ratio = K / BB
                        ROUND(
                            SUM(COALESCE(gl.strikeouts, 0)) /
                            NULLIF(SUM(COALESCE(gl.walks_allowed, 0)), 0),
                            2
                        ) AS k_bb_ratio""",
            'lob_pitching_pct': """-- LOB% (Pitching) = (H + BB - R) / (H + BB - HR) (capped at 100.00 to fit DECIMAL(5,2))
                        LEAST(
                            ROUND(
                                (SUM(COALESCE(gl.hits_allowed, 0)) + SUM(COALESCE(gl.walks_allowed, 0)) - SUM(COALESCE(gl.er, 0))) /
                                NULLIF(
                                    SUM(COALESCE(gl.hits_allowed, 0)) + SUM(COALESCE(gl.walks_allowed, 0)) - SUM(COALESCE(gl.home_runs_allowed, 0)),
                                    0
                                ),
                                3
                            ),
                            100.00
                        ) AS lob_pitching_pct""",
        }

    def get_advanced_formulas(self):
        return {
            'fip_minus': 'IF(p.fip IS NOT NULL AND l.fip IS NOT NULL AND l.fip > 0, ROUND(100 * p.fip / l.fip, 1), NULL)',
            'era_minus': 'IF(b.era IS NOT NULL AND l.fip IS NOT NULL AND l.fip > 0, ROUND(100 * b.era / l.fip, 1), NULL)',
            'woba_plus': 'IF(p.woba IS NOT NULL AND l.woba IS NOT NULL AND l.woba > 0, ROUND(100 * p.woba / l.woba, 1), NULL)',
            'obp_plus': 'IF(p.obp IS NOT NULL AND l.obp IS NOT NULL AND l.obp > 0, ROUND(100 * p.obp / l.obp, 1), NULL)',
            'slg_plus': 'IF(p.slg IS NOT NULL AND l.slg IS NOT NULL AND l.slg > 0, ROUND(100 * p.slg / l.slg, 1), NULL)',
            'ops_plus': 'IF(p.ops IS NOT NULL AND l.ops IS NOT NULL AND l.ops > 0, ROUND(100 * p.ops / l.ops, 1), NULL)',
            'wraa': f"""IF(p.woba IS NOT NULL AND l.woba IS NOT NULL AND l.woba > 0 AND p.abs IS NOT NULL, ROUND((p.woba - l.woba) * p.abs / {WOBASCALE}, 2), NULL)""",
        }

    def compute_rolling_stats(self):
        # Start transaction for the entire operation
        self.begin_transaction()
        
        try:
            self.compute_league_averages()
            # Clear all existing rolling stats before computing new ones
            logger.info("Clearing all existing advanced player rolling stats")
            self.purge_all_records_in_transaction(self.rolling_stats_table)
            
            insert_keys = self.SPLIT_WINDOW_KEYS + self.ID_KEYS + self.EXTRA_KEYS + self.DATE_KEYS + self.STATS_KEYS['batting'] + self.STATS_KEYS['pitching']
            all_formulas = self.get_formulas()
            select_formulas = [all_formulas[key] for key in insert_keys]

            join_conditions = super().get_join_conditions()
            logger.info(f"Computing advanced player rolling stats")
            super().compute_rolling_stats(self.rolling_stats_table, self.game_logs_table, insert_keys, select_formulas, join_conditions, 'GROUP BY gl.player_id')
            self.update_advanced_rolling_stats()
            self.compute_percentiles()
            
            # Commit transaction
            self.commit_transaction()
            logger.info("Successfully computed advanced rolling stats")
            
        except Exception as e:
            logger.error(f"Error computing advanced rolling stats: {e}")
            self.rollback_transaction()
            raise

    def update_advanced_rolling_stats(self):
        logger.info(f"Updating advanced rolling statistics")
        all_advanced_formulas = self.get_advanced_formulas()
        super().update_advanced_rolling_stats(self.rolling_stats_table, self.basic_rolling_stats_table, self.LEAGUE_AVERAGE_TABLE, all_advanced_formulas)

    def compute_league_averages(self):
        # Clear all existing league averages before computing new ones
        logger.info("Clearing all existing league averages")
        self.purge_all_records_in_transaction(self.LEAGUE_AVERAGE_TABLE)
        
        insert_keys = self.SPLIT_WINDOW_KEYS + self.DATE_KEYS + self.LEAGUE_AVERAGE_KEYS
        all_formulas = self.get_formulas()
        select_formulas = [all_formulas[key] for key in insert_keys]
        logger.info(f"Computing league averages for {self.LEAGUE_AVERAGE_KEYS}")
        join_conditions = super().get_join_conditions()
        super().compute_rolling_stats(self.LEAGUE_AVERAGE_TABLE, self.game_logs_table, insert_keys, select_formulas, join_conditions)

    def compute_percentiles(self):
        logger.info(f"Computing percentiles for advanced rolling stats")
        self.purge_all_records_in_transaction(self.rolling_stats_table + '_percentiles')
        
        super().compute_percentiles(self.rolling_stats_table, self.STATS_KEYS, self.STATS_THRESHOLDS, self.CONDITIONS, self.ID_KEYS)
        super().compute_percentiles(self.rolling_stats_table, self.ADVANCED_STATS_KEYS, self.STATS_THRESHOLDS, self.CONDITIONS, self.ID_KEYS)