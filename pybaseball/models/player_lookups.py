from utils.logger import logger
from models.db_recorder import DB_Recorder
from models.player_game_logs import PlayerGameLogs
from datetime import datetime, timedelta, timezone
from models.game_logs.logs_inserter import LogsInserter
from utils.constants import MLB_TEAM_IDS

class PlayerLookups(DB_Recorder):
    LOOKUP_TABLE = "player_lookup"
    PLAYERS_TABLE = "players"
    ID_KEYS = ['player_id']
    MAX_STALE_DAYS = 1

    def __init__(self, conn, mlb_api=None):
        self.conn = conn
        self.mlb_api = mlb_api
        self.player_game_logs_table = PlayerGameLogs.GAME_LOGS_TABLE


    def insert_rows_into_lookup_table(self, all_rows: LogsInserter):
        insert_query = f"""
            INSERT INTO {self.LOOKUP_TABLE} ({all_rows.get_insert_keys()})
            VALUES ({all_rows.get_placeholders()})
            ON DUPLICATE KEY UPDATE 
                {all_rows.get_duplicate_update_keys()}
        """
        self.batch_upsert(insert_query, all_rows.get_rows())

    def set_unrostered_players_to_inactive(self, active_player_ids: list[int]):
        update_query = f"""
            UPDATE {self.LOOKUP_TABLE}
            SET status = 'Inactive'
            WHERE player_id NOT IN ({','.join(map(str, active_player_ids))})
        """
        self.execute_query(update_query)

    def update_player_names_from_lookup(
        self,
        table: str,
        matching_conditions: list[str] = [],
        lookup_position: str | None = None,
    ):
        """
        Update normalised_name on table from player_lookup. Join on player_id and any matching_conditions
        (e.g. ['position'] when table has position). When table has no position (e.g. probable_pitchers),
        pass lookup_position='P' or 'B' so we join to the correct lookup row.
        """
        logger.info(f"Updating player names from lookup table for {table}")
        try:
            default_join_conditions = ["t.player_id = pl.player_id"]
            join_conditions = default_join_conditions + [f"t.{c} = pl.{c}" for c in matching_conditions]
            if lookup_position is not None:
                join_conditions.append("pl.position = %s")
            conditions_str = " AND ".join(join_conditions)
            update_query = f"""
                UPDATE {table} t
                JOIN {self.LOOKUP_TABLE} pl ON {conditions_str}
                SET t.normalised_name = pl.normalised_name
                WHERE t.normalised_name IS NULL
            """
            if lookup_position is not None:
                self.execute_query(update_query, (lookup_position,))
            else:
                self.execute_query(update_query)
            logger.info(f"Player names updated successfully for {table}")
        except Exception as e:
            logger.error(f"Error updating player names from lookup table for {table}: {e}")

    def update_player_ids_from_lookup(
        self,
        table: str,
        matching_conditions: dict = {},
        unique_group_columns: list[str] | None = None,
        lookup_position: str | None = None,
    ):
        """
        Set player_id on table from player_lookup by joining on normalised_name and matching_conditions.
        Include 'position': 'position' in matching_conditions when the table has position so the join
        is 1:1. When the table has no position (e.g. probable_pitchers), pass lookup_position='P' or 'B'.
        """
        logger.info(f"Updating player ids from lookup table for {table}")
        try:
            self.consolidate_duplicate_players()
            default_join_conditions = ["t.normalised_name = pl.normalised_name"]
            join_conditions = default_join_conditions + [f"t.{key} = pl.{value}" for key, value in matching_conditions.items()]
            if lookup_position is not None:
                join_conditions.append("pl.position = %s")
            conditions_str = " AND ".join(join_conditions)

            if unique_group_columns:
                group_cols = ", ".join(unique_group_columns)
                join_to_single = " AND ".join(
                    [f"t.{c} = single.{c}" for c in unique_group_columns] + ["t.id = single.min_id"]
                )
                update_query = f"""
                    UPDATE {table} t
                    JOIN {self.LOOKUP_TABLE} pl ON {conditions_str}
                    JOIN (
                        SELECT {group_cols}, min_id FROM (
                            SELECT {group_cols}, MIN(id) AS min_id
                            FROM {table}
                            WHERE player_id IS NULL
                            GROUP BY {group_cols}
                        ) AS inner_single
                    ) single ON {join_to_single}
                    LEFT JOIN (
                        SELECT existing_id, existing_pid, existing_pos FROM (
                            SELECT id AS existing_id, player_id AS existing_pid, position AS existing_pos
                            FROM {table}
                        ) AS inner_existing
                    ) existing ON existing.existing_pid = pl.player_id
                        AND existing.existing_pos = t.position
                        AND existing.existing_id <> t.id
                    SET t.player_id = pl.player_id
                    WHERE t.player_id IS NULL
                        AND existing.existing_id IS NULL
                """
            else:
                update_query = f"""
                    UPDATE {table} t
                    JOIN {self.LOOKUP_TABLE} pl ON {conditions_str}
                    SET t.player_id = pl.player_id
                    WHERE t.player_id IS NULL
                """
            if lookup_position is not None:
                self.execute_query(update_query, (lookup_position,))
            else:
                self.execute_query(update_query)
            logger.info(f"Player ids updated successfully for {table}")
        except Exception as e:
            logger.error(f"Error updating player ids from lookup table for {table}: {e}")

    def update_lookup_fields_from_table(
        self, 
        table: str, 
        fields: dict[str, str], 
        matching_conditions: dict[str, str] = {},
        lookup_position: str | None = None,
    ):
        default_join_conditions = ["pl.player_id = t.player_id"]
        join_conditions = default_join_conditions + [f"pl.{key} = t.{value}" for key, value in matching_conditions.items()]
        conditions_str = " AND ".join(join_conditions)
        logger.info(f"Updating lookup fields from {table} for {fields}")
        try:
            update_fields = ", ".join([f"pl.{key} = t.{value}" for key, value in fields.items()])
            where_clause = " AND ".join([f"pl.{key} IS NULL" for key in fields.keys()])
            if lookup_position is not None:
                where_clause += f" AND pl.position = %s"
            update_query = f"""
                UPDATE {self.LOOKUP_TABLE} pl
                JOIN {table} t ON {conditions_str}
                SET {update_fields}
                WHERE {where_clause}
            """
            if lookup_position is not None:
                self.execute_query(update_query, (lookup_position,))
            else:
                self.execute_query(update_query)
            logger.info(f"Lookup fields updated successfully for {table}")
        except Exception as e:
            logger.error(f"Error updating lookup fields from {table} for {fields}: {e}")

    def sync_lookup_from_players(
        self,
        table: str,
        team_column_in_players: str = "mlb_team",
        position_column_in_players: str = "position",
    ):
        """
        Make player_lookup reflect current yahoo_player_id and team from the players table
        (source of truth). Joins on (player_id, position) so each lookup row matches one players row.
        """
        logger.info("Syncing player_lookup from players table (yahoo_player_id and team)")
        try:
            # 1) Same (player_id, position): overwrite lookup yahoo_player_id and team from players
            self.execute_query(f"""
                UPDATE {self.LOOKUP_TABLE} pl
                INNER JOIN {table} p ON pl.player_id = p.player_id AND (pl.position <=> p.{position_column_in_players})
                SET pl.yahoo_player_id = p.yahoo_player_id, pl.team = p.{team_column_in_players}
                WHERE p.yahoo_player_id IS NOT NULL
                  AND (pl.yahoo_player_id IS NULL OR pl.yahoo_player_id != p.yahoo_player_id
                       OR pl.team IS NULL OR pl.team != p.{team_column_in_players})
            """)
            # 2) Same (yahoo_player_id, position): refresh team (e.g. trade)
            self.execute_query(f"""
                UPDATE {self.LOOKUP_TABLE} pl
                INNER JOIN {table} p ON pl.yahoo_player_id = p.yahoo_player_id AND (pl.position <=> p.{position_column_in_players})
                SET pl.team = p.{team_column_in_players}
                WHERE p.yahoo_player_id IS NOT NULL
                  AND (pl.team IS NULL OR pl.team != p.{team_column_in_players})
            """)
            # 3) Same (suffix, normalised_name, position): take latest players row per group
            self.execute_query(f"""
                UPDATE {self.LOOKUP_TABLE} pl
                INNER JOIN (
                    SELECT normalised_name, {position_column_in_players}, SUBSTRING_INDEX(yahoo_player_id, '.', -1) AS yahoo_suffix,
                           MAX(id) AS max_id
                    FROM {table}
                    WHERE yahoo_player_id IS NOT NULL AND normalised_name IS NOT NULL
                    GROUP BY normalised_name, {position_column_in_players}, SUBSTRING_INDEX(yahoo_player_id, '.', -1)
                ) grp ON pl.normalised_name = grp.normalised_name
                    AND (pl.position <=> grp.{position_column_in_players})
                    AND SUBSTRING_INDEX(pl.yahoo_player_id, '.', -1) = grp.yahoo_suffix
                INNER JOIN {table} p ON p.id = grp.max_id
                SET pl.yahoo_player_id = p.yahoo_player_id, pl.team = p.{team_column_in_players}
                WHERE pl.yahoo_player_id IS NULL OR pl.yahoo_player_id != p.yahoo_player_id
                   OR pl.team IS NULL OR pl.team != p.{team_column_in_players}
            """)
            # 4) Match by yahoo_player_id: backfill lookup.position from players when players has it and lookup doesn't
            #    (so update_player_ids_from_lookup_by_yahoo can match on (yahoo_player_id, position) and set player_id)
            self.execute_query(f"""
                UPDATE {self.LOOKUP_TABLE} pl
                INNER JOIN {table} p ON pl.yahoo_player_id = p.yahoo_player_id
                    AND p.{position_column_in_players} IS NOT NULL
                    AND pl.position IS NULL
                LEFT JOIN {self.LOOKUP_TABLE} existing
                    ON existing.player_id = pl.player_id
                    AND existing.position = p.{position_column_in_players}
                    AND existing.id <> pl.id
                SET pl.position = p.{position_column_in_players}
                WHERE existing.id IS NULL
            """)
            logger.info("player_lookup synced from players successfully")
        except Exception as e:
            logger.error("Error syncing lookup from players: %s", e)
            raise

    def update_player_ids_from_lookup_by_yahoo(
        self,
        table: str,
        yahoo_id_column: str = "yahoo_player_id",
        position_column: str = "position",
    ):
        """
        Set player_id on table from player_lookup where (yahoo_player_id, position) match.
        Skips updating when (player_id, position) already exists on another row to avoid
        unique key violation (e.g. two players rows with different yahoo ids both mapping
        to the same lookup player_id).
        """
        logger.info("Updating player ids from lookup by yahoo_player_id for %s", table)
        try:
            update_query = f"""
                UPDATE {table} t
                INNER JOIN {self.LOOKUP_TABLE} pl
                    ON t.{yahoo_id_column} = pl.yahoo_player_id
                    AND (t.{position_column} <=> pl.position)
                LEFT JOIN {table} existing
                    ON existing.player_id = pl.player_id
                    AND (existing.{position_column} <=> t.{position_column})
                    AND existing.id <> t.id
                SET t.player_id = pl.player_id
                WHERE t.player_id IS NULL AND t.{yahoo_id_column} IS NOT NULL
                  AND existing.id IS NULL
            """
            self.execute_query(update_query)
            logger.info("Player ids updated from lookup by yahoo_player_id successfully")
        except Exception as e:
            logger.error("Error updating player ids from lookup by yahoo: %s", e)
            raise

    def consolidate_duplicate_players(self):
        with self.conn.cursor() as cursor:
            cursor.execute(f"""
                DELETE p FROM {self.PLAYERS_TABLE} p
                JOIN (
                    SELECT
                        normalised_name,
                        mlb_team,
                        position,
                        MAX(CASE WHEN team_id IS NOT NULL THEN id ELSE 0 END) AS keep_with_team,
                        MAX(id) AS keep_any
                    FROM {self.PLAYERS_TABLE}
                    GROUP BY normalised_name, mlb_team, position
                    HAVING COUNT(*) > 1
                ) d
                ON p.normalised_name = d.normalised_name
                AND p.mlb_team = d.mlb_team
                AND p.position = d.position
                WHERE
                    (d.keep_with_team > 0 AND p.id <> d.keep_with_team)
                    OR (d.keep_with_team = 0 AND p.id <> d.keep_any)
            """)
            self.conn.commit()
            logger.info("Duplicate players consolidated successfully")

    def get_stale_player_ids(self) -> list[int]:
        with self.conn.cursor() as cursor:
            # Calculate the stale date threshold
            stale_date = datetime.now(timezone.utc) - timedelta(days=self.MAX_STALE_DAYS)
            
            # Subquery 1: From player_game_logs (join on player_id and position)
            cursor.execute(f"""
                SELECT DISTINCT pgl.player_id
                FROM {self.player_game_logs_table} pgl
                LEFT JOIN {self.LOOKUP_TABLE} pl ON pgl.player_id = pl.player_id AND (pgl.position <=> pl.position)
                WHERE pl.status IS NULL OR pl.status IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.bats IS NULL OR pl.bats IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.throws IS NULL OR pl.throws IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.last_updated IS NULL OR pl.last_updated < %s
            """, (stale_date,))
            ids_game_log = [row[0] for row in cursor.fetchall()]

            # Subquery 2: From player_lookup where status, bats, or throws is null or stale
            cursor.execute(f"""
                SELECT DISTINCT pl.player_id
                FROM {self.LOOKUP_TABLE} pl
                WHERE pl.status IS NULL OR pl.status IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.bats IS NULL OR pl.bats IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.throws IS NULL OR pl.throws IN ('', 'unknown', 'N/A', 'Unk')
                    OR pl.last_updated IS NULL OR pl.last_updated < %s
            """, (stale_date,))
            ids_lookup = [row[0] for row in cursor.fetchall()]

        all_ids = ids_lookup + ids_game_log
        return list(set(id for id in all_ids if id is not None))

    def consolidate_duplicate_season_stats(self, table: str) -> None:
        """
        Merge duplicate rows in a season stats table when (normalised_name, position) has
        exactly two rows and player_lookup has exactly one row for that (normalised_name, position).
        Keeps the row with fangraphs_player_id set, copies player_id from the other row, then deletes the other.
        We null the non-keeper's player_id first to avoid unique (player_id, position) violation on update.
        """
        logger.info("Consolidating duplicate season stats for %s", table)
        try:
            self.begin_transaction()
            # 1) Temp table: (keeper_id, pid_from_other) for each duplicate group with single lookup
            self.execute_query_in_transaction(f"""
                CREATE TEMPORARY TABLE _consolidate_keep (keeper_id INT PRIMARY KEY, pid_from_other INT)
            """)
            self.execute_query_in_transaction(f"""
                INSERT INTO _consolidate_keep (keeper_id, pid_from_other)
                SELECT grp.keeper_id, grp.pid_from_other
                FROM (
                    SELECT grp.normalised_name, grp.position,
                           MAX(CASE WHEN t.fangraphs_player_id IS NOT NULL THEN t.id END) AS keeper_id,
                           (SELECT t2.player_id FROM {table} t2
                            WHERE t2.normalised_name = grp.normalised_name AND t2.position = grp.position
                              AND t2.player_id IS NOT NULL
                              AND t2.id <> (SELECT COALESCE(MAX(t3.id), 0) FROM {table} t3
                                            WHERE t3.normalised_name = grp.normalised_name AND t3.position = grp.position
                                              AND t3.fangraphs_player_id IS NOT NULL)
                            LIMIT 1) AS pid_from_other
                    FROM {table} t
                    INNER JOIN (
                        SELECT normalised_name, position
                        FROM {table}
                        GROUP BY normalised_name, position
                        HAVING COUNT(*) = 2
                    ) grp ON t.normalised_name = grp.normalised_name AND t.position = grp.position
                    INNER JOIN (
                        SELECT normalised_name, position
                        FROM {self.LOOKUP_TABLE}
                        GROUP BY normalised_name, position
                        HAVING COUNT(*) = 1
                    ) single_pl ON t.normalised_name = single_pl.normalised_name AND t.position = single_pl.position
                    GROUP BY grp.normalised_name, grp.position
                ) grp
                WHERE grp.keeper_id IS NOT NULL AND grp.pid_from_other IS NOT NULL
            """)
            # 2) Null non-keeper's player_id so unique (player_id, position) is free before we assign it to keeper
            self.execute_query_in_transaction(f"""
                UPDATE {table} t
                INNER JOIN {table} keeper ON keeper.id IN (SELECT keeper_id FROM _consolidate_keep)
                    AND t.normalised_name = keeper.normalised_name AND t.position = keeper.position
                    AND t.id <> keeper.id
                SET t.player_id = NULL
            """)
            # 3) Copy saved player_id onto keeper
            self.execute_query_in_transaction(f"""
                UPDATE {table} t
                INNER JOIN _consolidate_keep c ON t.id = c.keeper_id
                SET t.player_id = COALESCE(t.player_id, c.pid_from_other)
            """)
            # 4) Delete the non-keeper row
            self.execute_query_in_transaction(f"""
                DELETE t FROM {table} t
                INNER JOIN {table} keeper ON keeper.id IN (SELECT keeper_id FROM _consolidate_keep)
                    AND t.normalised_name = keeper.normalised_name AND t.position = keeper.position
                    AND t.id <> keeper.id
            """)
            self.execute_query_in_transaction("DROP TEMPORARY TABLE IF EXISTS _consolidate_keep")
            self.commit_transaction()
            logger.info("Consolidated duplicate season stats for %s", table)
        except Exception as e:
            self.rollback_transaction()
            logger.exception("Error consolidating duplicate season stats for %s: %s", table, e)
            raise

    def hydrate_season_stats_team_and_player_id(
        self,
        table: str,
        valid_teams: set[str] | None = None,
        team_column: str = "team",
    ) -> None:
        """
        Fix team and player_id on season stats using player_lookup (after Yahoo sync).
        - When team is not in valid_teams: update from lookup by (fangraphs_player_id, position)
          or (player_id, position), then set table.team and table.player_id from lookup.
        - For rows still with invalid/missing team or player_id: match by (normalised_name, position)
          only when both lookup and this table have exactly one row for that pair (unambiguous);
          then update team and player_id from lookup. Avoids e.g. two "Max Muncy" B rows both
          getting the same player_id and violating unique (player_id, position).
        """
        if valid_teams is None:
            valid_teams = set(MLB_TEAM_IDS.keys())
        logger.info("Hydrating season stats team and player_id from lookup for %s", table)
        valid_teams_list = ",".join(repr(t) for t in valid_teams)
        try:
            # 1a) Rows where team not in valid_teams: update from lookup by (fangraphs_player_id, position)
            self.execute_query(f"""
                UPDATE {table} t
                INNER JOIN {self.LOOKUP_TABLE} pl
                    ON t.fangraphs_player_id IS NOT NULL AND pl.fangraphs_player_id = t.fangraphs_player_id AND (t.position <=> pl.position)
                SET t.{team_column} = pl.team, t.player_id = COALESCE(t.player_id, pl.player_id)
                WHERE (t.{team_column} IS NULL OR t.{team_column} NOT IN ({valid_teams_list}))
                  AND pl.team IS NOT NULL
            """)
            # 1b) Rows where team not in valid_teams: update from lookup by (player_id, position)
            self.execute_query(f"""
                UPDATE {table} t
                INNER JOIN {self.LOOKUP_TABLE} pl
                    ON t.player_id IS NOT NULL AND pl.player_id = t.player_id AND (t.position <=> pl.position)
                SET t.{team_column} = pl.team
                WHERE (t.{team_column} IS NULL OR t.{team_column} NOT IN ({valid_teams_list}))
                  AND pl.team IS NOT NULL
            """)
            # 2) Rows still with bad/missing team or player_id: match by (normalised_name, position) only when
            #    both lookup and this table have exactly one row for that pair (unambiguous match).
            self.execute_query(f"""
                UPDATE {table} t
                INNER JOIN {self.LOOKUP_TABLE} pl ON t.normalised_name = pl.normalised_name AND (t.position <=> pl.position)
                INNER JOIN (
                    SELECT normalised_name, position
                    FROM {self.LOOKUP_TABLE}
                    GROUP BY normalised_name, position
                    HAVING COUNT(*) = 1
                ) single_pl ON pl.normalised_name = single_pl.normalised_name AND (pl.position <=> single_pl.position)
                INNER JOIN (
                    SELECT normalised_name, position
                    FROM {table}
                    GROUP BY normalised_name, position
                    HAVING COUNT(*) = 1
                ) single_t ON t.normalised_name = single_t.normalised_name AND (t.position <=> single_t.position)
                SET t.{team_column} = COALESCE(NULLIF(t.{team_column}, ''), pl.team), t.player_id = COALESCE(t.player_id, pl.player_id)
                WHERE (t.{team_column} IS NULL OR t.{team_column} NOT IN ({valid_teams_list}) OR t.player_id IS NULL)
                  AND pl.team IS NOT NULL
            """)
            logger.info("Hydrated season stats team and player_id for %s", table)
        except Exception as e:
            logger.exception("Error hydrating season stats for %s: %s", table, e)
            raise