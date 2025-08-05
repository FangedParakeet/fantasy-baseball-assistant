class LogsInserter():
    def __init__(self, keys, id_keys):
        self.keys = keys
        self.id_keys = id_keys
        self.rows = []
        self.row_count = 0

    def get_row_count(self):
        return self.row_count

    def is_empty(self):
        return self.row_count == 0

    def add_row(self, mlb_log):
        self.rows.append(mlb_log.get_values())
        self.row_count += 1

    def get_rows(self):
        return self.rows

    def get_insert_keys(self):
        return ', '.join(self.keys)

    def get_placeholders(self):
        return ', '.join(['%s'] * len(self.keys))

    def get_duplicate_update_keys(self):
        duplicate_update_keys = [f'{key} = VALUES({key})' for key in self.keys if key not in self.id_keys]
        return ', '.join(duplicate_update_keys)