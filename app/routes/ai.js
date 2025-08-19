const express = require('express');
const router = express.Router();
const AI = require('../classes/ai');
const Team = require('../classes/team');
const Yahoo = require('../classes/yahoo');
const ai = new AI();
const { getValidAccessToken, parseEligiblePositions, sendSuccess, sendError } = require('../utils');

router.post('/ai/opponent-analysis', async (req, res) => {
    try {
        const { teamId, weekStart } = req.body;
        
        if (!teamId || !weekStart) {
            return sendError(res, 400, 'Missing required fields');
        }
        
        const team = new Team();
        const opponentRoster = await team.getRosterForTeam(teamId);
        if (!opponentRoster.players.length) {
            return sendError(res, 404, 'No players found for this team');
        }

        // Turn roster into prompt input
        const playerLines = opponentRoster.players.map(p => `${p.name} (${parseEligiblePositions( p.eligible_positions )}, ${p.mlb_team})`).join('\n');
  
        const prompt = `
            Gameweek starting on ${weekStart}. The following players are on the opponent's roster:
  
            ${playerLines}
  
            Based on their scheduled games, projected starts, and recent fantasy performance, analyse:
            - All pitchers expected to start during this gameweek
            - Which batting and pitching categories (R, HR, RBI, SB, AVG, K, ERA, WHIP, QS, SVH) they appear strongest or weakest in
  
            Return a short bullet point analysis.`;
  
        const result = await ai.getCompletion(prompt, 'opponent_analysis');
        sendSuccess(res, { result }, 'Opponent analysis generated successfully');
    } catch (err) {
        console.error('Opponent analysis error:', err);
        if (err.code === 'ECONNABORTED') {
            return sendError(res, 504, 'AI request timed out. Please try again shortly.');
        } else if (err.response?.data?.error?.message) {
            return sendError(res, 500, `AI request failed: ${err.response.data.error.message}`);
        } else if (err.message) {
            return sendError(res, 500, `AI request failed: ${err.message}`);
        }
        sendError(res, 500, 'Failed to generate opponent analysis');
    }
});

router.post('/ai/two-start-pitchers', async (req, res) => {
    try {
        const { weekStart } = req.body;
      
        if (!weekStart ) {
            return sendError(res, 400, 'Missing week start date');
        }
      
        const accessToken = await getValidAccessToken();
        const yahoo = new Yahoo(accessToken);
        const team = new Team(yahoo);
        await team.syncAllLeagueTeams();
        const rosteredPitchers = await team.getAllPlayersWithPosition('SP');

        const pitcherLines = rosteredPitchers.map(p => `${p.name} (${p.mlb_team})`).join('\n');
  
        const prompt = `
            Gameweek starting on ${weekStart}. The following pitchers are already rostered in our fantasy league and are NOT available:
            
            ${pitcherLines}
            
            Please identify which other starting pitchers (not in this list) are projected to make two starts during this week. Based on expected matchups, team strength, and likelihood of contributing in QS, ERA, WHIP, and strikeouts, recommend at least five of the best two-start pitchers.
            
            Return your recommendations in bullet points with a short justification for each pick.
        `;
  
        const result = await ai.getCompletion(prompt, 'two_start_pitchers');
        sendSuccess(res, { result }, 'Two-start pitcher recommendations generated successfully');
    } catch (err) {
        console.error('Two-start pitcher error:', err);
        if (err.code === 'ECONNABORTED') {
            return sendError(res, 504, 'AI request timed out. Please try again shortly.');
        } else if (err.response?.data?.error?.message) {
            return sendError(res, 500, `AI request failed: ${err.response.data.error.message}`);
        } else if (err.message) {
            return sendError(res, 500, `AI request failed: ${err.message}`);
        }
        sendError(res, 500, 'Failed to generate two-start pitcher recommendations');
    }
});

router.post('/ai/daily-streamers', async (req, res) => {
    try {
        const { weekStart } = req.body;

        if (!weekStart) {
            return sendError(res, 400, 'Missing week start date');
        }

        const accessToken = await getValidAccessToken();
        const yahoo = new Yahoo(accessToken);
        const team = new Team(yahoo);
        await team.syncAllLeagueTeams();
        const rosteredPitchers = await team.getAllPlayersWithPosition('SP');

        const pitcherLines = rosteredPitchers.map(p => `${p.name} (${p.mlb_team})`).join('\n');
        const prompt = `
            The fantasy baseball gameweek begins on ${weekStart}. The following pitchers are already rostered in our league and are NOT available for streaming:

            ${pitcherLines}

            From the remaining pool of available starting pitchers in the league, identify which ones are projected to start each day this week.

            Prioritise pitchers who are likely to earn a **Quality Start (QS)**. Secondarily, consider ERA, WHIP, and strikeouts.

            Return at least **three recommended streamers per day**, with each day clearly labelled. Include a short justification for each pitcher based on matchup, projected performance, and team strength.
        `;

        const result = await ai.getCompletion(prompt, 'daily_streamers');
        sendSuccess(res, { result }, 'Daily streamer recommendations generated successfully');
    } catch (err) {
        console.error('Daily streamer error:', err);
        if (err.code === 'ECONNABORTED') {
            return sendError(res, 504, 'AI request timed out. Please try again shortly.');
        } else if (err.response?.data?.error?.message) {
            return sendError(res, 500, `AI request failed: ${err.response.data.error.message}`);
        } else if (err.message) {
            return sendError(res, 500, `AI request failed: ${err.message}`);
        }
        sendError(res, 500, 'Failed to generate daily streamer recommendations');
    }
});

router.post('/ai/positional-add-drop', async (req, res) => {
    try {
        const { weekStart, playerId, position } = req.body;
      
        if (!weekStart || (!playerId && !position)) {
            return sendError(res, 400, 'Missing required fields: weekStart and either playerId or position');
        }
      
        const accessToken = await getValidAccessToken();
        const yahoo = new Yahoo(accessToken);
        const team = new Team(yahoo);
        await team.syncAllLeagueTeams();
      
        let unavailable = [];
        let eligiblePositions = [];
      
        if (playerId) {
            const player = await team.getPlayer(playerId); 
            if (!player) {
                return sendError(res, 404, 'Player not found');
            }

            const parsed = JSON.parse(player.eligible_positions);
            eligiblePositions = parsed.map(p => typeof p === 'string' ? p : p.position);
            const rostered = await team.getAvailablePlayersForPositions(eligiblePositions);
            unavailable = rostered.map(p => `${p.name} (${p.mlb_team})`);
        } else if (position) {
            const rostered = await team.getAllPlayersWithPosition(position);
            unavailable = rostered.map(p => `${p.name} (${p.mlb_team})`);
            eligiblePositions = [position];
        }
    
        const playerList = unavailable.join('\n');
        const posText = eligiblePositions.join(', ');

        const prompt = `
            Gameweek beginning ${weekStart}. 
            The following players are NOT available:

            ${playerList}

            Return at least **five** free agent player recommendations who are eligible at **${posText}** and could be strong adds.

            If a specific player is being evaluated, compare them to these options and suggest whether a drop is worthwhile.

            Prioritise **HR and SB** for hitters and **QS and SVH** for pitchers, but include general value across all categories.
        `;
  
        const result = await ai.getCompletion(prompt, 'positional_add_drop');
        sendSuccess(res, { result }, 'Positional add/drop recommendations generated successfully');
    } catch (err) {
        console.error('Positional add/drop error:', err);
        if (err.code === 'ECONNABORTED') {
            return sendError(res, 504, 'AI request timed out. Please try again shortly.');
        } else if (err.response?.data?.error?.message) {
            return sendError(res, 500, `AI request failed: ${err.response.data.error.message}`);
        } else if (err.message) {
            return sendError(res, 500, `AI request failed: ${err.message}`);
        }
        sendError(res, 500, 'Failed to generate positional recommendations');
    }
});
  
router.post('/ai/context', async (req, res) => {
    try {
        const { key, content } = req.body;
        await ai.setContext(key, content);
        sendSuccess(res, { success: true }, 'Context stored successfully');
    } catch (err) {
        sendError(res, 500, 'Failed to store context');
    }
});

router.get('/ai/context', async (req, res) => {
    try {
        const contexts = await ai.getContexts();
        sendSuccess(res, { contexts }, 'Contexts retrieved successfully');
    } catch (err) {
        sendError(res, 500, 'Failed to retrieve contexts');
    }
});

router.get('/ai/context/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const content = await ai.getContext(key);
        sendSuccess(res, { content }, 'Context retrieved successfully');
    } catch (err) {
        sendError(res, 500, 'Failed to retrieve context');
    }
});

router.post('/ai/analyse', async (req, res) => {
    try {
        const { prompt, contextKey } = req.body;
        const result = await ai.getCompletion(prompt, contextKey);
        sendSuccess(res, { result }, 'AI analysis completed successfully');
    } catch (err) {
        sendError(res, 500, 'AI analysis failed');
    }
});

module.exports = router;
