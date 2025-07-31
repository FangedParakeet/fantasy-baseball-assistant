import pandas as pd
from models.game_log import GameLog
from utils.functions import normalise_name, safe_value
from models.logger import logger
from utils.constants import SPLITS, ROLLING_WINDOWS, FIP_CONSTANT

class PlayerGameLog(GameLog):
    GAME_LOGS_TABLE = "player_game_logs"
    BASIC_ROLLING_STATS_TABLE = "player_rolling_stats"
    ADVANCED_ROLLING_STATS_TABLE = "player_advanced_rolling_stats"
    GAME_PITCHERS_TABLE = "game_pitchers"
    PLAYER_LOOKUP_TABLE = "player_lookup"

    def __init__(self, conn, player_lookup=None):
        self.conn = conn
        self.player_lookup = player_lookup
        super().__init__(conn, self.GAME_LOGS_TABLE, self.BASIC_ROLLING_STATS_TABLE)

    def process_game_logs(self, game_logs, player_ids):
        """Process MLB API game logs into our format"""
        if game_logs.empty:
            return pd.DataFrame()
        
        # Get player data from lookup table
        if self.player_lookup:
            player_data = self.player_lookup.get_player_data_from_lookup(player_ids)
        else:
            player_data = {}
        
        processed_logs = []
        
        for _, row in game_logs.iterrows():
            player_id = row['player_id']
            
            # Get player data from lookup
            player_info = player_data.get(player_id, {})
            player_name = player_info.get('name') if player_info else None
            team = player_info.get('team') if player_info else None
            
            # Skip if we don't have player data
            if not player_name:
                logger.warning(f"No player data found for ID {player_id}")
                continue
            
            processed_logs.append((
                player_id,
                row['game_id'],
                row['game_date'],
                row['opponent'],
                row['is_home'],
                row['position'],
                safe_value(row['ab']),
                safe_value(row['h']),
                safe_value(row['r']),
                safe_value(row['rbi']),
                safe_value(row['hr']),
                safe_value(row['sb']),
                safe_value(row['bb']),
                safe_value(row['k']),
                safe_value(row['ip']),
                safe_value(row['er']),
                safe_value(row['hits_allowed']),
                safe_value(row['walks_allowed']),
                safe_value(row['strikeouts']),
                safe_value(row['qs']),
                safe_value(row['sv']),
                safe_value(row['hld']),
                None, # fantasy_points (not calculated yet)
                normalise_name(player_name),
                team,  # Use team from lookup table, not from game data
                # Advanced batting statistics
                safe_value(row['singles']),
                safe_value(row['doubles']),
                safe_value(row['triples']),
                safe_value(row['total_bases']),
                safe_value(row['sac_flies']),
                safe_value(row['hit_by_pitch']),
                safe_value(row['ground_outs']),
                safe_value(row['air_outs']),
                safe_value(row['left_on_base']),
                safe_value(row['ground_into_dp']),
                # Advanced pitching statistics
                safe_value(row['batters_faced']),
                safe_value(row['wild_pitches']),
                safe_value(row['balks']),
                safe_value(row['home_runs_allowed']),
                safe_value(row['inherited_runners']),
                safe_value(row['inherited_runners_scored']),
            ))
        
        return pd.DataFrame(processed_logs)

    def upsert_game_logs(self, logs, player_ids):
        """Upsert player game logs to database"""
        processed_logs = self.process_game_logs(logs, player_ids)
        if processed_logs.empty:
            logger.info("No player game logs to insert")
            return
        
        logger.info(f"Upserting {len(processed_logs)} player game logs")
        
        insert_query = f"""
            INSERT INTO {self.GAME_LOGS_TABLE} (
                player_id, game_id, game_date, opponent, is_home, position,
                ab, h, r, rbi, hr, sb, bb, k, ip, er, hits_allowed, walks_allowed, strikeouts, qs,
                sv, hld, fantasy_points, normalised_name, team,
                singles, doubles, triples, total_bases, sac_flies, hit_by_pitch, ground_outs, air_outs, left_on_base, ground_into_dp,
                batters_faced, wild_pitches, balks, home_runs_allowed, inherited_runners, inherited_runners_scored
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                opponent=VALUES(opponent), is_home=VALUES(is_home), position=VALUES(position),
                ab=VALUES(ab), h=VALUES(h), r=VALUES(r), rbi=VALUES(rbi), hr=VALUES(hr), sb=VALUES(sb),
                bb=VALUES(bb), k=VALUES(k), ip=VALUES(ip), er=VALUES(er), hits_allowed=VALUES(hits_allowed),
                walks_allowed=VALUES(walks_allowed), strikeouts=VALUES(strikeouts), qs=VALUES(qs),
                sv=VALUES(sv), hld=VALUES(hld), fantasy_points=VALUES(fantasy_points),
                normalised_name=VALUES(normalised_name), team=VALUES(team),
                singles=VALUES(singles), doubles=VALUES(doubles), triples=VALUES(triples), total_bases=VALUES(total_bases),
                sac_flies=VALUES(sac_flies), hit_by_pitch=VALUES(hit_by_pitch), ground_outs=VALUES(ground_outs),
                air_outs=VALUES(air_outs), left_on_base=VALUES(left_on_base), ground_into_dp=VALUES(ground_into_dp),
                batters_faced=VALUES(batters_faced), wild_pitches=VALUES(wild_pitches), balks=VALUES(balks),
                home_runs_allowed=VALUES(home_runs_allowed), inherited_runners=VALUES(inherited_runners), inherited_runners_scored=VALUES(inherited_runners_scored)
        """
        self.batch_upsert(insert_query, processed_logs)

    def build_where_clause_for_split(self, split):
        if split in ['overall', 'home', 'away']:
            return super().build_where_clause_for_split(split)
        elif split == 'vs_lhp':
            return """
            AND gl.position = 'B' AND (
                (gl.is_home = 1 AND gp.away_pitcher_id IS NOT NULL AND opp_pl.throws = 'L')
                OR (gl.is_home = 0 AND gp.home_pitcher_id IS NOT NULL AND opp_pl.throws = 'L')
            )
            """
        elif split == 'vs_rhp':
            return """
            AND gl.position = 'B' AND (
                (gl.is_home = 1 AND gp.away_pitcher_id IS NOT NULL AND opp_pl.throws = 'R')
                OR (gl.is_home = 0 AND gp.home_pitcher_id IS NOT NULL AND opp_pl.throws = 'R')
            )
            """
        return ''

    def compute_rolling_stats(self):
        self.compute_basic_rolling_stats()
        self.compute_advanced_rolling_stats()

    def compute_basic_rolling_stats(self):
        # Clear all existing rolling stats before computing new ones
        logger.info("Clearing all existing player rolling stats")
        delete_query = f"DELETE FROM {self.BASIC_ROLLING_STATS_TABLE}"
        self.execute_query(delete_query)
        
        for split in SPLITS:
            for window in ROLLING_WINDOWS:
                logger.info(f"Computing player {split} rolling stats for {window} days")

                where_clause = self.build_where_clause_for_split(split)

                insert_query = f"""
                    INSERT INTO {self.BASIC_ROLLING_STATS_TABLE} (
                        player_id, span_days, start_date, end_date, games, rbi, runs, hr, sb,
                        hits, abs, avg, k, ip, er, qs, sv, hld, whip, era, normalised_name, split_type
                    )
                    SELECT
                        gl.player_id,
                        %s AS span_days,
                        DATE_SUB(CURDATE(), INTERVAL %s DAY) AS start_date,
                        CURDATE() AS end_date,
                        COUNT(*) AS games,
                        SUM(COALESCE(gl.rbi, 0)),
                        SUM(COALESCE(gl.r, 0)),
                        SUM(COALESCE(gl.hr, 0)),
                        SUM(COALESCE(gl.sb, 0)),
                        SUM(COALESCE(gl.h, 0)),
                        SUM(COALESCE(gl.ab, 0)),
                        ROUND(SUM(COALESCE(gl.h, 0)) / NULLIF(SUM(COALESCE(gl.ab, 0)), 0), 3),
                        SUM(COALESCE(gl.k, 0)),
                        ROUND(SUM(COALESCE(gl.ip, 0)), 2),
                        SUM(COALESCE(gl.er, 0)),
                        SUM(COALESCE(gl.qs, 0)),
                        SUM(COALESCE(gl.sv, 0)),
                        SUM(COALESCE(gl.hld, 0)),
                        ROUND(SUM(COALESCE(gl.walks_allowed, 0) + COALESCE(gl.hits_allowed, 0)) / NULLIF(SUM(COALESCE(gl.ip, 0)), 0), 2),
                        ROUND(SUM(COALESCE(gl.er, 0)) * 9 / NULLIF(SUM(COALESCE(gl.ip, 0)), 0), 2),
                        MAX(gl.normalised_name),
                        %s AS split_type
                    FROM {self.GAME_LOGS_TABLE} gl
                    LEFT JOIN {self.GAME_PITCHERS_TABLE} gp ON gl.game_id = gp.game_id
                    LEFT JOIN {self.PLAYER_LOOKUP_TABLE} opp_pl ON (
                        (gl.is_home = 1 AND opp_pl.player_id = gp.away_pitcher_id)
                        OR
                        (gl.is_home = 0 AND opp_pl.player_id = gp.home_pitcher_id)
                    )
                    WHERE gl.game_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                    {where_clause}
                    GROUP BY gl.player_id;
                """

                params = (window, window, split, window)
                self.execute_query(insert_query, params)

    def compute_advanced_rolling_stats(self):
        # Clear all existing advanced rolling stats before computing new ones
        logger.info("Clearing all existing player advanced rolling stats")
        delete_query = f"DELETE FROM {self.ADVANCED_ROLLING_STATS_TABLE}"
        self.execute_query(delete_query)
        
        for split in SPLITS:
            for window in ROLLING_WINDOWS:
                logger.info(f"Computing player {split} advanced rolling stats for {window} days")

                where_clause = self.build_where_clause_for_split(split)

                insert_query = f"""
                    INSERT INTO {self.ADVANCED_ROLLING_STATS_TABLE} (
                        player_id, span_days, start_date, end_date, split_type,
                        obp, slg, ops, bb_rate, k_rate, babip,
                        inherited_runners, inherited_runners_scored, irs_pct,
                        fip, normalised_name
                    )
                    SELECT
                        gl.player_id,
                        %s AS span_days,
                        DATE_SUB(CURDATE(), INTERVAL %s DAY) AS start_date,
                        CURDATE() AS end_date,
                        %s AS split_type,

                        -- OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
                        ROUND(
                            (SUM(COALESCE(gl.h, 0)) + SUM(COALESCE(gl.bb, 0)) + SUM(COALESCE(gl.hit_by_pitch, 0))) /
                            NULLIF(
                                SUM(COALESCE(gl.ab, 0)) + SUM(COALESCE(gl.bb, 0)) + SUM(COALESCE(gl.hit_by_pitch, 0)) + SUM(COALESCE(gl.sac_flies, 0)),
                                0
                            ), 3
                        ) AS obp,

                        -- SLG = total_bases / ab
                        ROUND(SUM(COALESCE(gl.total_bases, 0)) / NULLIF(SUM(COALESCE(gl.ab, 0)), 0), 3) AS slg,

                        -- OPS = OBP + SLG (will be calculated later or repeated here)
                        ROUND(
                            (SUM(COALESCE(gl.h, 0)) + SUM(COALESCE(gl.bb, 0)) + SUM(COALESCE(gl.hit_by_pitch, 0))) /
                            NULLIF(
                                SUM(COALESCE(gl.ab, 0)) + SUM(COALESCE(gl.bb, 0)) + SUM(COALESCE(gl.hit_by_pitch, 0)) + SUM(COALESCE(gl.sac_flies, 0)),
                                0
                            ) +
                            SUM(COALESCE(gl.total_bases, 0)) / NULLIF(SUM(COALESCE(gl.ab, 0)), 0),
                            3
                        ) AS ops,

                        -- BB% = BB / PA
                        ROUND(
                            SUM(COALESCE(gl.bb, 0)) /
                            NULLIF(SUM(COALESCE(gl.ab, 0)) + SUM(COALESCE(gl.bb, 0)) + SUM(COALESCE(gl.sac_flies, 0)) + SUM(COALESCE(gl.hit_by_pitch, 0)), 0),
                            3
                        ) AS bb_rate,

                        -- K% = K / PA
                        ROUND(
                            SUM(COALESCE(gl.k, 0)) /
                            NULLIF(SUM(COALESCE(gl.ab, 0)) + SUM(COALESCE(gl.bb, 0)) + SUM(COALESCE(gl.sac_flies, 0)) + SUM(COALESCE(gl.hit_by_pitch, 0)), 0),
                            3
                        ) AS k_rate,

                        -- BABIP = (H - HR) / (AB - K - HR + SF)
                        ROUND(
                            (SUM(COALESCE(gl.h, 0)) - SUM(COALESCE(gl.hr, 0))) /
                            NULLIF(
                                SUM(COALESCE(gl.ab, 0)) - SUM(COALESCE(gl.k, 0)) - SUM(COALESCE(gl.hr, 0)) + SUM(COALESCE(gl.sac_flies, 0)),
                                0
                            ),
                            3
                        ) AS babip,

                        -- Inherited Runners
                        SUM(COALESCE(gl.inherited_runners, 0)) AS inherited_runners,
                        SUM(COALESCE(gl.inherited_runners_scored, 0)) AS inherited_runners_scored,

                        -- IRS% = Inherited Runners Scored / Inherited Runners
                        ROUND(
                            SUM(COALESCE(gl.inherited_runners_scored, 0)) /
                            NULLIF(SUM(COALESCE(gl.inherited_runners, 0)), 0),
                            3
                        ) AS irs_pct,

                        -- FIP = (13*HR + 3*BB - 2*K) / IP + constant)
                        ROUND(
                            (13 * SUM(COALESCE(gl.home_runs_allowed, 0)) +
                            3 * SUM(COALESCE(gl.walks_allowed, 0)) -
                            2 * SUM(COALESCE(gl.strikeouts, 0))) /
                            NULLIF(SUM(COALESCE(gl.ip, 0)), 0) + {FIP_CONSTANT},
                            2
                        ) AS fip,

                        MAX(gl.normalised_name)
                    FROM {self.GAME_LOGS_TABLE} gl
                    LEFT JOIN {self.GAME_PITCHERS_TABLE} gp ON gl.game_id = gp.game_id
                    LEFT JOIN {self.PLAYER_LOOKUP_TABLE} opp_pl ON (
                        (gl.is_home = 1 AND opp_pl.player_id = gp.away_pitcher_id)
                        OR (gl.is_home = 0 AND opp_pl.player_id = gp.home_pitcher_id)
                    )
                    WHERE gl.game_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                    {where_clause}
                    GROUP BY gl.player_id;
                """

                params = (window, window, split, window)
                self.execute_query(insert_query, params)