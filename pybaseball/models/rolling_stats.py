from models.db_recorder import DB_Recorder

class RollingStats(DB_Recorder):
    def __init__(self, conn):
        super().__init__(conn)
        
    def build_where_clause_for_split(self, split):
        if split == 'overall':
            return ''
        elif split == 'home':
            return 'AND gl.is_home = 1'
        elif split == 'away':
            return 'AND gl.is_home = 0'
        return ''
