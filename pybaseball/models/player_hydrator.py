from datetime import datetime, timedelta, timezone
from models.mlb_api import MlbApi
from models.sync_status import SyncStatus
from models.db_recorder import DB_Recorder
from models.logger import logger
from utils.functions import normalise_name

class PlayerHydrator(DB_Recorder):
    SYNC_NAME = "hydrate_player_lookup"
    PLAYER_LOOKUP_TABLE = "player_lookup"
    PLAYER_GAME_LOG_TABLE = "player_game_logs"

    MAX_GAME_AGE_DAYS = 7
    MAX_STALE_DAYS = 1

    def __init__(self, conn, mlb_api: MlbApi, sync_status: SyncStatus):
        super().__init__(conn)
        self.conn = conn
        self.mlb_api = mlb_api
        self.sync_status = sync_status

    def hydrate_players(self, force: bool=False) -> None:
        if not self.sync_status.should_sync(self.SYNC_NAME, force):
            logger.info(f"Skipping {self.SYNC_NAME} sync as it was run less than {self.sync_status.THROTTLE_HOURS} hours ago")
            return

        player_ids = self.get_unique_player_ids()
        logger.info(f"Hydrating {len(player_ids)} players")

        players = self.mlb_api.get_player_info(player_ids)
        rows = self.process_players(players)
        logger.info(f"Found data for {len(rows)} players")
        if len(rows) == 0:
            logger.info("No players found")
            return

        insert_query = """
            INSERT INTO {self.PLAYER_LOOKUP_TABLE} (player_id, first_name, last_name, normalised_name, status, bats, throws, last_updated)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                first_name = VALUES(first_name),
                last_name = VALUES(last_name),
                normalised_name = VALUES(normalised_name),
                status = VALUES(status),
                bats = VALUES(bats),
                throws = VALUES(throws),
                last_updated = VALUES(last_updated)
        """
        self.batch_upsert(insert_query, rows)

        logger.info(f"Hydrated {len(players)} players")

        self.sync_status.set_sync_status(self.SYNC_NAME, "success", f"Hydrated {len(players)} players")

    def process_players(self, player_info: list[dict]) -> None:
        rows = []
        for player in player_info:
            rows.append((
                player.get("id", ""),
                player.get("firstName", ""),
                player.get("lastName", ""),
                normalise_name(player.get("fullName", "")),
                "Active" if player.get("active", False) else "Inactive",  # Use 'active' field instead of status
                player.get("batSide", {}).get("code", ""),
                player.get("pitchHand", {}).get("code", ""),
                datetime.now(timezone.utc)
            ))
        return rows

    def get_unique_player_ids(self) -> list[int]:
        with self.conn.cursor() as cursor:
            # Calculate the stale date threshold
            stale_date = datetime.now(timezone.utc) - timedelta(days=self.MAX_STALE_DAYS)
            
            # Subquery 1: From player_game_logs
            cursor.execute("""
                SELECT DISTINCT pgl.player_id
                FROM {self.PLAYER_GAME_LOG_TABLE} pgl
                LEFT JOIN {self.PLAYER_LOOKUP_TABLE} pl ON pgl.player_id = pl.player_id
                WHERE pl.status IS NULL OR pl.status IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.bats IS NULL OR pl.bats IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.throws IS NULL OR pl.throws IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.last_updated IS NULL OR pl.last_updated < %s
            """, (stale_date,))
            ids_game_log = [row[0] for row in cursor.fetchall()]

            # Subquery 2: From player_lookup where status, bats, or throws is null or stale
            cursor.execute("""
                SELECT DISTINCT pl.player_id
                FROM {self.PLAYER_LOOKUP_TABLE} pl
                WHERE pl.status IS NULL OR pl.status IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.bats IS NULL OR pl.bats IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.throws IS NULL OR pl.throws IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.last_updated IS NULL OR pl.last_updated < %s
            """, (stale_date,))
            ids_lookup = [row[0] for row in cursor.fetchall()]

        all_ids = ids_lookup + ids_game_log
        return list(set(id for id in all_ids if id is not None))