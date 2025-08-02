import pandas as pd
from utils.functions import normalise_name, safe_value
from models.logger import logger
from models.game_log import GameLog

class PlayerGameLog(GameLog):
    GAME_LOGS_TABLE = "player_game_logs"
    BASIC_ROLLING_STATS_TABLE = "player_rolling_stats"
    ADVANCED_ROLLING_STATS_TABLE = "player_advanced_rolling_stats"

    def __init__(self, conn, player_lookup=None, player_basic_rolling_stats=None, player_advanced_rolling_stats=None):
        self.conn = conn
        self.player_lookup = player_lookup
        self.player_basic_rolling_stats = player_basic_rolling_stats
        self.player_advanced_rolling_stats = player_advanced_rolling_stats
        super().__init__(conn, self.GAME_LOGS_TABLE)

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

    def compute_rolling_stats(self):
        self.player_basic_rolling_stats.compute_rolling_stats()
        self.player_advanced_rolling_stats.compute_rolling_stats()