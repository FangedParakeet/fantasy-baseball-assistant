import type { QueryableDB } from '../db/db';

class Hydrator {
    private db: QueryableDB;
    private players_table: string;
    private player_lookup_table: string;

    constructor(db: QueryableDB) {
        this.players_table = 'players';
        this.player_lookup_table = 'player_lookup';
        this.db = db;
    }

    async hydratePlayerIds(): Promise<void> {
		// First, collapse duplicate players that represent the same real-world player.
		// We identify duplicates by (normalised_name, mlb_team, position) and:
		// - Prefer to keep the most recent row with a non-null team_id (rostered),
		// - Otherwise, keep the most recent row overall.
		await this.db.query(`
			DELETE p FROM ${this.players_table} p
			JOIN (
				SELECT
					normalised_name,
					mlb_team,
					position,
					MAX(CASE WHEN team_id IS NOT NULL THEN id ELSE 0 END) AS keep_with_team,
					MAX(id) AS keep_any
				FROM ${this.players_table}
				GROUP BY normalised_name, mlb_team, position
				HAVING COUNT(*) > 1
			) d
			  ON p.normalised_name = d.normalised_name
			 AND p.mlb_team = d.mlb_team
			 AND p.position = d.position
			WHERE
				(d.keep_with_team > 0 AND p.id <> d.keep_with_team)
				OR (d.keep_with_team = 0 AND p.id <> d.keep_any)
		`);

        await this.db.query(`
            UPDATE ${this.players_table} p
            JOIN ${this.player_lookup_table} pl
                ON pl.normalised_name = p.normalised_name AND pl.team = p.mlb_team AND (pl.position <=> p.position)
            SET p.player_id = pl.player_id
            WHERE p.player_id IS NULL
        `);
    }
}

export default Hydrator;