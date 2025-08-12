from models.db_recorder import DB_Recorder
import time
from datetime import datetime

class YahooToken(DB_Recorder):
    MIN_REFRESH_SECONDS = 60 * 2 # 2 minutes before expiry
    TABLE_NAME = 'tokens'

    def __init__(self, conn):
        super().__init__(conn)
        self.stored_token = self.get_stored_token()

    def get_expiry_timestamp(self):
        if not self.stored_token:
            return 0
        expiry = self.stored_token.get('yahoo_token_expires_at')
        if expiry is None:
            return 0
        try:
            # Handle both datetime strings and Unix timestamps
            if isinstance(expiry, str):
                # Convert MySQL datetime string to Unix timestamp
                dt = datetime.strptime(expiry, '%Y-%m-%d %H:%M:%S')
                return dt.timestamp()
            else:
                # Assume it's already a Unix timestamp
                return float(expiry)
        except (ValueError, TypeError):
            return 0

    def has_valid_token(self):
        if not self.stored_token:
            return False
        expiry_timestamp = self.get_expiry_timestamp()
        return expiry_timestamp > time.time()

    def should_refresh_token(self):
        if not self.stored_token:
            return True
        expiry_timestamp = self.get_expiry_timestamp()
        current_time = time.time()
        return expiry_timestamp <= current_time or (expiry_timestamp - current_time) < self.MIN_REFRESH_SECONDS

    def get_token(self):
        return self.stored_token

    def get_stored_token(self):
        token = self.get_one(self.TABLE_NAME, ['id = 1'])
        if not token:
            return None
        return {
            'yahoo_access_token': token.get('yahoo_access_token', None),
            'yahoo_refresh_token': token.get('yahoo_refresh_token', None),
            'yahoo_token_expires_at': token.get('yahoo_token_expires_at', None),
        }

    def set_token(self, token_data):
        token = {
            'id': 1,
        } | token_data
        self.upsert_one(self.TABLE_NAME, token, ['id'])
        self.stored_token = token_data