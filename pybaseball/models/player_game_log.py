import pandas as pd
from models.game_log import GameLog
from utils.functions import normalise_name
from models.logger import logger

class PlayerGameLog(GameLog):
    def __init__(self, conn, player_lookup):
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
        player_data = self.player_lookup.get_player_data_from_lookup(player_ids)
        
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
                None, # bats (not calculated yet)
                None, # opponent_hand (not calculated yet)
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
                player_id, game_date, opponent, is_home, position,
                ab, h, r, rbi, hr, sb, bb, k, ip, er, hits_allowed, walks_allowed, strikeouts, qs,
                sv, hld, fantasy_points, bats, opponent_hand, normalised_name, team
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                opponent=VALUES(opponent), is_home=VALUES(is_home), position=VALUES(position),
                ab=VALUES(ab), h=VALUES(h), r=VALUES(r), rbi=VALUES(rbi), hr=VALUES(hr), sb=VALUES(sb),
                bb=VALUES(bb), k=VALUES(k), ip=VALUES(ip), er=VALUES(er), hits_allowed=VALUES(hits_allowed),
                walks_allowed=VALUES(walks_allowed), strikeouts=VALUES(strikeouts), qs=VALUES(qs),
                sv=VALUES(sv), hld=VALUES(hld), fantasy_points=VALUES(fantasy_points),
                bats=VALUES(bats), opponent_hand=VALUES(opponent_hand), normalised_name=VALUES(normalised_name), team=VALUES(team)
        """
        super().batch_upsert_game_logs(insert_query, processed_logs)

    def compute_rolling_stats(self):
        compute_query = f"""
            INSERT INTO {self.rolling_stats_table} (player_id, split_type, span_days, start_date, end_date, 
                abs, hits, hr, rbi, sb, k, avg, 
                ip, er, qs, whip, era, normalised_name)
            SELECT 
                player_id,
                %s AS split_type,
                %s AS span_days,
                MIN(game_date) AS start_date,
                MAX(game_date) AS end_date,
                SUM(ab), SUM(h), SUM(hr), SUM(rbi), SUM(sb),
                SUM(k),
                ROUND(SUM(h)/NULLIF(SUM(ab),0), 3) AS avg,
                ROUND(SUM(ip), 2),
                SUM(er),
                SUM(CASE WHEN qs = 1 THEN 1 ELSE 0 END),
                ROUND(SUM(walks_allowed + hits_allowed)/NULLIF(SUM(ip),0), 2) AS whip,
                ROUND(SUM(er)*9/NULLIF(SUM(ip),0), 2) AS era,
                MAX(normalised_name)
            FROM {self.game_logs_table}
            WHERE game_date >= CURDATE() - INTERVAL %s DAY
            GROUP BY player_id
        """
        super().compute_rolling_stats(compute_query)

