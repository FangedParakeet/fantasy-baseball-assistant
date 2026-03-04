import { QueryableDB } from "../db/db";
import { ResultSetHeader } from "mysql2";

type HitterPosition = 'C' | '1B' | '2B' | '3B' | 'SS' | 'OF' | 'UTIL';
type PitcherPosition = 'SP' | 'RP' | 'P';
type BenchPosition = 'BN';
type ILPosition = 'IL';
type NAPosition = 'NA';
type Position = HitterPosition | PitcherPosition | BenchPosition | ILPosition | NAPosition;

function toGroupMap<K extends string, G extends string>(keys: readonly K[], group: G): Record<K, G> {
    return Object.fromEntries(keys.map((k) => [k, group])) as Record<K, G>;
}

const HITTER_POSITIONS: readonly HitterPosition[] = ['C', '1B', '2B', '3B', 'SS', 'OF', 'UTIL'];
const PITCHER_POSITIONS: readonly PitcherPosition[] = ['SP', 'RP', 'P'];
const BENCH_POSITIONS: readonly BenchPosition[] = ['BN'];
const IL_POSITIONS: readonly ILPosition[] = ['IL'];
const NA_POSITIONS: readonly NAPosition[] = ['NA'];

type PositionGroup = 'hitter' | 'pitcher' | 'bench' | 'il' | 'na';
const POSITION_GROUP: Record<Position, PositionGroup> = {
    ...toGroupMap(HITTER_POSITIONS, 'hitter'),
    ...toGroupMap(PITCHER_POSITIONS, 'pitcher'),
    ...toGroupMap(BENCH_POSITIONS, 'bench'),
    ...toGroupMap(IL_POSITIONS, 'il'),
    ...toGroupMap(NA_POSITIONS, 'na'),
} as Record<Position, PositionGroup>;

type HitterCategory = 'AB' | 'H' | 'R' | 'RBI' | 'AVG' | 'HR' | 'SB';
type PitcherCategory = 'IP' | 'K' | 'ERA' | 'WHIP' | 'QS' | 'SV' | 'HLD' | 'SVH';
type CategoryCode = HitterCategory | PitcherCategory;

const HITTER_CATEGORIES: readonly HitterCategory[] = ['AB', 'H', 'R', 'RBI', 'AVG', 'HR', 'SB'];
const PITCHER_CATEGORIES: readonly PitcherCategory[] = ['IP', 'K', 'ERA', 'WHIP', 'QS', 'SV', 'HLD', 'SVH'];

type CategoryGroup = 'hitter' | 'pitcher';
const CATEGORY_GROUP: Record<CategoryCode, CategoryGroup> = {
    ...toGroupMap(HITTER_CATEGORIES, 'hitter'),
    ...toGroupMap(PITCHER_CATEGORIES, 'pitcher'),
};

type PositionSorting = Record<Position, number>;
const POSITION_SORT_ORDER: PositionSorting = {
    'C': 1,
    '1B': 2,
    '2B': 3,
    '3B': 4,
    'SS': 5,
    'OF': 6,
    'UTIL': 7,
    'SP': 8,
    'RP': 9,
    'P': 10,
    'BN': 11,
    'IL': 12,
    'NA': 13,
};
type CategoryCodeSorting = Record<CategoryCode, number>;
const CATEGORY_CODE_SORT_ORDER: CategoryCodeSorting = {
    'AB': 1,
    'H': 2,
    'R': 3,
    'RBI': 4,
    'AVG': 5,
    'HR': 6,
    'SB': 7,
    'IP': 8,
    'K': 9,
    'ERA': 10,
    'WHIP': 11,
    'QS': 10,
    'SV': 11,
    'HLD': 12,
    'SVH': 13,
};

export type RosterSlot = {
    position: Position;
    count:number;
    countsTowardsRemainingRoster: boolean;
}

export type ScoringCategory = {
    code: CategoryCode;
    weight: number;
    isEnabled?: boolean;
}

export type LeagueRequest = {
    id: number | null;
    name: string;
    seasonYear?: number | null;
    budgetTotal: number;
    teamCount: number;
    hitterBudgetPct: number;
    pitcherBudgetPct: number;
    rosterSlots: RosterSlot[];
    scoringCategories: ScoringCategory[];
}

type LeagueDB = {
    id: number;
    name: string;
    season_year?: number | null;
}
type LeagueSettingsDB = {
    id: number;
    league_id: number;
    budget_total: number;
    team_count: number;
    hitter_budget_pct: number;
    pitcher_budget_pct: number;
}
type LeagueRosterSlotsDB = {
    id: number;
    league_id: number;
    slot_code: string;
    slot_count: number;
    slot_group: string;
    sort_order: number;
    counts_toward_remaining_roster: boolean;
}
type LeagueScoringCategoriesDB = {
    id: number;
    league_id: number;
    category_code: string;
    category_group: string;
    weight: number;
    is_enabled: boolean;
    sort_order: number;
}

type RosterSlotResponse = {
    slot_code: Position;
    slot_count:number;
    sort_order: number;
    counts_toward_remaining_roster: boolean;
}
type ScoringCategoryResponse = {
    category_code: CategoryCode;
    weight: number;
    is_enabled: boolean;
    sort_order: number;
}
export type LeagueSettingsResponse = {
    id: number;
    name: string;
    season_year: number | null;
    budget_total: number;
    team_count: number;
    hitter_budget_pct: number;
    pitcher_budget_pct: number;
    roster_slots: RosterSlotResponse[];
    scoring_categories: ScoringCategoryResponse[];
}


class League {
    private db: QueryableDB;
    private leaguesTable: string;
    private leaguesTableAlias: string;
    private leagueSelectColumns: string[];
    private leagueSettingsTable: string;
    private leagueSettingsTableAlias: string;
    private leagueSettingsSelectColumns: string[];
    private leagueRosterSlotsTable: string;
    private leagueRosterSlotsSelectColumns: string[];
    private leagueScoringCategoriesTable: string;
    private leagueScoringCategoriesSelectColumns: string[];

    constructor(db: QueryableDB) {
        this.db = db;
        this.leaguesTable = 'leagues';
        this.leaguesTableAlias = 'l';
        this.leagueSelectColumns = ['id', 'name', 'season_year'];
        this.leagueSettingsTable = 'league_settings';
        this.leagueSettingsSelectColumns = ['budget_total', 'team_count', 'hitter_budget_pct', 'pitcher_budget_pct'];
        this.leagueSettingsTableAlias = 'ls';
        this.leagueRosterSlotsTable = 'league_roster_slots';
        this.leagueRosterSlotsSelectColumns = ['slot_code', 'slot_count', 'sort_order', 'counts_toward_remaining_roster'];
        this.leagueScoringCategoriesTable = 'league_scoring_categories';
        this.leagueScoringCategoriesSelectColumns = ['category_code', 'weight', 'is_enabled', 'sort_order'];
    }

    async getLeague(): Promise<LeagueDB> {
        const [leagues] = await this.db.query<LeagueDB[]>(`SELECT ${this.leagueSelectColumns.join(', ')} FROM ${this.leaguesTable}`);
        if (!leagues || leagues.length === 0) {
            throw new Error('No league found');
        }
        return leagues[0];
    }

    async getLeagueSettings(): Promise<LeagueSettingsResponse> {
        const leagueSelectColumns = this.leagueSelectColumns.map((column) => `${this.leaguesTableAlias}.${column} as ${column}`).join(', ');
        const leagueSettingsSelectColumns = this.leagueSettingsSelectColumns.map((column) => `${this.leagueSettingsTableAlias}.${column} as ${column}`).join(', ');
        const [leagueSettings] = await this.db.query<Partial<LeagueSettingsResponse>[]>(`
            SELECT 
                ${leagueSelectColumns}, 
                ${leagueSettingsSelectColumns} 
            FROM ${this.leaguesTable} ${this.leaguesTableAlias}
            LEFT JOIN ${this.leagueSettingsTable} ${this.leagueSettingsTableAlias} ON 
                ${this.leaguesTableAlias}.id = ${this.leagueSettingsTableAlias}.league_id
        `);
        if (!leagueSettings || leagueSettings.length === 0) {
            throw new Error('No league settings found');
        }
        const leagueSetting = leagueSettings[0];

        const [rosterSlots] = await this.db.query<RosterSlotResponse[]>(`
            SELECT
                ${this.leagueRosterSlotsSelectColumns.join(', ')}
            FROM ${this.leagueRosterSlotsTable}
            WHERE league_id = ?
        `, [leagueSetting.id]);
        if (!rosterSlots || rosterSlots.length === 0) {
            throw new Error('No roster slots found');
        }

        const [scoringCategories] = await this.db.query<ScoringCategoryResponse[]>(`
            SELECT
                ${this.leagueScoringCategoriesSelectColumns.join(', ')}
            FROM ${this.leagueScoringCategoriesTable}
            WHERE league_id = ?
        `, [leagueSetting.id]);
        if (!scoringCategories || scoringCategories.length === 0) {
            throw new Error('No scoring categories found');
        }

        return {
            ...leagueSetting,
            roster_slots: rosterSlots,
            scoring_categories: scoringCategories,
        } as LeagueSettingsResponse;
    }

    async upsertLeague(leagueRequest: LeagueRequest): Promise<void> {
        if (leagueRequest.id) {
            await this.updateLeague(leagueRequest.id, leagueRequest);
        } else {
            const [leagues] = await this.db.query<LeagueDB[]>(
                `SELECT id FROM ${this.leaguesTable}`,
            );
            if (leagues && leagues.length > 0) {
                await this.updateLeague(leagues[0].id, leagueRequest);
            } else {
                await this.createLeague(leagueRequest);
            }
            return;
        }
        return;
    }

    async createLeague(leagueRequest: LeagueRequest): Promise<void> {
        const [leagueInsertResult] = await this.db.query<ResultSetHeader>(
            `INSERT INTO ${this.leaguesTable} (name, season_year) VALUES (?, ?)`,
            [leagueRequest.name, leagueRequest.seasonYear ?? null] as Partial<LeagueDB>[]
        );
        const leagueId = leagueInsertResult.insertId;
        await this.db.query<ResultSetHeader>(
            `INSERT INTO ${this.leagueSettingsTable} (league_id, budget_total, team_count, hitter_budget_pct, pitcher_budget_pct) VALUES (?, ?, ?, ?, ?)`,
            [leagueId, leagueRequest.budgetTotal, leagueRequest.teamCount, leagueRequest.hitterBudgetPct, leagueRequest.pitcherBudgetPct] as Partial<LeagueSettingsDB>[]
        );

        const rosterSlots: Partial<LeagueRosterSlotsDB>[] = leagueRequest.rosterSlots.map((slot: RosterSlot) => ({
            slot_code: slot.position.toUpperCase(),
            slot_count: slot.count,
            slot_group: this.getGroupFromPosition(slot.position),
            sort_order: this.getSortOrderFromPosition(slot.position),
            counts_toward_remaining_roster: slot.countsTowardsRemainingRoster ?? true,
        }));
        await this.db.query<ResultSetHeader>(
            `INSERT INTO ${this.leagueRosterSlotsTable} (league_id, slot_code, slot_count, slot_group, sort_order, counts_toward_remaining_roster) 
                VALUES ${rosterSlots.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}`,
            rosterSlots.flatMap((slot: Partial<LeagueRosterSlotsDB>) => [
                leagueId, 
                slot.slot_code, 
                slot.slot_count, 
                slot.slot_group, 
                slot.sort_order, 
                slot.counts_toward_remaining_roster
            ])
        );

        const scoringCategories: Partial<LeagueScoringCategoriesDB>[] = leagueRequest.scoringCategories.map((category: ScoringCategory) => ({
            category_code: category.code.toUpperCase(),
            category_group: this.getGroupFromCategoryCode(category.code),
            weight: category.weight,
            is_enabled: category.isEnabled ?? true,
            sort_order: this.getSortOrderFromCategoryCode(category.code),
        }));
        await this.db.query<ResultSetHeader>(
            `INSERT INTO ${this.leagueScoringCategoriesTable} (league_id, category_code, category_group, weight, is_enabled, sort_order) 
                VALUES ${scoringCategories.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}`,
            scoringCategories.flatMap((category: Partial<LeagueScoringCategoriesDB>) => [
                leagueId, 
                category.category_code, 
                category.category_group, 
                category.weight, 
                category.is_enabled ?? true, 
                category.sort_order
            ])
        );
        return;
    }

    async updateLeague(id: number, leagueRequest: LeagueRequest): Promise<void> {
        await this.db.query<ResultSetHeader>(
            `UPDATE ${this.leaguesTable} SET name = ?, season_year = ? WHERE id = ?`,
            [leagueRequest.name, leagueRequest.seasonYear ?? null, id] as Partial<LeagueDB>[]
        );
        await this.db.query<ResultSetHeader>(`
            UPDATE ${this.leagueSettingsTable} SET budget_total = ?, team_count = ?, hitter_budget_pct = ?, pitcher_budget_pct = ? WHERE league_id = ?`,
            [leagueRequest.budgetTotal, leagueRequest.teamCount, leagueRequest.hitterBudgetPct, leagueRequest.pitcherBudgetPct, id] as Partial<LeagueSettingsDB>[]
        );

        const rosterSlots: Partial<LeagueRosterSlotsDB>[] = leagueRequest.rosterSlots.map((slot: RosterSlot) => ({
            slot_code: slot.position.toUpperCase(),
            slot_count: slot.count,
            slot_group: this.getGroupFromPosition(slot.position),
            sort_order: this.getSortOrderFromPosition(slot.position),
            counts_toward_remaining_roster: slot.countsTowardsRemainingRoster,
        }));
        await this.db.query<ResultSetHeader>(`
            INSERT INTO ${this.leagueRosterSlotsTable} (league_id, slot_code, slot_count, slot_group, sort_order, counts_toward_remaining_roster) 
            VALUES ${rosterSlots.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}
            ON DUPLICATE KEY UPDATE
                slot_count = VALUES(slot_count),
                counts_toward_remaining_roster = VALUES(counts_toward_remaining_roster)
            `,
            rosterSlots.flatMap((slot: Partial<LeagueRosterSlotsDB>) => [
                id, 
                slot.slot_code, 
                slot.slot_count, 
                slot.slot_group, 
                slot.sort_order, 
                slot.counts_toward_remaining_roster
            ])
        );

        const scoringCategories: Partial<LeagueScoringCategoriesDB>[] = leagueRequest.scoringCategories.map((category: ScoringCategory) => ({
            category_code: category.code.toUpperCase(),
            category_group: this.getGroupFromCategoryCode(category.code),
            weight: category.weight,
            is_enabled: category.isEnabled ?? true,
            sort_order: this.getSortOrderFromCategoryCode(category.code),
        }));
        await this.db.query<ResultSetHeader>(`
            INSERT INTO ${this.leagueScoringCategoriesTable} (league_id, category_code, category_group, weight, is_enabled, sort_order) 
            VALUES ${scoringCategories.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}
            ON DUPLICATE KEY UPDATE
                weight = VALUES(weight),
                is_enabled = VALUES(is_enabled),
                sort_order = VALUES(sort_order)
            `,
            scoringCategories.flatMap((category: Partial<LeagueScoringCategoriesDB>) => [
                id, 
                category.category_code, 
                category.category_group, 
                category.weight, 
                category.is_enabled ?? true, 
                category.sort_order
            ])
        );
        return;
    }

    private getGroupFromPosition(position: Position): PositionGroup {
        if (position.toUpperCase() in POSITION_GROUP) {
            return POSITION_GROUP[position.toUpperCase() as Position];
        }
        throw new Error(`Invalid position: ${position}`);
    }

    private getSortOrderFromPosition(position: Position): number {
        if (position.toUpperCase() in POSITION_SORT_ORDER) {
            return POSITION_SORT_ORDER[position.toUpperCase() as Position];
        }
        throw new Error(`Invalid position: ${position}`);
    }

    private getGroupFromCategoryCode(categoryCode: CategoryCode): CategoryGroup {
        if (categoryCode.toUpperCase() in CATEGORY_GROUP) {
            return CATEGORY_GROUP[categoryCode.toUpperCase() as CategoryCode];
        }
        throw new Error(`Invalid category code: ${categoryCode}`);
    }

    private getSortOrderFromCategoryCode(categoryCode: CategoryCode): number {
        if (categoryCode.toUpperCase() in CATEGORY_CODE_SORT_ORDER) {
            return CATEGORY_CODE_SORT_ORDER[categoryCode.toUpperCase() as CategoryCode];
        }
        throw new Error(`Invalid category code: ${categoryCode}`);
    }
}

export default League;

