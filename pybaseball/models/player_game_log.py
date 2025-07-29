import pandas as pd
from models.game_log import GameLog
from utils.functions import normalise_name
from models.logger import logger
from utils.constants import SPLITS, ROLLING_WINDOWS

class PlayerGameLog(GameLog):
    def __init__(self, conn, player_lookup=None):
        self.conn = conn
        self.player_lookup = player_lookup
        self.game_logs_table = "player_game_logs"
        self.rolling_stats_table = "player_rolling_stats"
        super().__init__(conn, self.game_logs_table, self.rolling_stats_table)

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
                row['ab'],
                row['h'],
                row['r'],
                row['rbi'],
                row['hr'],
                row['sb'],
                row['bb'],
                row['k'],
                row['ip'],
                row['er'],
                row['hits_allowed'],
                row['walks_allowed'],
                row['strikeouts'],
                row['qs'],
                None, # sv (not calculated yet)
                None, # hld (not calculated yet)
                None, # fantasy_points (not calculated yet)
                normalise_name(player_name),
                team,  # Use team from lookup table, not from game data
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
            INSERT INTO {self.game_logs_table} (
                player_id, game_id, game_date, opponent, is_home, position,
                ab, h, r, rbi, hr, sb, bb, k, ip, er, hits_allowed, walks_allowed, strikeouts, qs,
                sv, hld, fantasy_points, normalised_name, team
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                opponent=VALUES(opponent), is_home=VALUES(is_home), position=VALUES(position),
                ab=VALUES(ab), h=VALUES(h), r=VALUES(r), rbi=VALUES(rbi), hr=VALUES(hr), sb=VALUES(sb),
                bb=VALUES(bb), k=VALUES(k), ip=VALUES(ip), er=VALUES(er), hits_allowed=VALUES(hits_allowed),
                walks_allowed=VALUES(walks_allowed), strikeouts=VALUES(strikeouts), qs=VALUES(qs),
                sv=VALUES(sv), hld=VALUES(hld), fantasy_points=VALUES(fantasy_points),
                normalised_name=VALUES(normalised_name), team=VALUES(team)
        """
        self.batch_upsert(insert_query, processed_logs)

    def compute_rolling_stats(self):
        # Clear all existing rolling stats before computing new ones
        logger.info("Clearing all existing player rolling stats")
        delete_query = f"DELETE FROM {self.rolling_stats_table}"
        self.execute_query(delete_query)
        
        for split in SPLITS:
            for window in ROLLING_WINDOWS:
                logger.info(f"Computing player {split} rolling stats for {window} days")

                where_clause = self.build_where_clause_for_split(split)

                insert_query = f"""
                    INSERT INTO player_rolling_stats (
                        player_id, span_days, start_date, end_date, games, rbi, runs, hr, sb,
                        hits, abs, avg, k, ip, er, qs, whip, era, normalised_name, split_type
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
                        ROUND(SUM(COALESCE(gl.walks_allowed, 0) + gl.hits_allowed) / NULLIF(SUM(COALESCE(gl.ip, 0)), 0), 2),
                        ROUND(SUM(COALESCE(gl.er, 0)) * 9 / NULLIF(SUM(COALESCE(gl.ip, 0)), 0), 2),
                        MAX(gl.normalised_name),
                        %s AS split_type
                    FROM {self.game_logs_table} gl
                    LEFT JOIN game_pitchers gp ON gl.game_id = gp.game_id
                    WHERE gl.game_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                    {where_clause}
                    GROUP BY gl.player_id
                """

                self.execute_query(insert_query, (window, window, split, window))