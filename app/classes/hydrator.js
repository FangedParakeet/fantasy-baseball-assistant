const { db } = require('../db');

class Hydrator {
    constructor() {
        this.players_table = 'players';
        this.player_lookup_table = 'player_lookup';
    }

    async hydratePlayerIds() {
        await db.query(`
            UPDATE ${this.players_table} p
            JOIN ${this.player_lookup_table} pl 
                ON pl.normalised_name = p.normalised_name AND pl.team = p.mlb_team
            SET p.player_id = pl.player_id
            WHERE p.player_id IS NULL
        `);
    }
}

module.exports = Hydrator;