from models.rolling_stats import RollingStats
from models.team_game_log import TeamGameLog
from models.logger import logger
from utils.constants import FIP_CONSTANT

class TeamRollingStats(RollingStats):
    ID_KEYS = ['team']
    EXTRA_KEYS = ['games_played']
    STATS_KEYS = {
        'batting': ['runs_scored', 'runs_allowed', 'run_diff',
                        'avg_runs_scored', 'avg_runs_allowed',
                        'avg', 'obp', 'slg', 'ops'],
        'pitching': ['er', 'whip', 'era', 'strikeouts', 'walks', 'ip', 'hits_allowed',
                        'singles', 'doubles', 'triples', 'total_bases', 'sac_flies', 'hit_by_pitch',
                        'ground_outs', 'air_outs', 'left_on_base', 'ground_into_dp',
                        'batters_faced', 'wild_pitches', 'balks', 'home_runs_allowed',
                        'inherited_runners', 'inherited_runners_scored',
                        'babip', 'lob_pct', 'fip', 'k_per_9', 'bb_per_9', 'hr_per_9', 'k_bb_ratio']
    }
    PERCENTILE_STATS_KEYS = {
        'batting': ['avg_runs_scored', 'avg_runs_allowed', 'avg', 'obp', 'slg', 'ops'],
        'pitching': ['era', 'whip', 'fip', 'k_per_9', 'bb_per_9', 'hr_per_9', 'k_bb_ratio']
    }
    TEAM_VS_BATTER_SPLITS_PERCENTILE_KEYS = { 'batting': ['ops', 'so_rate', 'bb_rate'] }
    TEAM_VS_PITCHER_SPLITS_PERCENTILE_KEYS = { 'pitching': ['ops', 'so_rate', 'bb_rate'] }
    STATS_THRESHOLDS = {
        'batting': {
            'key': 'games_played',
            7: 5,
            14: 10,
            30: 20
        },
        'pitching': {
            'key': 'games_played',
            7: 5,
            14: 10,
            30: 20
        }
    }


    def __init__(self, conn, rolling_stats_percentiles):
        self.rolling_stats_table = TeamGameLog.ROLLING_STATS_TABLE
        self.game_logs_table = TeamGameLog.GAME_LOGS_TABLE
        self.team_vs_batter_splits_table = TeamGameLog.TEAM_VS_BATTER_SPLITS_TABLE
        self.team_vs_pitcher_splits_table = TeamGameLog.TEAM_VS_PITCHER_SPLITS_TABLE
        super().__init__(conn, rolling_stats_percentiles)

    def get_formulas(self):
        return super().get_formulas() | {
            'team': 'gl.team',
            'games_played': 'COUNT(*) AS games_played',
            'runs_scored': 'SUM(COALESCE(gl.runs_scored, 0)) AS runs_scored',
            'runs_allowed': 'SUM(COALESCE(gl.runs_allowed, 0)) AS runs_allowed',
            'run_diff': 'SUM(COALESCE(gl.runs_scored, 0)) - SUM(COALESCE(gl.runs_allowed, 0)) AS run_diff',
            'avg_runs_scored': 'ROUND(SUM(COALESCE(gl.runs_scored, 0)) / NULLIF(COUNT(*), 0), 2) AS avg_runs_scored',
            'avg_runs_allowed': 'ROUND(SUM(COALESCE(gl.runs_allowed, 0)) / NULLIF(COUNT(*), 0), 2) AS avg_runs_allowed',
            'avg': 'ROUND(AVG(gl.avg), 3) AS avg',
            'obp': 'ROUND(AVG(gl.obp), 3) AS obp',
            'slg': 'ROUND(AVG(gl.slg), 3) AS slg',
            'ops': 'ROUND(AVG(gl.ops), 3) AS ops',
            'er': 'SUM(COALESCE(gl.er, 0)) AS er',
            'whip': 'ROUND(SUM(COALESCE(gl.walks, 0) + COALESCE(gl.hits_allowed, 0)) / NULLIF(SUM(gl.ip), 0), 2) AS whip',
            'era': 'ROUND((SUM(COALESCE(gl.er, 0)) * 9) / NULLIF(SUM(gl.ip), 0), 2) AS era',
            'strikeouts': 'SUM(COALESCE(gl.strikeouts, 0)) AS strikeouts',
            'walks': 'SUM(COALESCE(gl.walks, 0)) AS walks',
            'ip': 'ROUND(SUM(gl.ip), 2) AS ip',
            'hits_allowed': 'SUM(COALESCE(gl.hits_allowed, 0)) AS hits_allowed',
            'singles': 'SUM(COALESCE(gl.singles, 0)) AS singles',
            'doubles': 'SUM(COALESCE(gl.doubles, 0)) AS doubles',
            'triples': 'SUM(COALESCE(gl.triples, 0)) AS triples',
            'total_bases': 'SUM(COALESCE(gl.total_bases, 0)) AS total_bases',
            'sac_flies': 'SUM(COALESCE(gl.sac_flies, 0)) AS sac_flies',
            'hit_by_pitch': 'SUM(COALESCE(gl.hit_by_pitch, 0)) AS hit_by_pitch',
            'ground_outs': 'SUM(COALESCE(gl.ground_outs, 0)) AS ground_outs',
            'air_outs': 'SUM(COALESCE(gl.air_outs, 0)) AS air_outs',
            'left_on_base': 'SUM(COALESCE(gl.left_on_base, 0)) AS left_on_base',
            'ground_into_dp': 'SUM(COALESCE(gl.ground_into_dp, 0)) AS ground_into_dp',
            'batters_faced': 'SUM(COALESCE(gl.batters_faced, 0)) AS batters_faced',
            'wild_pitches': 'SUM(COALESCE(gl.wild_pitches, 0)) AS wild_pitches',
            'balks': 'SUM(COALESCE(gl.balks, 0)) AS balks',
            'home_runs_allowed': 'SUM(COALESCE(gl.home_runs_allowed, 0)) AS home_runs_allowed',
            'inherited_runners': 'SUM(COALESCE(gl.inherited_runners, 0)) AS inherited_runners',
            'inherited_runners_scored': 'SUM(COALESCE(gl.inherited_runners_scored, 0)) AS inherited_runners_scored',
            'babip': """ROUND(
                            (
                            SUM(COALESCE(gl.hits_allowed, 0)) - SUM(COALESCE(gl.home_runs_allowed, 0))
                            ) / NULLIF(
                            SUM(COALESCE(gl.batters_faced, 0) - COALESCE(gl.strikeouts, 0) - COALESCE(gl.home_runs_allowed, 0) + COALESCE(gl.sac_flies, 0)), 0
                            ), 3
                        ) AS babip""",
            'lob_pct': """ROUND(
                            (
                            SUM(COALESCE(gl.hits_allowed, 0) + COALESCE(gl.walks, 0) + COALESCE(gl.hit_by_pitch, 0) - COALESCE(gl.runs_allowed, 0))
                            ) / NULLIF(
                            SUM(COALESCE(gl.hits_allowed, 0) + COALESCE(gl.walks, 0) + COALESCE(gl.hit_by_pitch, 0) - (1.4 * COALESCE(gl.home_runs_allowed, 0))), 0
                            ), 2
                        ) AS lob_pct    """,
            'fip': f"""ROUND(
                            (
                            (13 * SUM(COALESCE(gl.home_runs_allowed, 0))) +
                            (3 * SUM(COALESCE(gl.walks, 0))) -
                            (2 * SUM(COALESCE(gl.strikeouts, 0)))
                            ) / NULLIF(SUM(gl.ip), 0) + {FIP_CONSTANT}, 2
                        ) AS fip""",
            'k_per_9': 'ROUND((SUM(COALESCE(gl.strikeouts, 0)) * 9) / NULLIF(SUM(gl.ip), 0), 2) AS k_per_9',
            'bb_per_9': 'ROUND((SUM(COALESCE(gl.walks, 0)) * 9) / NULLIF(SUM(gl.ip), 0), 2) AS bb_per_9',
            'hr_per_9': 'ROUND((SUM(COALESCE(gl.home_runs_allowed, 0)) * 9) / NULLIF(SUM(gl.ip), 0), 2) AS hr_per_9',
            'k_bb_ratio': 'ROUND(SUM(COALESCE(gl.strikeouts, 0)) / NULLIF(SUM(COALESCE(gl.walks, 0)), 0), 2) AS k_bb_ratio'
        }

    def get_join_conditions(self):
        return """
            (gl.is_home = 1 AND gp.away_pitcher_id IS NOT NULL AND opp_pl.player_id = gp.away_pitcher_id)
            OR
            (gl.is_home = 0 AND gp.home_pitcher_id IS NOT NULL AND opp_pl.player_id = gp.home_pitcher_id)
        """

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
        # Start transaction for the entire operation
        self.begin_transaction()
        try:
            # Clear all existing rolling stats before computing new ones
            logger.info("Clearing all existing team rolling stats")
            self.purge_all_records_in_transaction(self.rolling_stats_table)
            
            # Include all keys that have formulas, including those with %s placeholders
            insert_keys = self.SPLIT_WINDOW_KEYS + self.ID_KEYS + self.EXTRA_KEYS + self.STATS_KEYS['batting'] + self.STATS_KEYS['pitching']
            all_formulas = self.get_formulas()
            select_formulas = [all_formulas[key] for key in insert_keys]
            join_conditions = self.get_join_conditions()

            logger.info(f"Computing team rolling stats")
            super().compute_rolling_stats(self.rolling_stats_table, self.game_logs_table, insert_keys, select_formulas, join_conditions, 'GROUP BY gl.team')
            self.compute_percentiles()
            
            # Commit transaction
            self.commit_transaction()
            logger.info("Successfully computed team rolling stats")
        except Exception as e:
            logger.error(f"Error computing team rolling stats: {e}")
            self.rollback_transaction()
            raise

    def compute_percentiles(self):
        logger.info("Clearing all existing team rolling stats percentiles")
        self.purge_all_records_in_transaction(self.rolling_stats_table + '_percentiles')
        logger.info("Computing team rolling stats percentiles")
        super().compute_percentiles(self.rolling_stats_table, self.PERCENTILE_STATS_KEYS, self.STATS_THRESHOLDS, None, self.ID_KEYS)

    def compute_team_vs_splits_percentiles(self):
        # Start transaction for the entire operation
        self.begin_transaction()
        try:
            logger.info("Clearing all existing team vs batter splits percentiles")
            self.purge_all_records_in_transaction(self.team_vs_batter_splits_table + '_percentiles')
            logger.info("Clearing all existing team vs pitcher splits percentiles")
            self.purge_all_records_in_transaction(self.team_vs_pitcher_splits_table + '_percentiles')

            logger.info(f"Computing team vs batter splits percentiles for {self.TEAM_VS_BATTER_SPLITS_PERCENTILE_KEYS['batting']}")
            super().compute_percentiles(self.team_vs_batter_splits_table, self.TEAM_VS_BATTER_SPLITS_PERCENTILE_KEYS, self.STATS_THRESHOLDS, None, self.ID_KEYS, 'bats', ['L', 'R'])
            logger.info(f"Computing team vs pitcher splits percentiles for {self.TEAM_VS_PITCHER_SPLITS_PERCENTILE_KEYS['pitching']}")
            super().compute_percentiles(self.team_vs_pitcher_splits_table, self.TEAM_VS_PITCHER_SPLITS_PERCENTILE_KEYS, self.STATS_THRESHOLDS, None, self.ID_KEYS, 'throws', ['L', 'R'])

            # Commit transaction
            self.commit_transaction()
            logger.info("Successfully computed team vs splits percentiles")
        except Exception as e:
            logger.error(f"Error computing team vs splits percentiles: {e}")
            self.rollback_transaction()
            raise