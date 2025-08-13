const { db } = require('../db');
const util = require('util');
const { positionMap, normalisedName } = require('../utils');

class Team {
    constructor(yahooInstance) {
        this.yahoo = yahooInstance;
    }

    async syncMyRoster() {
        let teamKey = await this.getTeamKeyForUser();
        if (!teamKey) {
          // Step 1: Get the user's GUID and league key from Yahoo
          const leagueKey = await this.getMyLeagueKey();
          if (!leagueKey) {
            throw new Error('Failed to get league key');
          }

          // Step 2: Get the user's team from the league
          const teams = await this.getMyLeagueTeams(leagueKey);
          
          // Step 3: Filter teams by team where team.managers contains manager where manager.is_current_login is '1
          const team = this.getMyTeamFromLeagueResponse(teams);
          if (!team) {
            throw new Error('Failed to get my team');
          }

          // console.log('team');
          // console.log(util.inspect(team, false, null));
          teamKey = team.team_key;
          const teamName = team.name;

          // Upsert team
          const [teamResult] = await db.query(
            `INSERT INTO teams (yahoo_team_id, team_name, is_user_team)
             VALUES (?, ?, true)
             ON DUPLICATE KEY UPDATE team_name = VALUES(team_name), is_user_team = true`,
            [teamKey, teamName, true]
          );
        }
        return this.syncRosterForTeam(teamKey);
    }

    async syncAllLeagueTeams() {
      let teams = await this.getAllLeagueTeams();
      if (teams.error) {
        throw new Error(`Failed to get all league teams: ${teams.details}`);
      }
      if (true || await this.isSyncStale()) {
        for (const team of teams.teams) {
          await this.syncRosterForTeam(team.yahoo_team_id);
        }
        await this.storeSyncTimestamp();
        teams = await this.getAllLeagueTeams();
      }
      return { success: true, teams };
    }

    async syncRosterForLeagueTeam( teamId ) {
      const [[{ yahoo_team_id: teamKey }]] = await db.query('SELECT yahoo_team_id FROM teams WHERE id = ?', [teamId]);
      return this.syncRosterForTeam(teamKey);
    }

    async getAllLeagueTeams() {
      let [teams] = await db.query('SELECT id, yahoo_team_id, team_name FROM teams');
      if (teams.length < 10) {
        const leagueKey = await this.getMyLeagueKey();
        const leagueTeams = await this.getMyLeagueTeams( leagueKey );
        const myTeamKey = await this.getTeamKeyForUser();
        for (const team of leagueTeams) {
          const teamKey = team.team_key;
          const teamName = team.name;
          const isUserTeam = teamKey === myTeamKey;

          // Upsert team
          const [teamResult] = await db.query(
            `INSERT INTO teams (yahoo_team_id, team_name, is_user_team)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE team_name = VALUES(team_name)`,
            [teamKey, teamName, isUserTeam]
          );
        }
      }
      [teams] = await db.query('SELECT id, yahoo_team_id, team_name FROM teams');
      return { success: true, teams };
    }

    async getAllOpponentLeagueTeams() {
      let [teams] = await db.query('SELECT id, team_name FROM teams WHERE is_user_team = false');
      if (teams.length === 0) {
        const leagueKey = await this.getMyLeagueKey();
        const leagueTeams = await this.getMyLeagueTeams( leagueKey );
        const myTeamKey = await this.getTeamKeyForUser();
        for (const team of leagueTeams) {
          if (team.team_key === myTeamKey) {
            continue;
          }
          const teamKey = team.team_key;
          const teamName = team.name;

          // Upsert team
          const [teamResult] = await db.query(
            `INSERT INTO teams (yahoo_team_id, team_name, is_user_team)
            VALUES (?, ?, false)
            ON DUPLICATE KEY UPDATE team_name = VALUES(team_name)`,
            [teamKey, teamName]
          );
        }
        [teams] = await db.query('SELECT id, team_name FROM teams WHERE is_user_team = false');
      }
      return { success: true, teams };
    }

    async syncRosterForTeam( teamKey ) {
      const [[{ id: teamId }]] = await db.query('SELECT id FROM teams WHERE yahoo_team_id = ?', [teamKey]);

      // Step 2: Get the current roster
      console.log('getting my team roster');
      // console.log(util.inspect(rosterRes, false, null));
      const rosterRes = await this.yahoo.getTeamRoster(teamKey);
      
      const players = rosterRes.fantasy_content.team.roster.players.player;
      
      // Clear existing rostered players for this team
      await db.query('UPDATE players SET status = "free_agent", team_id = NULL WHERE team_id = ?', [teamId]);
  
      for (const player of players) {
        const playerId = player.player_id;
        const name = player.name.full;
        const mlbTeam = player.editorial_team_abbr;
        const eligiblePositions = JSON.stringify(player.eligible_positions.position || []);
        const selectedPosition = player.selected_position.position || '';
        const headshotUrl = player.headshot?.url || '';
        
        const positionFlags = {
          is_c: 0,
          is_1b: 0,
          is_2b: 0,
          is_3b: 0,
          is_ss: 0,
          is_of: 0,
          is_util: 0,
          is_sp: 0,
          is_rp: 0
        };      

        // Update position flags
        let rawPositions;
        try {
          rawPositions = JSON.parse(eligiblePositions);
        } catch (error) {
          console.error('Failed to parse eligible positions for player:', name, ':', eligiblePositions, error);
          rawPositions = [];
        }
        
        console.log('Raw positions for player:', name, ':', rawPositions);
        
        const positions = Array.isArray(rawPositions)
          ? rawPositions.map(pos => {
              if (typeof pos === 'string') {
                return pos;
              } else if (pos && typeof pos === 'object' && pos.position) {
                return pos.position;
              }
              return null;
            }).filter(pos => pos !== null)
          : [];
        
        positions.forEach(pos => {
          // Normalize position to uppercase to match positionMap keys
          const normalizedPos = pos ? pos.toUpperCase() : '';
          const flagKey = positionMap[normalizedPos];
          if (flagKey) {
            positionFlags[flagKey] = 1;
          } else {
            // Log unknown positions for debugging
            console.log(`Unknown position: "${pos}" (normalized: "${normalizedPos}")`);
          }
        });

        // console.log('Inserting player:', {
        //   playerId, teamId, name, mlbTeam, eligiblePositions, selectedPosition, headshotUrl, positionFlags
        // });
  
        await db.query(
          `INSERT INTO players 
            (yahoo_player_id, team_id, name, normalised_name, mlb_team, eligible_positions, selected_position, headshot_url, status, is_c, is_1b, is_2b, is_3b, is_ss, is_of, is_util, is_sp, is_rp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              team_id = VALUES(team_id),
              status = VALUES(status),
              is_c = VALUES(is_c),
              is_1b = VALUES(is_1b),
              is_2b = VALUES(is_2b),
              is_3b = VALUES(is_3b),
              is_ss = VALUES(is_ss),
              is_of = VALUES(is_of),
              is_util = VALUES(is_util),
              is_sp = VALUES(is_sp),
              is_rp = VALUES(is_rp)`,
          [playerId, teamId, name, normalisedName(name), mlbTeam, eligiblePositions, selectedPosition, headshotUrl, 'rostered', positionFlags.is_c, positionFlags.is_1b, positionFlags.is_2b, positionFlags.is_3b, positionFlags.is_ss, positionFlags.is_of, positionFlags.is_util, positionFlags.is_sp, positionFlags.is_rp]
        );
      }

      const roster = await this.getRosterForTeam(teamId);
      if (roster.error) {
        throw new Error(`Failed to fetch roster: ${roster.details}`);
      }
      return roster;
    }

    async getAllPlayersWithPosition( position ) {
      const flagKey = positionMap[position];
      if (!flagKey) {
        throw new Error(`Invalid position ${position}`);
      }
      const [players] = await db.query(
        `SELECT name, mlb_team FROM players WHERE ${flagKey} = 1 AND status = 'rostered'`
      );
      return players;
    }

    async getAvailablePlayersForPositions( eligiblePositions ) {
      const conditions = eligiblePositions
        .filter(pos => positionMap[pos])
        .map(pos => `${positionMap[pos]} = 1`)
        .join(' OR ');
      const [rostered] = await db.query(`SELECT name, mlb_team FROM players WHERE (${conditions}) AND status = 'rostered'`);
      return rostered;
    }

    async getMyLeagueKey() {
      const userResult = await this.yahoo.getUserLeagues();
      // console.log('getting my team');
      // console.log(util.inspect(userResult, false, null));
  
      const games = userResult.fantasy_content.users.user.games.game;
      const activeGames = games.filter(game => game.is_game_over === '0');
      const leagueKey = activeGames[0].leagues.league.league_key;

      return leagueKey || null;
    }

    async getMyLeagueTeams( leagueKey ) {
      const leagueResult = await this.yahoo.getLeague(leagueKey);
      console.log('getting my league teams');
      console.log(util.inspect(leagueResult, false, null));
      const teams = leagueResult.fantasy_content.league.standings.teams.team;
      return teams;
    }

    getMyTeamFromLeagueResponse( teams ) {
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
        const [[team]] = await db.query(
          'SELECT id FROM teams WHERE is_user_team = true LIMIT 1'
        );
        if (!team) {
          return { error: 'No user team found' };
        }
        const teamId = team.id;
        return this.getRosterForTeam(teamId);
    }

    async getTeamKeyForTeam( teamId ) {
      const [team] = await db.query(
        'SELECT yahoo_team_id FROM teams WHERE id = ?',
        [teamId]
      );
      return team.yahoo_team_id;
    }

    async getTeamKeyForUser() {
      const [team] = await db.query(
        'SELECT yahoo_team_id FROM teams WHERE is_user_team = true LIMIT 1'
      );
      return team.yahoo_team_id;
    }

    async getPlayer( playerId ) {
      const [player] = await db.query(
        'SELECT id, name, mlb_team, eligible_positions, selected_position, headshot_url FROM players WHERE id = ?',
        [playerId]
      );
      return player[0];
    }
  
    async getRosterForTeam( teamId ) {
      const [players] = await db.query(
        'SELECT id, name, mlb_team, eligible_positions, selected_position, headshot_url FROM players WHERE team_id = ?',
        [teamId]
      );
      return { success: true, players };
    }

    async storeSyncTimestamp() {
      await db.query(
        `INSERT INTO sync_metadata (key_name, last_synced) VALUES ('league_rosters', NOW())
         ON DUPLICATE KEY UPDATE last_synced = NOW()`
      );
    }

    async isSyncStale() {
      const [rows] = await db.query(
        `SELECT last_synced FROM sync_metadata WHERE key_name = 'league_rosters'`
      );
      
      return !rows[0] || new Date() - new Date(rows[0].last_synced) > (1000 * 60 * 60);
    }
}

module.exports = Team;