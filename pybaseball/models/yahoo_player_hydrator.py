from models.db_recorder import DB_Recorder
from models.sync_status import SyncStatus
from models.api.yahoo_api import YahooApi
from models.player_lookups import PlayerLookups
from models.game_logs.logs_inserter import LogsInserter
from models.game_logs.yahoo_player_log import YahooPlayerLog
from utils.logger import logger

class YahooPlayerHydrator(DB_Recorder):
    HYDRATE_ALL_YAHOO_PLAYERS_SYNC_NAME = "hydrate_all_yahoo_players"
    HYDRATE_EXISTING_YAHOO_PLAYERS_SYNC_NAME = "hydrate_existing_yahoo_players"
    PLAYER_TABLE_NAME = "players"

    def __init__(self, conn, sync_status: SyncStatus, yahoo_api: YahooApi, player_lookups: PlayerLookups):
        super().__init__(conn)
        self.sync_status = sync_status
        self.yahoo_api = yahoo_api
        self.player_lookups = player_lookups

    def hydrate_all_players(self, force: bool=False):
        if not self.sync_status.should_sync(self.HYDRATE_ALL_YAHOO_PLAYERS_SYNC_NAME, force):
            logger.info(f"Skipping {self.HYDRATE_ALL_YAHOO_PLAYERS_SYNC_NAME} sync")
            return

        players = self.yahoo_api.get_all_league_players()
        logger.info(f"Found Yahoo data for {len(players)} players")

        all_yahoo_players = LogsInserter(YahooPlayerLog.KEYS, YahooPlayerLog.ID_KEYS)
        for player in players:
            # Debug: Check for players with missing names
            if not player.get('name'):
                logger.warning(f"Player missing name: {player}")
                continue
            all_yahoo_players.add_row(YahooPlayerLog(player))

        logger.info(f"Upserting {all_yahoo_players.get_row_count()} Yahoo players")
        self.upsert_players(all_yahoo_players)

        logger.info("Updating player IDs from lookup table")
        self.player_lookups.update_player_ids_from_lookup(self.PLAYER_TABLE_NAME, {'mlb_team': 'team'})
        self.player_lookups.update_lookup_fields_from_table(self.PLAYER_TABLE_NAME, ['yahoo_player_id'])

        self.sync_status.set_sync_status(self.HYDRATE_ALL_YAHOO_PLAYERS_SYNC_NAME, 'success')

    def hydrate_existing_players(self, force: bool=False):
        if not self.sync_status.should_sync(self.HYDRATE_EXISTING_YAHOO_PLAYERS_SYNC_NAME, force):
            logger.info(f"Skipping {self.HYDRATE_EXISTING_YAHOO_PLAYERS_SYNC_NAME} sync")
            return

        all_existing_players = self.get_records_with_conditions(self.PLAYER_TABLE_NAME, None, ['yahoo_player_id'], ['yahoo_player_id IS NOT NULL'])
        logger.info(f"Found {len(all_existing_players)} existing players")

        all_existing_player_keys = [player['yahoo_player_id'] for player in all_existing_players]
        all_yahoo_players = self.yahoo_api.get_league_players_by_keys(all_existing_player_keys)

        all_existing_players_logs = LogsInserter(YahooPlayerLog.KEYS, YahooPlayerLog.ID_KEYS)
        for player in all_yahoo_players:
            # Check for players with missing names
            if not player.get('name'):
                logger.warning(f"Player missing name: {player}")
                continue
            all_existing_players_logs.add_row(YahooPlayerLog(player))


        logger.info(f"Upserting {all_existing_players_logs.get_row_count()} existing players")
        logger.info("Updating player IDs from lookup table")
        self.player_lookups.update_player_ids_from_lookup(self.PLAYER_TABLE_NAME, {'mlb_team': 'team'})
        self.player_lookups.update_lookup_fields_from_table(self.PLAYER_TABLE_NAME, ['yahoo_player_id'])

        self.sync_status.set_sync_status(self.HYDRATE_EXISTING_YAHOO_PLAYERS_SYNC_NAME, 'success')

    def upsert_players(self, players: LogsInserter):
        if players.is_empty():
            logger.info("No Yahoo players to upsert")
            return
        
        insert_query = f"""
            INSERT INTO {self.PLAYER_TABLE_NAME} ({players.get_insert_keys()})
            VALUES ({players.get_placeholders()})
            ON DUPLICATE KEY UPDATE
                {players.get_duplicate_update_keys()}
        """
        self.batch_upsert(insert_query, players.get_rows())