from models.db_recorder import DB_Recorder

class GameLog(DB_Recorder):
    def __init__(self, conn, game_logs_table, rolling_stats_table):
        self.conn = conn
        self.game_logs_table = game_logs_table
        self.rolling_stats_table = rolling_stats_table
        super().__init__(conn)

    def get_latest_game_log_date(self):
        return super().get_latest_record_date(self.game_logs_table)

    def purge_old_game_logs(self):
        return super().purge_old_records(self.game_logs_table)

    def build_where_clause_for_split(self, split):
        if split == 'overall':
            return ''
        elif split == 'home':
            return 'AND gl.is_home = TRUE'
        elif split == 'away':
            return 'AND gl.is_home = FALSE'
        elif split == 'vs_lhp':
            return """
            AND (
                (gl.team = gp.home_team AND gp.away_pitcher_throws = 'L')
                OR (gl.team = gp.away_team AND gp.home_pitcher_throws = 'L')
            )
            """
        elif split == 'vs_rhp':
            return """
            AND (
                (gl.team = gp.home_team AND gp.away_pitcher_throws = 'R')
                OR (gl.team = gp.away_team AND gp.home_pitcher_throws = 'R')
            )
            """
        return ''
