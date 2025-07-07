const { db } = require('../db');

class Team {
    constructor(yahooInstance, accessToken) {
        this.yahoo = yahooInstance;
        this.accessToken = accessToken;
    }

    async syncMyRoster() {
        try {
            // Step 1: Get the user's team key from Yahoo
            const teamRes = await this.yahoo.getUserLeagues(this.accessToken);
            console.log('getting my team');
            console.log(teamRes);
        
            const team = teamRes.fantasy_content.users[0].user[1].games[0].game[1].teams[0].team;
            const teamKey = team[0][0].team_key;
            const teamName = team[0][2].name;
        
            // Upsert team
            const [teamResult] = await db.query(
              `INSERT INTO teams (yahoo_team_id, team_name, is_user_team)
               VALUES (?, ?, true)
               ON DUPLICATE KEY UPDATE team_name = VALUES(team_name)`,
              [teamKey, teamName]
            );
        
            const [[{ id: teamId }]] = await db.query('SELECT id FROM teams WHERE yahoo_team_id = ?', [teamKey]);
            
            // Step 2: Get the current roster
            const rosterRes = await this.yahoo.getTeamRoster(this.accessToken, teamKey);

            console.log('getting my team roster');
            console.log(rosterRes);
            
            const players = rosterRes.fantasy_content.team[1].roster[0].players;
            
            // Clear existing rostered players for this team
            await db.query('DELETE FROM players WHERE team_id = ?', [teamId]);
        
            for (const p of Object.values(players)) {
              const player = p.player;
              const playerId = player[0].player_id;
              const name = player[2].name.full;
              const mlbTeam = player[1].editorial_team_abbr;
              const positions = player[1].eligible_positions?.join(',') || '';
        
              await db.query(
                `INSERT INTO players (yahoo_player_id, team_id, name, mlb_team, positions, status)
                 VALUES (?, ?, ?, ?, ?, 'rostered')`,
                [playerId, teamId, name, mlbTeam, positions]
              );
            }
        
            return { success: true, team: teamName, playerCount: Object.keys(players).length };
          } catch (err) {
            console.error('Error syncing roster:', err);
            return { error: 'Failed to sync roster', details: err.message };
          }
        
    }

    async getMyRoster() {
        try {
            const [[{ id: teamId }]] = await db.query(
              'SELECT id FROM teams WHERE is_user_team = true LIMIT 1'
            );
        
            const [players] = await db.query(
              'SELECT id, name, mlb_team, positions FROM players WHERE team_id = ? ORDER BY name ASC',
              [teamId]
            );
        
            return { success: true, players };
          } catch (err) {
            console.error('Error fetching roster:', err);
            return { error: 'Failed to fetch roster', details: err.message };
          }
      
    }
}

module.exports = Team;