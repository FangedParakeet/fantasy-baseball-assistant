import Draft from "../classes/draft";
import { DraftRequest, DraftResponse } from "../classes/draft";
import { parseBooleanStrict, parseNumber, parseNumberRequired, parseString } from "../utils/functions";

class DraftSettingsController {
    private draft: Draft;

    constructor(draft: Draft) {
        this.draft = draft;
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