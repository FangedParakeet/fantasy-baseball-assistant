import League, { LeagueSettingsResponse, LeagueRequest, RosterSlot, ScoringCategory } from "../classes/league";
import { parseNumber, parseOptionalYear, parseBoolean, parseJsonArray } from "../utils/functions";

export type LeagueFormRequest = {
    useExistingLeague: boolean;
    name?: string | null;
    seasonYear: number | null;
    budgetTotal: number;
    teamCount?: number | null;
    hitterBudgetPct: number;
    pitcherBudgetPct: number;
    rosterSlots: RosterSlot[];
    scoringCategories: ScoringCategory[];
}

class LeagueController {
    private league: League;

    constructor(league: League) {
        this.league = league;
    }

    async getLeagueSettings(): Promise<LeagueSettingsResponse> {
        return this.league.getLeagueSettings();
    }

    async upsertLeague(raw: LeagueRequest): Promise<void> {
        const rawRosterSlots = parseJsonArray(raw.rosterSlots, 'rosterSlots');
        const rosterSlots: RosterSlot[] = rawRosterSlots.map((slot: any): RosterSlot => ({
            position: slot.position,
            count: parseNumber(slot.count, 'rosterSlots.count'),
            countsTowardsRemainingRoster: parseBoolean(slot.countsTowardsRemainingRoster, true),
        }));

        const rawScoringCategories = parseJsonArray(raw.scoringCategories, 'scoringCategories');
        const scoringCategories: ScoringCategory[] = rawScoringCategories.map((category: any): ScoringCategory => ({
            code: category.code,
            weight: parseNumber(category.weight, 'scoringCategories.weight'),
            isEnabled: category.isEnabled !== undefined
                ? parseBoolean(category.isEnabled, true)
                : undefined,
        }));

        const leagueRequest: LeagueRequest = {
            name: typeof raw.name === 'string' ? raw.name.trim() : '',
            seasonYear: parseOptionalYear(raw.seasonYear, 'seasonYear'),
            budgetTotal: parseNumber(raw.budgetTotal, 'budgetTotal'),
            teamCount: parseNumber(raw.teamCount, 'teamCount'),
            hitterBudgetPct: parseNumber(raw.hitterBudgetPct, 'hitterBudgetPct'),
            pitcherBudgetPct: parseNumber(raw.pitcherBudgetPct, 'pitcherBudgetPct'),
            rosterSlots,
            scoringCategories,
        };

        // Validate inputs
        if (!leagueRequest.name) {
            throw new Error('League name is required');
        }
        if (leagueRequest.teamCount < 1) {
            throw new Error('Team count must be greater than 0');
        }
        if (leagueRequest.hitterBudgetPct < 0 || leagueRequest.hitterBudgetPct > 100) {
            throw new Error('Hitter budget percentage must be between 0 and 100');
        }
        if (leagueRequest.pitcherBudgetPct < 0 || leagueRequest.pitcherBudgetPct > 100) {
            throw new Error('Pitcher budget percentage must be between 0 and 100');
        }
        if (leagueRequest.rosterSlots.length < 1) {
            throw new Error('At least one roster slot is required');
        }
        if (leagueRequest.scoringCategories.length < 1) {
            throw new Error('At least one scoring category is required');
        }

        // Upsert league with typed request
        await this.league.upsertLeague(leagueRequest);
    }

}

export default LeagueController;