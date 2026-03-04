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
    leagueId: number;
    name: string;
    isActive: boolean;
    budgetTotal: number;
    teamCount: number;
    createdAt: Date;
}

type DraftDB = {
    id: number;
    leagueId: number;
    name: string;
    isActive: boolean;
    createdAt: Date;
}

/** Runtime type for each DraftDB key, used to validate and sanitise condition values. */
const DRAFT_DB_KEY_TYPE: { [K in keyof DraftDB]: 'number' | 'string' | 'boolean' | 'date' } = {
    id: 'number',
    leagueId: 'number',
    name: 'string',
    isActive: 'boolean',
    createdAt: 'date',
};

class Draft {
    private db: QueryableDB;
    private draftsTable: string = 'drafts';
    private draftsTableAlias: string = 'd';
    private draftsSelectColumns: string[] = ['id', 'leagueId', 'name', 'isActive', 'createdAt'];
    private draftTeamsTable: string = 'draft_teams';
    private draftTeamsTableAlias: string = 'dt';
    private leagueSettingsTable: string = 'league_settings';
    private leagueSettingsTableAlias: string = 'ls';
    private teamsTable: string = 'teams';
    private teamsTableAlias: string = 't';


    constructor(db: QueryableDB) {
        this.db = db;
    }

    async getActiveDraft(): Promise<DraftResponse> {
        const draft = await this.getDraftByCondition({ key: 'isActive', value: true });
        if (!draft) {
            throw new Error('No active draft found');
        }
        return draft;
    }

    async getDraftById(draftId: number): Promise<DraftResponse> {
        const draft = await this.getDraftByCondition({ key: 'id', value: draftId });
        if (!draft) {
            throw new Error('Draft not found');
        }
        return draft;
    }

    async setActiveDraft(draftId: number): Promise<void> {
        const activeDraft = await this.getActiveDraft();
        if (activeDraft) {
            throw new Error('Active draft already exists');
        }
        await this.db.query<ResultSetHeader>(`
            UPDATE ${this.draftsTable} SET is_active = ? WHERE id = ?
        `, [false, draftId]);
        return;
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

    private async getDraftByCondition<K extends keyof DraftDB>(condition: { key: K; value: DraftDB[K] }): Promise<DraftResponse | null> {
        if (!this.draftsSelectColumns.includes(condition.key)) {
            throw new Error(`Invalid condition: ${condition.key}`);
        }
        const sanitised = this.sanitiseConditionValue(condition.key, condition.value);
        const draftSelectColumns = this.draftsSelectColumns.map((column) => `${this.draftsTableAlias}.${column} as ${column}`).join(', ');
        const [draft] = await this.db.query<DraftResponse[]>(`
            SELECT 
                ${draftSelectColumns}, 
                ${this.leagueSettingsTableAlias}.budget_total as budget_total, 
                ${this.leagueSettingsTableAlias}.team_count as team_count
            FROM ${this.draftsTable} ${this.draftsTableAlias}
            INNER JOIN ${this.leagueSettingsTable} ${this.leagueSettingsTableAlias}
                ON ${this.draftsTableAlias}.league_id = ${this.leagueSettingsTableAlias}.league_id
            WHERE ${this.draftsTableAlias}.${condition.key} = ?
        `, [sanitised]);
        return draft[0] ?? null;
    }
}

export default Draft;