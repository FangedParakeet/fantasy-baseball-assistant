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
        self.hydrate_stale_player_ids()
        self.sync_status.set_sync_status(self.HYDRATE_EXISTING_YAHOO_PLAYERS_SYNC_NAME, 'success')

    def hydrate_stale_player_ids(self):
        """
        Hydrate player_ids for players that are missing them.
        Flow: (1) consolidate duplicates by Yahoo suffix, (2) sync player_lookup from
        players (source of truth) so yahoo_player_id and team are current, (3) fill
        missing player_id in players from lookup by yahoo_player_id then by
        normalised_name+mlb_team+position.
        """
        logger.info("Consolidating duplicate players by Yahoo suffix")
        self.consolidate_duplicate_players_by_yahoo_suffix()

        logger.info("Syncing player_lookup from players (yahoo_player_id and team)")
        self.player_lookups.sync_lookup_from_players(
            self.PLAYER_TABLE_NAME,
            team_column_in_players='mlb_team',
        )

        logger.info("Updating player IDs from lookup by yahoo_player_id")
        self.player_lookups.update_player_ids_from_lookup_by_yahoo(
            self.PLAYER_TABLE_NAME,
            yahoo_id_column='yahoo_player_id',
        )
        logger.info("Updating player IDs from lookup by normalised_name, mlb_team, position")
        self.player_lookups.update_player_ids_from_lookup(
            self.PLAYER_TABLE_NAME,
            {'mlb_team': 'team', 'position': 'position'},
            unique_group_columns=['normalised_name', 'mlb_team', 'position'],
        )

    def consolidate_duplicate_players_by_yahoo_suffix(self):
        """
        Consolidate duplicate players that share the same Yahoo identity (suffix).
        Pass 1: Same (normalised_name, position, suffix) — keep newer row, delete older.
        Pass 2: Same (position, suffix) but different name (e.g. "rafael flores" vs "rafael flores jr")
        — keep newer row, copy player_id from any row in group that has it, delete the rest.
        """
        table = self.PLAYER_TABLE_NAME
        lookup_table = self.player_lookups.LOOKUP_TABLE
        try:
            self.begin_transaction()
            # Pass 1: (normalised_name, position, suffix) — update lookup then delete older
            update_lookup_sql = f"""
                UPDATE {lookup_table} pl
                INNER JOIN {table} p ON pl.player_id = p.player_id AND (pl.position <=> p.position)
                INNER JOIN (
                    SELECT
                        normalised_name,
                        position,
                        SUBSTRING_INDEX(yahoo_player_id, '.', -1) AS yahoo_suffix,
                        MAX(id) AS keep_id
                    FROM {table}
                    WHERE yahoo_player_id IS NOT NULL
                    GROUP BY normalised_name, position, SUBSTRING_INDEX(yahoo_player_id, '.', -1)
                    HAVING COUNT(*) > 1
                ) d ON p.normalised_name = d.normalised_name
                    AND p.position = d.position
                    AND SUBSTRING_INDEX(p.yahoo_player_id, '.', -1) = d.yahoo_suffix
                    AND p.id = d.keep_id
                SET pl.yahoo_player_id = p.yahoo_player_id, pl.team = p.mlb_team
                WHERE p.player_id IS NOT NULL
            """
            self.execute_query_in_transaction(update_lookup_sql)
            delete_dupes_sql = f"""
                DELETE p FROM {table} p
                INNER JOIN (
                    SELECT
                        normalised_name,
                        position,
                        SUBSTRING_INDEX(yahoo_player_id, '.', -1) AS yahoo_suffix,
                        MAX(id) AS keep_id
                    FROM {table}
                    WHERE yahoo_player_id IS NOT NULL
                    GROUP BY normalised_name, position, SUBSTRING_INDEX(yahoo_player_id, '.', -1)
                    HAVING COUNT(*) > 1
                ) d ON p.normalised_name = d.normalised_name
                    AND p.position = d.position
                    AND SUBSTRING_INDEX(p.yahoo_player_id, '.', -1) = d.yahoo_suffix
                    AND p.id <> d.keep_id
            """
            self.execute_query_in_transaction(delete_dupes_sql)

            # Pass 2: (position, suffix) only — same person, name changed (e.g. "jr" added)
            # Save (keep_id, group_player_id) before nulling so we don't lose the link
            self.execute_query_in_transaction(f"""
                CREATE TEMPORARY TABLE _pl_keep (keep_id INT PRIMARY KEY, group_player_id INT)
            """)
            self.execute_query_in_transaction(f"""
                INSERT INTO _pl_keep (keep_id, group_player_id)
                SELECT g.keep_id,
                       (SELECT p2.player_id FROM {table} p2
                        WHERE p2.position = g.position
                          AND SUBSTRING_INDEX(p2.yahoo_player_id, '.', -1) = g.yahoo_suffix
                          AND p2.player_id IS NOT NULL
                        LIMIT 1)
                FROM (
                    SELECT position,
                           SUBSTRING_INDEX(yahoo_player_id, '.', -1) AS yahoo_suffix,
                           MAX(id) AS keep_id
                    FROM {table}
                    WHERE yahoo_player_id IS NOT NULL
                    GROUP BY position, SUBSTRING_INDEX(yahoo_player_id, '.', -1)
                    HAVING COUNT(*) > 1
                ) g
            """)
            # Null out non-keepers so (player_id, position) is free for the keeper
            null_out_non_keepers_sql = f"""
                UPDATE {table} p
                INNER JOIN (
                    SELECT position,
                           SUBSTRING_INDEX(yahoo_player_id, '.', -1) AS yahoo_suffix,
                           MAX(id) AS keep_id
                    FROM {table}
                    WHERE yahoo_player_id IS NOT NULL
                    GROUP BY position, SUBSTRING_INDEX(yahoo_player_id, '.', -1)
                    HAVING COUNT(*) > 1
                ) d ON p.position = d.position
                    AND SUBSTRING_INDEX(p.yahoo_player_id, '.', -1) = d.yahoo_suffix
                    AND p.id <> d.keep_id
                SET p.player_id = NULL
            """
            self.execute_query_in_transaction(null_out_non_keepers_sql)
            # Copy saved player_id onto keeper
            copy_player_id_sql = f"""
                UPDATE {table} p
                INNER JOIN _pl_keep k ON p.id = k.keep_id
                SET p.player_id = k.group_player_id
                WHERE k.group_player_id IS NOT NULL AND p.player_id IS NULL
            """
            self.execute_query_in_transaction(copy_player_id_sql)
            self.execute_query_in_transaction("DROP TEMPORARY TABLE IF EXISTS _pl_keep")
            # Update lookup from keeper (position, suffix) groups
            update_lookup_suffix_sql = f"""
                UPDATE {lookup_table} pl
                INNER JOIN {table} p ON pl.player_id = p.player_id AND (pl.position <=> p.position)
                INNER JOIN (
                    SELECT
                        position,
                        SUBSTRING_INDEX(yahoo_player_id, '.', -1) AS yahoo_suffix,
                        MAX(id) AS keep_id
                    FROM {table}
                    WHERE yahoo_player_id IS NOT NULL
                    GROUP BY position, SUBSTRING_INDEX(yahoo_player_id, '.', -1)
                    HAVING COUNT(*) > 1
                ) d ON p.position = d.position
                    AND SUBSTRING_INDEX(p.yahoo_player_id, '.', -1) = d.yahoo_suffix
                    AND p.id = d.keep_id
                SET pl.yahoo_player_id = p.yahoo_player_id, pl.team = p.mlb_team
                WHERE p.player_id IS NOT NULL
            """
            self.execute_query_in_transaction(update_lookup_suffix_sql)
            # Delete non-keeper rows in (position, suffix) groups
            delete_by_suffix_sql = f"""
                DELETE p FROM {table} p
                INNER JOIN (
                    SELECT
                        position,
                        SUBSTRING_INDEX(yahoo_player_id, '.', -1) AS yahoo_suffix,
                        MAX(id) AS keep_id
                    FROM {table}
                    WHERE yahoo_player_id IS NOT NULL
                    GROUP BY position, SUBSTRING_INDEX(yahoo_player_id, '.', -1)
                    HAVING COUNT(*) > 1
                ) d ON p.position = d.position
                    AND SUBSTRING_INDEX(p.yahoo_player_id, '.', -1) = d.yahoo_suffix
                    AND p.id <> d.keep_id
            """
            self.execute_query_in_transaction(delete_by_suffix_sql)
            self.commit_transaction()
        except Exception as e:
            self.rollback_transaction()
            logger.exception("Error consolidating duplicate players by Yahoo suffix: %s", e)
            raise

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