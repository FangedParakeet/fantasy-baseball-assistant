import { QueryableDB } from "../db/db";
import { ResultSetHeader } from "mysql2";
import { parseNumber, parseBooleanStrict, parseString, parseDate } from "../utils/functions";

export type DraftRequest = {
    id: number | null;
    leagueId: number;
    name: string;
    isActive: boolean;
}

export type DraftResponse = {
    id: number;
    league_id: number;
    name: string;
    is_active: boolean;
    budget_total: number;
    team_count: number;
    created_at: Date;
}

type DraftDB = {
    id: number;
    league_id: number;
    name: string;
    is_active: boolean;
    created_at: Date;
}

export type Keeper = {
    player_id: number;
    cost: number;
    locked_slot_code: string | null;
    note: string | null;
}

/** Runtime type for each DraftDB key, used to validate and sanitise condition values. */
const DRAFT_DB_KEY_TYPE: { [K in keyof DraftDB]: 'number' | 'string' | 'boolean' | 'date' } = {
    id: 'number',
    league_id: 'number',
    name: 'string',
    is_active: 'boolean',
    created_at: 'date',
};

class Draft {
    private db: QueryableDB;
    private draftsTable: string = 'drafts';
    private draftsTableAlias: string = 'd';
    private draftsSelectColumns: string[] = ['id', 'league_id', 'name', 'is_active', 'created_at'];
    private draftTeamsTable: string = 'draft_teams';
    private draftTeamsTableAlias: string = 'dt';
    private leagueSettingsTable: string = 'league_settings';
    private leagueSettingsTableAlias: string = 'ls';
    private teamsTable: string = 'teams';
    private teamsTableAlias: string = 't';
    private draftKeepersTable: string = 'draft_keepers';
    private draftKeepersTableAlias: string = 'dk';


    constructor(db: QueryableDB) {
        this.db = db;
    }

    async getDraftsByLeagueId(leagueId: number): Promise<DraftResponse[]> {
        return this.getDraftsByCondition({ key: 'league_id', value: leagueId });
    }

    async getActiveDraft(): Promise<DraftResponse> {
        const drafts = await this.getDraftsByCondition({ key: 'is_active', value: true });
        if (drafts.length === 0) {
            throw new Error('No active draft found');
        }
        return drafts[0];
    }

    async getDraftById(draftId: number): Promise<DraftResponse> {
        const drafts = await this.getDraftsByCondition({ key: 'id', value: draftId });
        if (drafts.length === 0) {
            throw new Error('Draft not found');
        }
        return drafts[0];
    }

    async setActiveDraft(draftId: number): Promise<void> {
        const drafts = await this.getDraftsByCondition({ key: 'id', value: draftId });
        if (drafts.length === 0) {
            throw new Error('Draft not found');
        }
        const leagueId = drafts[0].league_id;
        await this.deactivateActiveDrafts(leagueId);
        await this.db.query<ResultSetHeader>(`
            UPDATE ${this.draftsTable} SET is_active = ? WHERE id = ?
        `, [true, draftId]);
    }

    async deactivateActiveDrafts(leagueId: number): Promise<void> {
        await this.db.query<ResultSetHeader>(`
            UPDATE ${this.draftsTable} SET is_active = ? WHERE is_active = ? AND league_id = ?
        `, [false, true, leagueId]);
        return;
    }

    async deleteDraft(draftId: number): Promise<void> {
        const drafts = await this.getDraftsByCondition({ key: 'id', value: draftId });
        if (drafts.length === 0) {
            throw new Error('Draft not found');
        }
        await this.db.query<ResultSetHeader>(`DELETE FROM ${this.draftsTable} WHERE id = ?`, [draftId]);
    }

    /** Resolves league team id to draft_teams.id for use in keepers. */
    async getDraftTeamIdByLeagueTeamId(draftId: number, leagueTeamId: number): Promise<number> {
        const [rows] = await this.db.query<{ id: number }[]>(
            `SELECT id FROM ${this.draftTeamsTable} WHERE draft_id = ? AND team_id = ?`,
            [draftId, leagueTeamId]
        );
        if (!rows?.length) {
            throw new Error('Draft team not found for this league team');
        }
        return rows[0].id;
    }

    async getKeepersForTeam(draftId: number, draftTeamId: number): Promise<Keeper[]> {
        const [keepers] = await this.db.query<Keeper[]>(`
            SELECT player_pk AS player_id, cost, locked_slot_code, note FROM ${this.draftKeepersTable} WHERE draft_id = ? AND draft_team_id = ?
        `, [draftId, draftTeamId]);
        return keepers ?? [];
    }

    async setKeepersForTeam(draftId: number, draftTeamId: number, keepers: Keeper[]): Promise<void> {
        await this.db.query<ResultSetHeader>(`
            DELETE FROM ${this.draftKeepersTable} WHERE draft_id = ? AND draft_team_id = ?
        `, [draftId, draftTeamId]);

        if (keepers.length > 0) {
            const values = keepers.map((keeper) => [draftId, draftTeamId, keeper.player_id, keeper.cost, keeper.locked_slot_code ?? null, keeper.note ?? null]);
            await this.db.query<ResultSetHeader>(`
                INSERT INTO ${this.draftKeepersTable} (draft_id, draft_team_id, player_pk, cost, locked_slot_code, note)
                VALUES ${values.map(() => '(?, ?, ?, ?, ?, ?)').join(',')}
            `, values.flat());
        }
    }

    async upsertDraft(draftRequest: DraftRequest): Promise<void> {
        if (draftRequest.id) {
            await this.updateDraft(draftRequest);
        } else {
            await this.createDraft(draftRequest);
        }
    }

    async createDraft(draftRequest: DraftRequest): Promise<void> {
        const [insertResult] = await this.db.query<ResultSetHeader>(
            `INSERT INTO ${this.draftsTable} (league_id, name, is_active) VALUES (?, ?, ?)`,
            [draftRequest.leagueId, draftRequest.name, draftRequest.isActive]
        );
        const draftId = insertResult.insertId;
        if (draftId === undefined || draftId === 0) {
            throw new Error('Failed to create draft');
        }

        await this.db.query<ResultSetHeader>(`
            INSERT INTO ${this.draftTeamsTable} (draft_id, team_id, budget_total, is_user_team)
            SELECT 
                ?,
                ${this.teamsTableAlias}.id,
                ${this.leagueSettingsTableAlias}.budget_total,
                ${this.teamsTableAlias}.is_user_team
            FROM ${this.teamsTable} ${this.teamsTableAlias}
            INNER JOIN ${this.draftsTable} ${this.draftsTableAlias}
                ON ${this.draftsTableAlias}.id = ?
            INNER JOIN ${this.leagueSettingsTable} ${this.leagueSettingsTableAlias}
                ON ${this.leagueSettingsTableAlias}.league_id = ${this.draftsTableAlias}.league_id
            `,
            [draftId, draftId]
        );
    }

    async updateDraft(draftRequest: DraftRequest): Promise<void> {
        await this.db.query<ResultSetHeader>(
            `UPDATE ${this.draftsTable} SET name = ?, is_active = ? WHERE id = ?`,
            [draftRequest.name, draftRequest.isActive, draftRequest.id]
        );

        await this.db.query<ResultSetHeader>(`
            UPDATE ${this.draftTeamsTable} ${this.draftTeamsTableAlias}
            INNER JOIN ${this.draftsTable} ${this.draftsTableAlias}
                ON ${this.draftsTableAlias}.id = ${this.draftTeamsTableAlias}.draft_id
            INNER JOIN ${this.leagueSettingsTable} ${this.leagueSettingsTableAlias}
                ON ${this.leagueSettingsTableAlias}.league_id = ${this.draftsTableAlias}.league_id
            SET ${this.draftTeamsTableAlias}.budget_total = ${this.leagueSettingsTableAlias}.budget_total
            WHERE ${this.draftTeamsTableAlias}.draft_id = ?
            `,
            [draftRequest.id]
        );
    }

    /**
     * Validates that value matches the type for key and returns a sanitised value safe for SQL binding.
     */
    private sanitiseConditionValue<K extends keyof DraftDB>(key: K, value: unknown): DraftDB[K] {
        const expected = DRAFT_DB_KEY_TYPE[key];
        const field = String(key);
        switch (expected) {
            case 'number': {
                const n = parseNumber(value, field);
                if (n == null) throw new Error(`${field} is required`);
                return n as DraftDB[K];
            }
            case 'string':
                return parseString(value, field) as DraftDB[K];
            case 'boolean':
                return parseBooleanStrict(value, field) as DraftDB[K];
            case 'date':
                return parseDate(value, field) as DraftDB[K];
            default:
                throw new Error(`Unknown key type for ${key}`);
        }
    }

    private async getDraftsByCondition<K extends keyof DraftDB>(condition: { key: K; value: DraftDB[K] }): Promise<DraftResponse[] | []> {
        if (!this.draftsSelectColumns.includes(condition.key)) {
            throw new Error(`Invalid condition: ${condition.key}`);
        }
        const sanitised = this.sanitiseConditionValue(condition.key, condition.value);
        const draftSelectColumns = this.draftsSelectColumns.map((column) => `${this.draftsTableAlias}.${column} as ${column}`).join(', ');
        const [drafts] = await this.db.query<DraftResponse[]>(`
            SELECT 
                ${draftSelectColumns}, 
                ${this.leagueSettingsTableAlias}.budget_total as budget_total, 
                ${this.leagueSettingsTableAlias}.team_count as team_count
            FROM ${this.draftsTable} ${this.draftsTableAlias}
            INNER JOIN ${this.leagueSettingsTable} ${this.leagueSettingsTableAlias}
                ON ${this.draftsTableAlias}.league_id = ${this.leagueSettingsTableAlias}.league_id
            WHERE ${this.draftsTableAlias}.${condition.key} = ?
        `, [sanitised]);
        return drafts ?? [];
    }
}

export default Draft;