from models.logger import logger
from models.db_recorder import DB_Recorder
from models.player_game_log import PlayerGameLog
from models.team_game_log import TeamGameLog

class LeagueStatistics(DB_Recorder):
    ROLLING_STATS_TABLE = "league_rolling_stats"
    ADVANCED_ROLLING_STATS_TABLE = "league_advanced_rolling_stats"

    def __init__(self, conn):
        self.conn = conn
        super().__init__(conn)

    def compute_league_averages(self):
        # Start transaction for the entire operation
        self.begin_transaction()
        
        try:
            logger.info("Computing league averages")
            self.purge_all_records_in_transaction(self.ROLLING_STATS_TABLE)
            self.compute_player_averages()
            self.compute_team_averages()
            self.compute_basic_team_vs_batter_averages()
            self.compute_basic_team_vs_pitcher_averages()
            
            # Commit transaction
            self.commit_transaction()
            logger.info("Successfully computed league averages")
            
        except Exception as e:
            logger.error(f"Error computing league averages: {e}")
            self.rollback_transaction()
            raise

    def compute_player_averages(self):
        logger.info("Computing player league averages (basic and advanced)")
        insert_query = f"""
            INSERT INTO {self.ROLLING_STATS_TABLE} (
                entity_type, split_type, span_days,
                avg, whip, era,
                hr_per_game, sb_per_game, rbi_per_game, runs_per_game, k_per_game, qs_rate,
                obp, slg, ops, fip,
                entity_count
            )
            SELECT
                'player', pr.split_type, pr.span_days,
                AVG(pr.avg), AVG(pr.whip), AVG(pr.era),
                AVG(pr.hr / NULLIF(pr.games, 0)),
                AVG(pr.sb / NULLIF(pr.games, 0)),
                AVG(pr.rbi / NULLIF(pr.games, 0)),
                AVG(pr.runs / NULLIF(pr.games, 0)),
                AVG(pr.k / NULLIF(pr.games, 0)),
                AVG(pr.qs / NULLIF(pr.games, 0)),
                AVG(par.obp), AVG(par.slg), AVG(par.ops), AVG(par.fip),
                COUNT(*)
            FROM {PlayerGameLog.BASIC_ROLLING_STATS_TABLE} pr
            LEFT JOIN {PlayerGameLog.ADVANCED_ROLLING_STATS_TABLE} par 
                ON pr.player_id = par.player_id 
                AND pr.split_type = par.split_type 
                AND pr.span_days = par.span_days
            GROUP BY pr.split_type, pr.span_days;
        """
        self.execute_query_in_transaction(insert_query)


    def compute_team_averages(self):
        logger.info("Computing team league averages")
        insert_query = f"""
            INSERT INTO {self.ROLLING_STATS_TABLE} (
                entity_type, split_type, span_days,
                avg, obp, slg, ops,
                era, whip, fip,
                runs_per_game, k_per_game, bb_per_game,
                entity_count
            )
            SELECT
                'team', trs.split_type, trs.span_days,
                AVG(trs.avg), AVG(trs.obp), AVG(trs.slg), AVG(trs.ops),
                AVG(trs.era), AVG(trs.whip), AVG(trs.fip),
                AVG(trs.avg_runs_scored),
                AVG(trs.strikeouts / NULLIF(trs.games_played, 0)),
                AVG(trs.walks / NULLIF(trs.games_played, 0)),
                COUNT(*)
            FROM {TeamGameLog.ROLLING_STATS_TABLE} trs
            GROUP BY trs.split_type, trs.span_days;
        """
        self.execute_query_in_transaction(insert_query)

    def compute_basic_team_vs_batter_averages(self):
        logger.info("Computing basic team vs batter league averages")
        insert_query = f"""
            INSERT INTO {self.ROLLING_STATS_TABLE} (
                entity_type, span_days, split_type,
                avg, obp, slg, ops,
                hr_per_game, sb_per_game, rbi_per_game, runs_per_game, k_per_game, bb_per_game,
                entity_count
            )
            SELECT
                'team_vs_batter', tvb.span_days, tvb.bats AS split_type,
                AVG(tvb.avg), AVG(tvb.obp), AVG(tvb.slg), AVG(tvb.ops),
                AVG(tvb.hr / NULLIF(tvb.games_played, 0)),
                AVG(tvb.sb / NULLIF(tvb.games_played, 0)),
                AVG(tvb.rbi / NULLIF(tvb.games_played, 0)),
                AVG(tvb.runs / NULLIF(tvb.games_played, 0)),
                AVG(tvb.k / NULLIF(tvb.games_played, 0)),
                AVG(tvb.bb / NULLIF(tvb.games_played, 0)),
                COUNT(*)
            FROM {TeamGameLog.TEAM_VS_BATTER_SPLITS_TABLE} tvb
            GROUP BY tvb.span_days, tvb.bats;
        """
        self.execute_query_in_transaction(insert_query)

    def compute_basic_team_vs_pitcher_averages(self):
        logger.info("Computing basic team vs pitcher league averages")
        insert_query = f"""
            INSERT INTO {self.ROLLING_STATS_TABLE} (
                entity_type, span_days, split_type,
                avg, obp, slg, ops,
                hr_per_game, sb_per_game, rbi_per_game, runs_per_game, k_per_game, bb_per_game,
                entity_count
            )
            SELECT
                'team_vs_pitcher', tvp.span_days, tvp.throws AS split_type,
                AVG(tvp.avg), AVG(tvp.obp), AVG(tvp.slg), AVG(tvp.ops),
                AVG(tvp.hr / NULLIF(tvp.games_played, 0)),
                AVG(tvp.sb / NULLIF(tvp.games_played, 0)),
                AVG(tvp.rbi / NULLIF(tvp.games_played, 0)),
                AVG(tvp.runs / NULLIF(tvp.games_played, 0)),
                AVG(tvp.k / NULLIF(tvp.games_played, 0)),
                AVG(tvp.bb / NULLIF(tvp.games_played, 0)),
                COUNT(*)
            FROM {TeamGameLog.TEAM_VS_PITCHER_SPLITS_TABLE} tvp
            GROUP BY tvp.span_days, tvp.throws;
        """
        self.execute_query_in_transaction(insert_query)