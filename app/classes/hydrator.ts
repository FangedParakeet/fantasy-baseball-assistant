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
        await this.db.query(`
            UPDATE ${this.players_table} p
            JOIN ${this.player_lookup_table} pl 
                ON pl.normalised_name = p.normalised_name AND pl.team = p.mlb_team
            SET p.player_id = pl.player_id
            WHERE p.player_id IS NULL
        `);
    }
}

export default Hydrator;