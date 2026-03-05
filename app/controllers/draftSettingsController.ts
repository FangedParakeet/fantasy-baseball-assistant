import Draft from "../classes/draft";
import { DraftRequest, DraftResponse, type Keeper } from "../classes/draft";
import { parseBooleanStrict, parseJsonArray, parseNumber, parseNumberRequired, parseString, parseStringOptional } from "../utils/functions";

class DraftSettingsController {
    private draft: Draft;

    constructor(draft: Draft) {
        this.draft = draft;
    }

    async getAllByLeagueId(leagueId: number): Promise<DraftResponse[]> {
        return this.draft.getDraftsByLeagueId(parseNumberRequired(leagueId, 'leagueId'));
    }

    async getById(draftId: number): Promise<DraftResponse> {
        return this.draft.getDraftById(parseNumberRequired(draftId, 'draftId'));
    }

    async getActive(): Promise<DraftResponse> {
        return this.draft.getActiveDraft();
    }

    async setActive(draftId: number): Promise<void> {
        return this.draft.setActiveDraft(parseNumberRequired(draftId, 'draftId'));
    }

    async deactivateActiveDrafts(leagueId: number): Promise<void> {
        return this.draft.deactivateActiveDrafts(parseNumberRequired(leagueId, 'leagueId'));
    }

    async getKeepersForTeam(draftId: number, leagueTeamId: number): Promise<Keeper[]> {
        const draftTeamId = await this.draft.getDraftTeamIdByLeagueTeamId(parseNumberRequired(draftId, 'draftId'), parseNumberRequired(leagueTeamId, 'leagueTeamId'));
        return this.draft.getKeepersForTeam(draftId, draftTeamId);
    }

    async setKeepersForTeam(draftId: number, leagueTeamId: number, rawKeepers: Keeper[] | string): Promise<void> {
        const draftTeamId = await this.draft.getDraftTeamIdByLeagueTeamId(parseNumberRequired(draftId, 'draftId'), parseNumberRequired(leagueTeamId, 'leagueTeamId'));
        const keepers = Array.isArray(rawKeepers) ? rawKeepers : parseJsonArray(rawKeepers as string, 'keepers');
        const validatedKeepers: Keeper[] = keepers.map((keeper) => ({
            player_id: parseNumberRequired(keeper.player_id, 'playerId'),
            cost: parseNumberRequired(keeper.cost, 'cost'),
            locked_slot_code: parseStringOptional(keeper.locked_slot_code, 'lockedSlotCode') ?? null,
            note: parseStringOptional(keeper.note, 'note') ?? null,
        }));
        return this.draft.setKeepersForTeam(draftId, draftTeamId, validatedKeepers);
    }

    async upsert(draftRequest: DraftRequest): Promise<void> {
        const validatedDraftRequest: DraftRequest = {
            id: parseNumber(draftRequest.id, 'id') ?? null,
            leagueId: parseNumberRequired(draftRequest.leagueId, 'leagueId'),
            name: parseString(draftRequest.name, 'name'),
            isActive: parseBooleanStrict(draftRequest.isActive, 'isActive'),
        };
        return this.draft.upsertDraft(validatedDraftRequest);
    }
}

export default DraftSettingsController;