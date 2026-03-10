import express from 'express';
import DraftSettingsController from '../controllers/draftSettingsController';
import Draft, { DraftRequest, DraftResponse, Keeper } from '../classes/draft';
import League from '../classes/league';
import { db } from '../db/db';
import { sendError, sendSuccess } from '../utils/functions';

const draft = new Draft(db);
const draftSettingsController = new DraftSettingsController(draft);
const league = new League(db);
const router = express.Router();

router.get('/drafts', async (req, res) => {
    try {
        const currentLeague = await league.getLeague();
        const draftSettings: DraftResponse[] = await draftSettingsController.getAllByLeagueId(currentLeague.id);
        return sendSuccess(res, draftSettings, 'Draft settings retrieved successfully');
    } catch (error) {
        console.error('Error in /draft/settings/drafts:', error);
        return sendError(res, 500, 'Failed to get draft settings');
    }
});

router.get('/draft/:draftId', async (req, res) => {
    try {
        const draftId = parseInt(req.params.draftId);
        const draftSettings: DraftResponse = await draftSettingsController.getById(draftId);
        return sendSuccess(res, draftSettings, 'Draft settings retrieved successfully');
    } catch (error) {
        console.error('Error in /draft/settings/draft/:draftId:', error);
        return sendError(res, 500, 'Failed to get draft settings');
    }
});

router.get('/draft/:draftId/team/:teamId/keepers', async (req, res) => {
    try {
        const draftId = parseInt(req.params.draftId);
        const teamId = parseInt(req.params.teamId);
        const keepers: Keeper[] = await draftSettingsController.getKeepersForTeam(draftId, teamId);
        return sendSuccess(res, keepers, 'Keepers retrieved successfully');
    } catch (error) {
        console.error('Error in /draft/settings/draft/:draftId/team/:teamId/keepers:', error);
        return sendError(res, 500, 'Failed to get keepers');
    }
});

router.post('/draft/:draftId/team/:teamId/keepers', async (req, res) => {

    try {
        const draftId = parseInt(req.params.draftId);
        const teamId = parseInt(req.params.teamId);
        await draftSettingsController.setKeepersForTeam(draftId, teamId, req.body.keepers);
        return sendSuccess(res, null, 'Keepers set successfully');
    } catch (error) {
        console.error('Error in /draft/settings/draft/:draftId/team/:teamId/keepers:', error);
        return sendError(res, 500, 'Failed to set keepers for team');
    }
});

router.get('/active', async (req, res) => {

    try {
        const draftSettings: DraftResponse = await draftSettingsController.getActive();
        return sendSuccess(res, draftSettings, 'Active draft settings retrieved successfully');
    } catch (error) {
        console.error('Error in /draft/settings/active:', error);
        return sendError(res, 500, 'Failed to get active draft settings');
    }
});

router.post('/active/:draftId', async (req, res) => {
    try {
        const draftId = parseInt(req.params.draftId);
        await draftSettingsController.setActive(draftId);
        return sendSuccess(res, null, 'Active draft settings updated successfully');
    } catch (error) {
        console.error('Error in /draft/settings/active/:draftId:', error);
        return sendError(res, 500, 'Failed to update active draft settings');
    }
});

router.post('/active/deactivate', async (req, res) => {

    try {
        const currentLeague = await league.getLeague();
        await draftSettingsController.deactivateActiveDrafts(currentLeague.id);
        return sendSuccess(res, null, 'Active drafts deactivated successfully');
    } catch (error) {
        console.error('Error in /draft/settings/active/deactivate:', error);
        return sendError(res, 500, 'Failed to deactivate active drafts');
    }
});
router.post('/draft', async (req, res) => {

    try {
        const currentLeague = await league.getLeague();
        const draftRequest: DraftRequest = {
             id: req.body.id ? parseInt(req.body.id) : null,
             name: req.body.name,
             leagueId: currentLeague.id,
             isActive: false,
        };
        await draftSettingsController.upsert(draftRequest);
        return sendSuccess(res, null, 'Draft settings updated successfully');
    } catch (error) {
        console.error('Error in /draft/settings/draft:', error);
        return sendError(res, 500, 'Failed to update draft settings');
    }
});

router.delete('/draft/:draftId', async (req, res) => {
    try {
        const draftId = parseInt(req.params.draftId, 10);
        if (!Number.isInteger(draftId) || draftId < 1) {
            return sendError(res, 400, 'Invalid draft ID');
        }
        await draftSettingsController.deleteDraft(draftId);
        return sendSuccess(res, null, 'Draft deleted successfully');
    } catch (error) {
        console.error('Error in DELETE /draft/settings/draft/:draftId:', error);
        if (error instanceof Error && error.message === 'Draft not found') {
            return sendError(res, 404, error.message);
        }
        return sendError(res, 500, 'Failed to delete draft');
    }
});

export default router;