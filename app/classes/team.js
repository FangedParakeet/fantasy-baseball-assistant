const { db } = require('../db');
const util = require('util');

class Team {
    constructor(yahooInstance, accessToken) {
        this.yahoo = yahooInstance;
        this.accessToken = accessToken;
    }

    async syncMyRoster() {
        try {
            // Step 1: Get the user's GUID and league key from Yahoo
            const leagueKey = await this.getMyLeagueKey();
            if (!leagueKey) {
              return { error: 'Failed to get league key' };
            }

            // Step 2: Get the user's team from the league
            const teams = await this.getMyLeagueTeams(leagueKey);
            
            // Step 3: Filter teams by team where team.managers contains manager where manager.is_current_login is '1
            const team = this.getMyTeam(teams);
            if (!team) {
              return { error: 'Failed to get my team' };
            }

            // console.log('team');
            // console.log(util.inspect(team, false, null));
            const teamKey = team.team_key;
            const teamName = team.name;

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
            // console.log(util.inspect(rosterRes, false, null));
            
            const players = rosterRes.fantasy_content.team.roster.players.player;
            
            // Clear existing rostered players for this team
            await db.query('DELETE FROM players WHERE team_id = ?', [teamId]);
        
            for (const player of players) {
              const playerId = player.player_id;
              const name = player.name.full;
              const mlbTeam = player.editorial_team_abbr;
              const eligiblePositions = JSON.stringify(player.eligible_positions.position || []);
              const selectedPosition = player.selected_position.position || '';
              const headshotUrl = player.headshot?.url || '';
              
              console.log('Inserting player:', {
                playerId, teamId, name, mlbTeam, eligiblePositions, selectedPosition, headshotUrl
              });
        
              await db.query(
                `INSERT INTO players (yahoo_player_id, team_id, name, mlb_team, eligible_positions, selected_position, headshot_url, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [playerId, teamId, name, mlbTeam, eligiblePositions, selectedPosition, headshotUrl, 'rostered']
              );
            }
        
            return { success: true, team: teamName, playerCount: players.length };
          } catch (err) {
            console.error('Error syncing roster:', err);
            return { error: 'Failed to sync roster', details: err.message };
          }
        
    }

    async getMyLeagueKey() {
      const userResult = await this.yahoo.getUserLeagues(this.accessToken);
      console.log('getting my team');
      // console.log(util.inspect(userResult, false, null));
  
      const games = userResult.fantasy_content.users.user.games.game;
      const activeGames = games.filter(game => game.is_game_over === '0');
      const leagueKey = activeGames[0].leagues.league.league_key;

      return leagueKey || null;
    }

    async getMyLeagueTeams( leagueKey ) {
      const leagueResult = await this.yahoo.getLeague(this.accessToken, leagueKey);
      console.log('getting my league teams');
      // console.log(util.inspect(leagueResult, false, null));
      const teams = leagueResult.fantasy_content.league.standings.teams.team;
      return teams;
    }

    getMyTeam( teams ) {
      let myTeam = null;
      // for each team, if manager.manager.is_current_login is '1' or manager.manager is an array containing a manager where manager.is_current_login is '1', return the team
      teams.forEach(team => {
        // console.log('team');
        // console.log(util.inspect(team, false, null));
        if ( typeof team.managers.manager === 'object' && team.managers.manager.is_current_login === '1' ) {
          myTeam = team;
        } else if ( Array.isArray(team.managers.manager) && team.managers.manager.some(manager => manager.is_current_login === '1') ) {
          myTeam = team;
        }
      });
      return myTeam;
    }

    async getMyRoster() {
        try {
            const [[{ id: teamId }]] = await db.query(
              'SELECT id FROM teams WHERE is_user_team = true LIMIT 1'
            );
        
            const [players] = await db.query(
              'SELECT id, name, mlb_team, eligible_positions, selected_position, headshot_url FROM players WHERE team_id = ?',
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