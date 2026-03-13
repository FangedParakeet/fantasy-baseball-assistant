import type League from "../classes/league";
import type { LeagueRequest, LeagueSettingsResponse, RosterSlot, ScoringCategory } from "../classes/league";
import { parseBoolean, parseJsonArray, parseNumber, parseNumberRequired, parseOptionalYear } from "../utils/functions";

export type LeagueFormRequest = {
    id: number | null;
    seasonYear: number | null;
    budgetTotal: number;
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

    async upsertLeague(leagueRequest: LeagueRequest): Promise<void> {
        const rawRosterSlots = Array.isArray(leagueRequest.rosterSlots)
            ? leagueRequest.rosterSlots
            : parseJsonArray(leagueRequest.rosterSlots as string, 'rosterSlots');
        const rosterSlots: RosterSlot[] = rawRosterSlots.map((slot: unknown): RosterSlot => {
            const s = slot as RosterSlot;
            return {
                position: s.position,
                count: parseNumberRequired(s.count, 'rosterSlots.count'),
                countsTowardsRemainingRoster: parseBoolean(s.countsTowardsRemainingRoster, true),
            };
        });

        const rawScoringCategories = Array.isArray(leagueRequest.scoringCategories)
            ? leagueRequest.scoringCategories
            : parseJsonArray(leagueRequest.scoringCategories as string, 'scoringCategories');
        const scoringCategories: ScoringCategory[] = rawScoringCategories.map((category: unknown): ScoringCategory => {
            const c = category as ScoringCategory;
            return {
                code: c.code,
                weight: parseNumberRequired(c.weight, 'scoringCategories.weight'),
                isEnabled: c.isEnabled !== undefined
                    ? parseBoolean(c.isEnabled, true)
                    : undefined,
            };
        });

        const validatedLeagueRequest: LeagueRequest = {
            id: parseNumber(leagueRequest.id, 'id') ?? null,
            name: typeof leagueRequest.name === 'string' ? leagueRequest.name.trim() : '',
            seasonYear: parseOptionalYear(leagueRequest.seasonYear, 'seasonYear'),
            budgetTotal: parseNumberRequired(leagueRequest.budgetTotal, 'budgetTotal'),
            teamCount: parseNumberRequired(leagueRequest.teamCount, 'teamCount'),
            hitterBudgetPct: parseNumberRequired(leagueRequest.hitterBudgetPct, 'hitterBudgetPct'),
            pitcherBudgetPct: parseNumberRequired(leagueRequest.pitcherBudgetPct, 'pitcherBudgetPct'),
            rosterSlots,
            scoringCategories,
        };

        // Validate inputs
        if (!validatedLeagueRequest.name) {
            throw new Error('League name is required');
        }
        if (validatedLeagueRequest.teamCount < 1) {
            throw new Error('Team count must be greater than 0');
        }
        if (validatedLeagueRequest.hitterBudgetPct < 0 || validatedLeagueRequest.hitterBudgetPct > 100) {
            throw new Error('Hitter budget percentage must be between 0 and 100');
        }
        if (validatedLeagueRequest.pitcherBudgetPct < 0 || validatedLeagueRequest.pitcherBudgetPct > 100) {
            throw new Error('Pitcher budget percentage must be between 0 and 100');
        }
        if (validatedLeagueRequest.rosterSlots.length < 1) {
            throw new Error('At least one roster slot is required');
        }
        if (validatedLeagueRequest.scoringCategories.length < 1) {
            throw new Error('At least one scoring category is required');
        }

        // Upsert league with typed request
        await this.league.upsertLeague(validatedLeagueRequest);
    }

}

export default LeagueController;