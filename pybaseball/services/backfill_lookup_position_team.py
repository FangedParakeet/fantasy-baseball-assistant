"""
Backfill player_lookup rows that have player_id but missing position or team.
Fetches position (B/P) and current team from the MLB Stats API and updates one row per
player_id (the row with the smallest id) to avoid duplicate (player_id, position).

If you have multiple lookup rows for the same player_id with nulls, only one is
updated per run; you can run again to fill more after cleaning duplicates, or
merge/delete the extra rows manually.

Run from project root:
  PYTHONPATH=pybaseball python -m services.backfill_lookup_position_team
"""
from models.db import get_db_connection
from models.api.mlb_api import MlbApi
from models.player_lookups import PlayerLookups
from utils.constants import MLB_TEAM_IDS_REVERSE_MAP
from utils.logger import logger


def main():
    conn = None
    try:
        conn = get_db_connection()
        lookups = PlayerLookups(conn)
        mlb_api = MlbApi()

        # One row per player_id to update (avoid duplicate player_id+position)
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT player_id, MIN(id) AS id
            FROM {lookups.LOOKUP_TABLE}
            WHERE (position IS NULL OR team IS NULL) AND player_id IS NOT NULL
            GROUP BY player_id
            """
        )
        rows = cursor.fetchall()
        cursor.close()

        if not rows:
            logger.info("No player_lookup rows with missing position or team.")
            return

        player_ids = [r[0] for r in rows]
        id_by_player_id = {r[0]: r[1] for r in rows}
        logger.info("Fetching position/team from MLB API for %s players", len(player_ids))

        people = mlb_api.get_player_info(player_ids, hydrate="currentTeam")
        if not people:
            logger.warning("No people data returned from MLB API")
            return

        updated = 0
        for person in people:
            pid = person.get("id")
            if pid is None or pid not in id_by_player_id:
                continue
            lookup_id = id_by_player_id[pid]

            primary = person.get("primaryPosition") or {}
            abbr = (primary.get("abbreviation") or "").strip().upper()
            position = "P" if abbr == "P" else "B"

            team = None
            current_team = person.get("currentTeam")
            if current_team and isinstance(current_team, dict):
                team_id = current_team.get("id")
                if team_id is not None:
                    team = MLB_TEAM_IDS_REVERSE_MAP.get(team_id)

            cursor = conn.cursor()
            cursor.execute(
                f"""
                UPDATE {lookups.LOOKUP_TABLE}
                SET position = COALESCE(position, %s), team = COALESCE(team, %s)
                WHERE id = %s
                """,
                (position, team, lookup_id),
            )
            if cursor.rowcount:
                updated += 1
                logger.debug(
                    "Updated lookup id=%s player_id=%s -> position=%s team=%s",
                    lookup_id,
                    pid,
                    position,
                    team,
                )
            cursor.close()

        conn.commit()
        logger.info(
            "Backfill complete: updated %s of %s player_lookup rows (one per player_id)",
            updated,
            len(rows),
        )
    except Exception as e:
        if conn:
            conn.rollback()
        logger.exception("Error backfilling lookup position/team: %s", e)
        raise
    finally:
        if conn:
            conn.close()
            logger.info("Database connection closed.")


if __name__ == "__main__":
    main()
