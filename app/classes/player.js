const { db, executeInTransaction } = require('../db');

class Player {
    constructor() {
        this.probablePitchersTable = 'probable_pitchers';
        this.playersTable = 'players';
        this.playerLookupsTable = 'player_lookup';
        this.playerRollingStatsTable = 'player_rolling_stats';
        this.playerRollingStatsPercentilesTable = 'player_rolling_stats_percentiles';
        this.playerAdvancedRollingStatsPercentilesTable = 'player_advanced_rolling_stats_percentiles';
        this.teamRollingStatsPercentilesTable = 'team_rolling_stats_percentiles';
        this.teamVsPitcherSplitsPercentilesTable = 'team_vs_pitcher_splits_percentiles';
        this.teamVsBatterSplitsPercentilesTable = 'team_vs_batter_splits_percentiles';
        this.defaultPlayerFields = [
            'id', 'name', 'mlb_team', 'eligible_positions', 'selected_position', 'headshot_url'
        ]
        this.pageSize = 25;
    }

    async searchPlayers(query) {
        const {
            positionType,
            position,
            isRostered,
            spanDays,
            page,
            orderBy,
            teamId,
        } = query;

        if ( positionType === 'B' || positionType === 'P' ) {
            return await this.getPlayerFantasyRankings(page, spanDays, positionType, isRostered, position, orderBy, teamId);
        } else if ( positionType === 'speed' ) {
            return await this.getHitterSpeedWatchlist(page, spanDays, position, teamId);
        } else if ( positionType === 'contact' ) {
            return await this.getHitterContactOnBaseWatchlist(page, spanDays, position, teamId);
        } else if ( positionType === 'power' ) {
            return await this.getHitterPowerWatchlist(page, spanDays, position, teamId);
        } else if ( positionType === 'starter' ) {
            return await this.getPitcherStarterWatchlist(page, spanDays, teamId);
        } else if ( positionType === 'reliever' ) {
            return await this.getPitcherRelieverWatchlist(page, spanDays, teamId);
        } else {
            return await this.getPlayerFantasyRankings(page, spanDays, 'B', isRostered, position, orderBy, teamId);
        }
    }

    async getAvailablePitchers(query, type='daily-streamer') {
        const {
            startDate,
            endDate,
        } = this.getDateRange(query);
        if ( type === 'daily-streamer' ) {
            return await this.getAvailableDailyStreamingPitchers(startDate, endDate);
        } else if ( type === 'two-start' ) {
            return await this.getAvailableTwoStartPitchers(startDate, endDate);
        } else if ( type === 'nrfi' ) {
            return await this.getNRFIRankings(startDate, endDate);
        } else {
            throw new Error('Invalid type');
        }
    }

    async getProbablesStatsForTeam(teamId, query) {
        const {
            startDate,
            endDate,
        } = this.getDateRange(query);
        const twoStartPitchers = await this.getTwoStartPitchersForTeam(teamId, startDate, endDate);
        const probablePitchers = await this.getProbablePitchersForTeam(teamId, startDate, endDate);
        return {
            twoStartPitchers,
            probablePitchers,
        };
    }

    async getStatsForTeam(teamId, query, type='batting') {
        const {
            spanDays,
            orderBy,
        } = query;
        if ( type === 'batting' ) {
            return await this.getScoringStatsForTeamBatters(teamId, spanDays, orderBy);
        } else if ( type === 'pitching' ) {
            return await this.getScoringStatsForTeamPitchers(teamId, spanDays, orderBy);
        } else {
            throw new Error('Invalid type');
        }
    }

    async getScheduleStrengthForTeam(teamId, query, type='batting') {
        const {
            startDate,
            endDate,
            spanDays,
        } = this.getDateRange(query);
        if ( type === 'batting' ) {
            return await this.getWeeklyHitterScheduleStrengthPreviewForTeam(teamId, startDate, endDate, spanDays);
        } else if ( type === 'pitching' ) {
            return await this.getWeeklyPitcherScheduleStrengthPreviewForTeam(teamId, startDate, endDate, spanDays);
        } else {
            throw new Error('Invalid type');
        }
    }

    getDateRange(query) {
        let {
            startDate,
            endDate,
        } = query;
        
        if ( ! startDate ) {
            startDate = new Date();
            startDate.setDate(startDate.getDate() - startDate.getDay());
        } else {
            startDate = new Date(startDate);
        }
        if ( ! endDate ) {
            endDate = new Date();
            endDate.setDate(endDate.getDate() - endDate.getDay() + 6);
        } else {
            endDate = new Date(endDate);
        }
        const formattedStartDate = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const formattedEndDate = endDate.toISOString().split('T')[0]; // YYYY-MM-DD
        return {
            startDate: formattedStartDate,
            endDate: formattedEndDate,
        };
    }

    getPlayerFields() {
        return this.defaultPlayerFields.map(field => `p.${field}`).join(', ');
    }

    getFields(scoringFields, rawFields) {
        return scoringFields
            .map(field => `prs_raw.${field}, prs_pct.${field}_pct`)
            .concat(rawFields.map(field => `prs_raw.${field}`))
            .concat(['prs_pct.reliability_score'])
            .join(', ');
    }

    getPitcherScoringFields() {
        const pitcherScoringFields = [
            'strikeouts', 'era', 'whip', 'qs', 'sv', 'hld'
        ];
        const rawFields = [ 'ip' ];
        return this.getFields(pitcherScoringFields, rawFields);
    }

    getPitcherAdvancedScoringFields() {
        const pitcherAdvancedScoringFields = [
            'k_per_9', 'bb_per_9', 'fip'
        ];
        return pitcherAdvancedScoringFields.map(field => `pars.${field}_pct`).join(', ');
    }
    
    getHitterScoringFields() {
        const hitterScoringFields = [
            'runs', 'hr', 'rbi', 'sb', 'avg'
        ];
        const rawFields = [ 'hits', 'abs' ];
        return this.getFields(hitterScoringFields, rawFields);
    }

    getHitterAdvancedScoringFields() {
        const hitterAdvancedScoringFields = [
            'obp', 'slg', 'ops', 'k_rate', 'bb_rate', 'iso', 'wraa'
        ];
        return hitterAdvancedScoringFields.map(field => `pars.${field}_pct`).join(', ');
    }

    async getAvailableTwoStartPitchers(startDate, endDate) {
        if (!startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        const playerFields = this.getPlayerFields();
        const pitcherScoringFields = this.getPitcherScoringFields();
        const pitcherAdvancedScoringFields = this.getPitcherAdvancedScoringFields();
        const spanDays = 30;
        const [probablePitchers] = await db.query(
            `SELECT 
                pp.game_date, pp.team, pp.opponent, pp.home, pp.player_id, pp.accuracy, pp.qs_likelihood_score,
                ${playerFields}, 
                ${pitcherScoringFields},
                ${pitcherAdvancedScoringFields},
                AVG(pp.qs_likelihood_score) OVER (PARTITION BY pp.player_id) AS avg_qs_score
            FROM ${this.probablePitchersTable} pp
            LEFT JOIN ${this.playersTable} p ON p.player_id = pp.player_id
            LEFT JOIN ${this.playerLookupsTable} pl ON pl.player_id = pp.player_id
            LEFT JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars 
                ON pars.player_id = pp.player_id AND pars.span_days = ? AND pars.split_type = 'overall' AND pars.position = 'P'
            LEFT JOIN ${this.playerRollingStatsPercentilesTable} prs_pct
                ON prs_pct.player_id = pp.player_id AND prs_pct.span_days = ? AND prs_pct.split_type = 'overall' AND prs_pct.position = 'P'
            LEFT JOIN ${this.playerRollingStatsTable} prs_raw
                ON prs_raw.player_id = pp.player_id AND prs_raw.span_days = ? AND prs_raw.split_type = 'overall' AND prs_raw.position = 'P'
            WHERE pp.game_date BETWEEN ? AND ? 
                AND EXISTS (
                    SELECT 1 
                    FROM ${this.probablePitchersTable} pp2
                    LEFT JOIN ${this.playersTable} p2 ON p2.player_id = pp2.player_id
                    WHERE pp2.normalised_name = pp.normalised_name
                        AND p2.status = 'free_agent'
                        AND pp2.game_date BETWEEN ? AND ?
                    HAVING COUNT(*) > 1
                )
            ORDER BY avg_qs_score DESC, pp.normalised_name ASC, pp.game_date ASC
            `,
            [spanDays, spanDays, spanDays, startDate, endDate, startDate, endDate]
        );
        return probablePitchers;
    }

    async getAvailableDailyStreamingPitchers(startDate, endDate) {
        if (!startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        const spanDays = 30;
        const playerFields = this.getPlayerFields();
        const pitcherScoringFields = this.getPitcherScoringFields();
        const pitcherAdvancedScoringFields = this.getPitcherAdvancedScoringFields();
        const [probablePitchers] = await db.query(
            `SELECT pp.game_date, pp.team, pp.opponent, pp.home, pp.player_id, pp.normalised_name, pp.accuracy, pp.qs_likelihood_score,
                ${playerFields}, 
                ${pitcherScoringFields},
                ${pitcherAdvancedScoringFields}
            FROM ${this.probablePitchersTable} pp
            LEFT JOIN ${this.playersTable} p ON p.player_id = pp.player_id
            LEFT JOIN ${this.playerLookupsTable} pl ON pl.player_id = pp.player_id
            LEFT JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars 
                ON pars.player_id = pp.player_id AND pars.span_days = ? AND pars.split_type = 'overall' AND pars.position = 'P'
            LEFT JOIN ${this.playerRollingStatsPercentilesTable} prs_pct
                ON prs_pct.player_id = pp.player_id AND prs_pct.span_days = ? AND prs_pct.split_type = 'overall' AND prs_pct.position = 'P'
            LEFT JOIN ${this.playerRollingStatsTable} prs_raw
                ON prs_raw.player_id = pp.player_id AND prs_raw.span_days = ? AND prs_raw.split_type = 'overall' AND prs_raw.position = 'P'
            WHERE pp.game_date BETWEEN ? AND ?
                AND p.status = 'free_agent'
            ORDER BY pp.game_date, pp.qs_likelihood_score DESC, pp.normalised_name
            `,
            [spanDays, spanDays, spanDays, startDate, endDate]
        );
        return probablePitchers;
    }

    async getTwoStartPitchersForTeam(teamId, startDate, endDate) {
        if (!teamId || !startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        const playerFields = this.getPlayerFields();
        const [probablePitchers] = await db.query(`
            SELECT 
                pp.game_date, pp.team, pp.opponent, pp.home, pp.player_id, pp.accuracy, pp.qs_likelihood_score,
                ${playerFields},
                AVG(pp.qs_likelihood_score) OVER (PARTITION BY pp.player_id) AS avg_qs_score
            FROM ${this.probablePitchersTable} pp
            LEFT JOIN ${this.playersTable} p ON p.player_id = pp.player_id
            WHERE pp.game_date BETWEEN ? AND ?
                AND EXISTS (
                    SELECT 1    
                    FROM ${this.probablePitchersTable} pp2
                    LEFT JOIN ${this.playersTable} p2 ON p2.player_id = pp2.player_id
                    WHERE pp2.normalised_name = pp.normalised_name
                        AND p2.team_id = ?
                        AND pp2.game_date BETWEEN ? AND ?
                    HAVING COUNT(*) > 1
                )
            ORDER BY avg_qs_score DESC, pp.normalised_name ASC, pp.game_date ASC
            `,
            [startDate, endDate, teamId, startDate, endDate]
        );
        return probablePitchers;
    }

    async getProbablePitchersForTeam(teamId, startDate, endDate) {
        if (!teamId || !startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        const playerFields = this.getPlayerFields();
        const [probablePitchers] = await db.query(
            `SELECT 
                pp.game_date, pp.team, pp.opponent, pp.home, p.player_id, pp.accuracy, pp.qs_likelihood_score,
                ${playerFields}
            FROM ${this.probablePitchersTable} pp
            JOIN ${this.playersTable} p ON p.player_id = pp.player_id
            WHERE pp.game_date BETWEEN ? AND ?
                AND p.team_id = ?
            ORDER BY pp.game_date ASC, pp.qs_likelihood_score DESC, pp.normalised_name ASC
            `,
            [startDate, endDate, teamId]
        );
        return probablePitchers;
    }

    async getScoringStatsForTeamBatters(teamId, spanDays=14, orderBy=false) {
        if (!teamId) {
            throw new Error('Missing required parameters');
        }
        const playerFields = this.getPlayerFields();
        const hitterScoringFields = this.getHitterScoringFields();
        const hitterAdvancedScoringFields = this.getHitterAdvancedScoringFields();
        let orderByClause = '';
        if (orderBy) {
            orderByClause = `ORDER BY prs_pct.${orderBy}_pct DESC`;
        }
        const [playerStats] = await db.query(
            `SELECT 
                ${playerFields}, 
                ${hitterScoringFields},
                ${hitterAdvancedScoringFields},
                
                /* Batter fantasy score: All 5 hitting categories */
                (0.25 * prs_pct.runs_pct + 
                0.25 * prs_pct.hr_pct + 
                0.25 * prs_pct.rbi_pct + 
                0.15 * prs_pct.sb_pct + 
                0.10 * prs_pct.avg_pct) AS fantasy_score
            FROM ${this.playersTable} p
            LEFT JOIN ${this.playerRollingStatsTable} prs_raw
                ON prs_raw.player_id = p.player_id 
                AND prs_raw.position = p.position
                AND prs_raw.span_days = ?
                AND prs_raw.split_type = 'overall'
            LEFT JOIN ${this.playerRollingStatsPercentilesTable} prs_pct
                ON prs_pct.player_id = p.player_id
                AND prs_pct.position = p.position
                AND prs_pct.span_days = ?
                AND prs_pct.split_type = 'overall'
            LEFT JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars
                ON pars.player_id = p.player_id 
                AND pars.span_days = ? 
                AND pars.split_type = 'overall' AND pars.position = 'B'
            WHERE p.team_id = ? AND p.position = 'B'
            ${orderByClause}
            `,
            [spanDays, spanDays, spanDays, teamId]
        );
        return playerStats;
    }

    async getScoringStatsForTeamPitchers(teamId, spanDays=14, orderBy=false) {
        if (!teamId) {
            throw new Error('Missing required parameters');
        }
        const playerFields = this.getPlayerFields();
        const pitcherScoringFields = this.getPitcherScoringFields();
        const pitcherAdvancedScoringFields = this.getPitcherAdvancedScoringFields();
        let orderByClause = '';
        if (orderBy) {
            orderByClause = `ORDER BY prs_pct.${orderBy}_pct DESC`;
        }
        const [playerStats] = await db.query(
            `SELECT 
                ${playerFields}, 
                ${pitcherScoringFields},
                ${pitcherAdvancedScoringFields},

                /* Pitcher fantasy score: K, QS, SVH heavy, with ERA/WHIP control */
                (0.25 * prs_pct.strikeouts_pct + 
                0.25 * prs_pct.qs_pct + 
                0.20 * GREATEST(prs_pct.sv_pct, prs_pct.hld_pct) + 
                0.15 * (100 - prs_pct.era_pct) + 
                0.15 * (100 - prs_pct.whip_pct)) AS fantasy_score

            FROM ${this.playersTable} p
            LEFT JOIN ${this.playerRollingStatsTable} prs_raw
                ON prs_raw.player_id = p.player_id 
                AND prs_raw.position = p.position
                AND prs_raw.span_days = ?
                AND prs_raw.split_type = 'overall'
            LEFT JOIN ${this.playerRollingStatsPercentilesTable} prs_pct
                ON prs_pct.player_id = p.player_id
                AND prs_pct.position = p.position
                AND prs_pct.span_days = ?
                AND prs_pct.split_type = 'overall'
            LEFT JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars
                ON pars.player_id = p.player_id 
                AND pars.span_days = ? 
                AND pars.split_type = 'overall' AND pars.position = 'P'
            WHERE p.team_id = ? AND p.position = 'P'
            ${orderByClause}
            `,
            [spanDays, spanDays, spanDays, teamId]
        );
        return playerStats;
    }

    async getWeeklyPitcherScheduleStrengthPreviewForTeam(teamId, startDate, endDate, spanDays=14) {
        if (!teamId || !startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        return executeInTransaction(async (connection) => {
            const outerPlayerFields = this.defaultPlayerFields.map(field => `${field}`).join(', ');
            const innerPlayerFields = this.getPlayerFields();
            const [pitcherScores] = await connection.query(`
                SELECT 
                    ${outerPlayerFields}, 
                    AVG(start_score) AS pitcher_week_score, COUNT(*) AS starts, 
                    MAX(qs_pct) AS qs_pct, MAX(sv_pct) AS sv_pct, MAX(hld_pct) AS hld_pct, 
                    100 - AVG(opp_ops_vs_hand_pct) AS opp_ops_vs_hand_pct,
                    MAX(fip_pct) AS fip_pct, MAX(bb_per_9_pct) AS bb_per_9_pct, MAX(k_per_9_pct) AS k_per_9_pct, 
                    MAX(reliability_score) AS reliability_score
                    FROM (
                        SELECT
                            ${innerPlayerFields}, 
                            pp.player_id,
                            pp.game_date,
                            pp.team,
                            pp.opponent,
                            pp.home,
                            tvp.ops_pct     AS opp_ops_vs_hand_pct,
                            pars.fip_pct,
                            prs_pct.qs_pct,
                            prs_pct.sv_pct,
                            prs_pct.hld_pct,
                            pars.bb_per_9_pct,
                            pars.k_per_9_pct,
                            pars.reliability_score,
                            /* start_score formula - handle NULLs gracefully */
                            (0.45*(100 - COALESCE(tvp.ops_pct, 50))  -- Default to 50 if missing
                                + 0.25*COALESCE(pars.fip_pct, 50)    -- Default to 50 if missing
                                + 0.20*COALESCE(prs_pct.qs_pct, 50)      -- Default to 50 if missing
                                + 0.10*(100 - COALESCE(pars.bb_per_9_pct, 50))  -- Default to 50 if missing
                                + CASE WHEN pp.home THEN 3 ELSE 0 END) AS start_score
                        FROM ${this.probablePitchersTable} pp
                        JOIN ${this.playersTable} p ON p.player_id = pp.player_id AND p.position = 'P'
                        JOIN ${this.playerLookupsTable} lu ON lu.player_id = pp.player_id
                        LEFT JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars
                            ON pars.player_id = pp.player_id AND pars.span_days = ? AND pars.split_type = ? AND pars.position = 'P'
                        LEFT JOIN ${this.playerRollingStatsPercentilesTable} prs_pct
                            ON prs_pct.player_id = pp.player_id AND prs_pct.span_days = ? AND prs_pct.split_type = ? AND prs_pct.position = 'P'
                        LEFT JOIN ${this.teamVsPitcherSplitsPercentilesTable} tvp
                            ON tvp.team = pp.opponent AND tvp.throws = lu.throws AND tvp.span_days = ?
                        WHERE pp.game_date BETWEEN ? AND ?
                            AND pp.player_id IS NOT NULL
                            AND p.team_id = ?
                        ) s
                    GROUP BY player_id
                    ORDER BY pitcher_week_score DESC
                `, [spanDays, 'overall', spanDays, 'overall', spanDays, startDate, endDate, teamId]);
            return pitcherScores;
        });
    }

    async getWeeklyHitterScheduleStrengthPreviewForTeam(teamId, startDate, endDate, spanDays=14) {
        if (!teamId || !startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        return executeInTransaction(async (connection) => {
            // Create temporary table for hitter analysis
            await connection.query(`
                CREATE TEMPORARY TABLE IF NOT EXISTS temp_opponents (
                    player_id     INT NOT NULL,
                    opponent_team VARCHAR(10) NOT NULL,
                    games         INT NOT NULL,
                    home_games    INT NOT NULL,
                    away_games    INT NOT NULL,
                    PRIMARY KEY (player_id, opponent_team)
                ) ENGINE=MEMORY;
            `);

            // Clear the temporary table
            await connection.query(`
                TRUNCATE TABLE temp_opponents;
            `);
            
            // Insert hitter data into temporary table
            await connection.query(`
                INSERT INTO temp_opponents (player_id, opponent_team, games, home_games, away_games)
                SELECT
                    d.player_id,
                    d.opp_team AS opponent_team,
                    COUNT(*) AS games,
                    SUM(CASE WHEN d.our_home = 1 THEN 1 ELSE 0 END) AS home_games,
                    SUM(CASE WHEN d.our_home = 1 THEN 0 ELSE 1 END) AS away_games
                FROM (
                    /* De-dupe by a synthetic game key so we don't double count when both probables are listed */
                    SELECT DISTINCT
                        g.player_id,
                        g.game_date,
                        COALESCE(g.game_id, CONCAT(g.game_date, ':', g.our_team, '@', g.opp_team)) AS gid_key,
                        g.opp_team,
                        g.our_home
                    FROM (
                        /* Case A: our team appears as 'team' */
                        SELECT
                            pp.game_date,
                            pp.game_id,
                            pl.player_id,
                            pp.team     AS our_team,
                            pp.opponent AS opp_team,
                            CASE WHEN pp.home = 1 THEN 1 ELSE 0 END AS our_home
                        FROM ${this.probablePitchersTable} pp
                        JOIN ${this.playerLookupsTable} pl
                            ON pl.team = pp.team
                        JOIN ${this.playersTable} p ON p.player_id = pl.player_id AND p.position = 'B'
                        WHERE pp.game_date BETWEEN ? AND ?
                            AND p.team_id = ?

                        UNION ALL

                        /* Case B: only opponent has a probable; mirror it */
                        SELECT
                            pp.game_date,
                            pp.game_id,
                            pl.player_id,
                            pp.opponent AS our_team,
                            pp.team     AS opp_team,
                            CASE WHEN pp.home = 1 THEN 0 ELSE 1 END AS our_home
                        FROM ${this.probablePitchersTable} pp
                        JOIN ${this.playerLookupsTable} pl
                            ON pl.team = pp.opponent
                        JOIN ${this.playersTable} p ON p.player_id = pl.player_id AND p.position = 'B'
                        WHERE pp.game_date BETWEEN ? AND ?
                            AND p.team_id = ?
                    ) AS g
                ) AS d
                GROUP BY d.player_id, d.opp_team;
            `, [startDate, endDate, teamId, startDate, endDate, teamId]);
            
            // Query the aggregated results from temporary table
            const playerFields = this.getPlayerFields();
            const advancedScoringFields = this.getHitterAdvancedScoringFields();
            const [hitterScores] = await connection.query(`
                SELECT
                    ${playerFields}, 
                    ${advancedScoringFields},
                    p.player_id,
                    SUM(t.games) AS games,
                    pars.reliability_score,
                    SUM(t.games * (
                        0.50*(100 - trs.whip_pct)
                        + 0.30*(100 - trs.fip_pct)
                        + 0.20*(100 - tvb.ops_pct)
                    )) / NULLIF(SUM(t.games),0) AS hitter_week_score
                FROM temp_opponents t
                JOIN ${this.playerLookupsTable} lu ON lu.player_id = t.player_id
                JOIN ${this.playersTable} p ON p.player_id = lu.player_id AND p.position = 'B'
                JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars
                    ON pars.player_id = t.player_id AND pars.span_days = ? AND pars.split_type = 'overall' AND pars.position = 'B'
                JOIN ${this.teamRollingStatsPercentilesTable} trs
                    ON trs.team = t.opponent_team AND trs.split_type = 'overall' AND trs.span_days = ?
                JOIN ${this.teamVsBatterSplitsPercentilesTable} tvb
                    ON tvb.team = t.opponent_team AND tvb.bats = lu.bats AND tvb.span_days = ?
                GROUP BY t.player_id
                ORDER BY hitter_week_score DESC;
            `, [spanDays, spanDays, spanDays, teamId]);

            // Drop the temporary table
            await connection.query(`
                DROP TABLE temp_opponents;
            `);
            
            return hitterScores;
        });
    }

    async getHitterSpeedWatchlist(page=1, spanDays=14, position=false, teamId=false) {
        let positionFilter = position ? `AND p.is_${position.toLowerCase()} = 1` : '';
        const offset = (page - 1) * this.pageSize;
        const minAbs = 15;
        const playerFilter = teamId ? `AND p.team_id = ?` : `AND p.status = ?`;
        const playerFilterValue = teamId ? teamId : 'free_agent';
        const playerFields = this.getPlayerFields();
        const hitterScoringFields = this.getHitterScoringFields();
        const hitterAdvancedScoringFields = this.getHitterAdvancedScoringFields();
        const [hitterScores] = await db.query(`
            SELECT 
                ${playerFields}, 
                ${hitterScoringFields},
                ${hitterAdvancedScoringFields},
                prs_pct.span_days,
                prs_pct.split_type,
                /* score: SB heavy, OBP/contact support, light AVG, penalise K% */
                ( 1.00*prs_pct.sb_pct
                + 0.35*pars.obp_pct
                + 0.25*prs_pct.avg_pct
                - 0.30*pars.k_rate_pct
                + 0.20*prs_pct.runs_pct ) AS sb_pickup_score
            FROM ${this.playerRollingStatsPercentilesTable} prs_pct
            JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars
                ON pars.player_id = prs_pct.player_id AND pars.span_days = prs_pct.span_days AND pars.split_type = prs_pct.split_type AND pars.position = 'B'
            JOIN ${this.playerRollingStatsTable} prs_raw
                ON prs_raw.player_id = prs_pct.player_id AND prs_raw.span_days = ? AND prs_raw.split_type = ? AND prs_raw.position = 'B'
            LEFT JOIN ${this.playerLookupsTable} pls ON pls.player_id = prs_pct.player_id
            LEFT JOIN ${this.playersTable} p ON p.player_id = prs_pct.player_id AND p.position = 'B'
            WHERE prs_pct.span_days = ?
                AND prs_pct.split_type = ?
                AND prs_pct.reliability_score >= 60
                AND prs_raw.abs >= ?
                ${playerFilter}
                ${positionFilter}
            ORDER BY sb_pickup_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, 'overall', spanDays, 'overall', minAbs, playerFilterValue, offset, this.pageSize]);
        return hitterScores;
    }

    async getHitterContactOnBaseWatchlist(page=1, spanDays=14, position=false, teamId=false) {
        let positionFilter = position ? `AND p.is_${position.toLowerCase()} = 1` : '';
        const offset = (page - 1) * this.pageSize;
        const minAbs = 15;
        const playerFilter = teamId ? `AND p.team_id = ?` : `AND p.status = ?`;
        const playerFilterValue = teamId ? teamId : 'free_agent';
        const playerFields = this.getPlayerFields();
        const hitterScoringFields = this.getHitterScoringFields();
        const hitterAdvancedScoringFields = this.getHitterAdvancedScoringFields();
        const [hitterScores] = await db.query(`
            SELECT 
                ${playerFields}, 
                ${hitterScoringFields},
                ${hitterAdvancedScoringFields},
                prs_pct.span_days,
                prs_pct.split_type,
                (0.60*prs_pct.avg_pct + 0.45*pars.obp_pct + 0.25*pars.bb_rate_pct - 0.30*pars.k_rate_pct) AS contact_onbase_score
            FROM ${this.playerRollingStatsPercentilesTable} prs_pct
            JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars
                ON pars.player_id = prs_pct.player_id AND pars.span_days = prs_pct.span_days AND pars.split_type = prs_pct.split_type AND pars.position = 'B'
            JOIN ${this.playerRollingStatsTable} prs_raw ON prs_raw.player_id = prs_pct.player_id AND prs_raw.span_days = ? AND prs_raw.split_type = ? AND prs_raw.position = 'B'
            LEFT JOIN ${this.playerLookupsTable} pls ON pls.player_id = prs_pct.player_id
            LEFT JOIN ${this.playersTable} p ON p.player_id = prs_pct.player_id AND p.position = 'B'
            WHERE prs_pct.span_days = ? AND prs_pct.split_type = ?
                AND prs_pct.reliability_score >= 60
                AND prs_raw.abs >= ?
                ${playerFilter}
                ${positionFilter}
            ORDER BY contact_onbase_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, 'overall', spanDays, 'overall', minAbs, playerFilterValue, offset, this.pageSize]);
        return hitterScores;
    }

    async getHitterPowerWatchlist(page=1, spanDays=14, position=false, teamId=false) {
        let positionFilter = position ? `AND p.is_${position.toLowerCase()} = 1` : '';
        const offset = (page - 1) * this.pageSize;
        const minAbs = 15;
        const playerFilter = teamId ? `AND p.team_id = ?` : `AND p.status = ?`;
        const playerFilterValue = teamId ? teamId : 'free_agent';
        const playerFields = this.getPlayerFields();
        const hitterScoringFields = this.getHitterScoringFields();
        const hitterAdvancedScoringFields = this.getHitterAdvancedScoringFields();
        const [hitterScores] = await db.query(`
            SELECT 
                ${playerFields}, 
                ${hitterScoringFields},
                ${hitterAdvancedScoringFields},
                prs_pct.span_days,
                prs_pct.split_type,
                (0.70*prs_pct.hr_pct + 0.40*pars.iso_pct + 0.35*pars.slg_pct - 0.20*pars.k_rate_pct + 0.15*prs_pct.rbi_pct) AS power_score
            FROM ${this.playerRollingStatsPercentilesTable} prs_pct
            JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars
                ON pars.player_id = prs_pct.player_id AND pars.span_days = prs_pct.span_days AND pars.split_type = prs_pct.split_type AND pars.position = 'B'
            JOIN ${this.playerRollingStatsTable} prs_raw ON prs_raw.player_id = prs_pct.player_id AND prs_raw.span_days = ? AND prs_raw.split_type = ? AND prs_raw.position = 'B'
            LEFT JOIN ${this.playerLookupsTable} pls ON pls.player_id = prs_pct.player_id
            LEFT JOIN ${this.playersTable} p ON p.player_id = prs_pct.player_id AND p.position = 'B'
            WHERE prs_pct.span_days = ? AND prs_pct.split_type = ?
                AND prs_pct.reliability_score >= 60
                AND prs_raw.abs >= ?
                ${playerFilter}
                ${positionFilter}
            ORDER BY power_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, 'overall', spanDays, 'overall', minAbs, playerFilterValue, offset, this.pageSize]);
        return hitterScores;
    }

    async getPitcherStarterWatchlist(page=1, spanDays=14, teamId=false) {
        const offset = (page - 1) * this.pageSize;
        const minIp = 6;
        const playerFilter = teamId ? `AND p.team_id = ?` : `AND p.status = ?`;
        const playerFilterValue = teamId ? teamId : 'free_agent';
        const playerFields = this.getPlayerFields();
        const pitcherScoringFields = this.getPitcherScoringFields();
        const pitcherAdvancedScoringFields = this.getPitcherAdvancedScoringFields();
        const [starterScores] = await db.query(`
            SELECT 
                ${playerFields}, 
                ${pitcherScoringFields},
                ${pitcherAdvancedScoringFields},
                prs_pct.span_days,
                prs_pct.split_type,
                (0.45*pars.k_per_9_pct - 0.30*pars.bb_per_9_pct + 0.30*prs_pct.qs_pct + 0.25*pars.fip_pct
                    + 0.15*prs_pct.whip_pct + 0.10*prs_pct.era_pct) AS k_qs_score
            FROM ${this.playerRollingStatsPercentilesTable} prs_pct
            JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars
                ON pars.player_id = prs_pct.player_id AND pars.span_days = prs_pct.span_days AND pars.split_type = prs_pct.split_type AND pars.position = 'P'
            JOIN ${this.playerRollingStatsTable} prs_raw ON prs_raw.player_id = prs_pct.player_id AND prs_raw.span_days = ? AND prs_raw.split_type = ? AND prs_raw.position = 'P'
            LEFT JOIN ${this.playerLookupsTable} pls ON pls.player_id = prs_pct.player_id
            LEFT JOIN ${this.playersTable} p ON p.player_id = prs_pct.player_id AND p.position = 'P'
            WHERE prs_pct.span_days = ? AND prs_pct.split_type = ?
                AND prs_pct.reliability_score >= 60
                AND prs_raw.ip >= ?
                ${playerFilter}
            ORDER BY k_qs_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, 'overall', spanDays, 'overall', minIp, playerFilterValue, offset, this.pageSize]);
        return starterScores;
    }

    async getPitcherRelieverWatchlist(page=1, spanDays=14, teamId=false) {
        const offset = (page - 1) * this.pageSize;
        const minIp = 4;
        const playerFilter = teamId ? `AND p.team_id = ?` : `AND p.status = ?`;
        const playerFilterValue = teamId ? teamId : 'free_agent';
        const playerFields = this.getPlayerFields();
        const pitcherScoringFields = this.getPitcherScoringFields();
        const pitcherAdvancedScoringFields = this.getPitcherAdvancedScoringFields();
        const [relieverScores] = await db.query(`
            SELECT 
                ${playerFields}, 
                ${pitcherScoringFields},
                ${pitcherAdvancedScoringFields},
                prs_pct.span_days,
                prs_pct.split_type,
                /* Emphasise recent role (SV/HLD), then skills; punish walks */
                (0.55*GREATEST(prs_pct.sv_pct, prs_pct.hld_pct)
                    + 0.25*pars.k_per_9_pct
                    + 0.15*prs_pct.whip_pct
                    + 0.20*pars.fip_pct
                    - 0.20*pars.bb_per_9_pct) AS leverage_relief_score
            FROM ${this.playerRollingStatsPercentilesTable} prs_pct
            JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars
                ON pars.player_id = prs_pct.player_id AND pars.span_days = prs_pct.span_days AND pars.split_type = prs_pct.split_type AND pars.position = 'P'
            JOIN ${this.playerRollingStatsTable} prs_raw
                ON prs_raw.player_id = prs_pct.player_id AND prs_raw.span_days = ? AND prs_raw.split_type = ? AND prs_raw.position = 'P'
            LEFT JOIN ${this.playerLookupsTable} pls ON pls.player_id = prs_pct.player_id
            LEFT JOIN ${this.playersTable} p ON p.player_id = prs_pct.player_id AND p.position = 'P'
            WHERE prs_pct.span_days = ? AND prs_pct.split_type = ?
                AND prs_pct.reliability_score >= 55
                AND prs_raw.ip >= ?
                ${playerFilter}
            ORDER BY leverage_relief_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, 'overall', spanDays, 'overall', minIp, playerFilterValue, offset, this.pageSize]);
        return relieverScores;
    }

    async getPlayerFantasyRankings(page=1, spanDays=14, batterOrPitcher='B', isRostered=false, position=false, orderBy=false, teamId=false) {
        const playerFields = this.getPlayerFields();
        const pitcherScoringFields = this.getPitcherScoringFields();
        const hitterScoringFields = this.getHitterScoringFields();
        const hitterAdvancedScoringFields = this.getHitterAdvancedScoringFields();
        const pitcherAdvancedScoringFields = this.getPitcherAdvancedScoringFields();
        const scoringFields = batterOrPitcher === 'B' ? hitterScoringFields : pitcherScoringFields;
        const advancedScoringFields = batterOrPitcher === 'B' ? hitterAdvancedScoringFields : pitcherAdvancedScoringFields;
        const isRosteredFilter = ! isRostered ? `AND p.status = 'free_agent'` : '';
        const teamFilter = teamId ? `AND p.team_id = ?` : '';
        const positionFilter = position ? `AND p.is_${position.toLowerCase()} = 1` : '';
        const minDataClause = batterOrPitcher === 'B' ? `AND prs_raw.abs >= ?` : `AND prs_raw.ip >= ?`;
        const minDataValue = batterOrPitcher === 'B' ? 15 : 4;
        const offset = (page - 1) * this.pageSize;
        
        let orderByClause = batterOrPitcher === 'B' ? `batter_score DESC` : `pitcher_score DESC`;
        if ( orderBy ) {
            orderByClause = `prs_pct.${orderBy}_pct DESC, ${orderByClause}`;
        }

        const params = teamId ? 
        [spanDays, 'overall', batterOrPitcher, batterOrPitcher, batterOrPitcher, spanDays, 'overall', minDataValue, teamId, this.pageSize, offset] : 
        [spanDays, 'overall', batterOrPitcher, batterOrPitcher, batterOrPitcher, spanDays, 'overall', minDataValue, this.pageSize, offset];
        const [playerRankings] = await db.query(`
            SELECT 
                ${playerFields}, 
                ${scoringFields},
                ${advancedScoringFields},
                prs_pct.span_days,
                prs_pct.split_type,

                /* Batter fantasy score: All 5 hitting categories */
                (0.25 * prs_pct.runs_pct + 
                0.25 * prs_pct.hr_pct + 
                0.25 * prs_pct.rbi_pct + 
                0.15 * prs_pct.sb_pct + 
                0.10 * prs_pct.avg_pct) AS batter_score,

                /* Pitcher fantasy score: K, QS, SVH heavy, with ERA/WHIP control */
                (0.25 * prs_pct.strikeouts_pct + 
                0.25 * prs_pct.qs_pct + 
                0.20 * GREATEST(prs_pct.sv_pct, prs_pct.hld_pct) + 
                0.15 * (100 - prs_pct.era_pct) + 
                0.15 * (100 - prs_pct.whip_pct)) AS pitcher_score
                
            FROM ${this.playerRollingStatsPercentilesTable} prs_pct
            JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars
                ON pars.player_id = prs_pct.player_id AND pars.span_days = prs_pct.span_days AND pars.split_type = prs_pct.split_type AND pars.position = ?
            JOIN ${this.playerRollingStatsTable} prs_raw ON prs_raw.player_id = prs_pct.player_id AND prs_raw.span_days = ? AND prs_raw.split_type = ? AND prs_raw.position = ?
            LEFT JOIN ${this.playerLookupsTable} pls ON pls.player_id = prs_pct.player_id
            LEFT JOIN ${this.playersTable} p ON p.player_id = prs_pct.player_id AND p.position = ?
            WHERE prs_pct.span_days = ? AND prs_pct.split_type = ?
                ${isRosteredFilter}
                ${positionFilter}
                ${minDataClause}
                ${teamFilter}
            ORDER BY ${orderByClause}
            LIMIT ? OFFSET ?;
        `, params);
        return playerRankings;
    }

    async getNRFIRankings(startDate, endDate) {
        if (!startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        const spanDays = 30;
        const playerFields = this.getPlayerFields();
        const pitcherScoringFields = this.getPitcherScoringFields();
        const pitcherAdvancedScoringFields = this.getPitcherAdvancedScoringFields();
        const [nrfiRankings] = await db.query(`
            SELECT 
                pp.game_date, pp.team, pp.opponent, pp.home, pp.player_id, pp.accuracy, pp.nrfi_likelihood_score,
                ${playerFields}, 
                ${pitcherScoringFields},
                ${pitcherAdvancedScoringFields},
                team_rs_pct.nrfi_pct AS team_nrfi_pct,
                opponent_rs_pct.nrfi_pct AS opponent_nrfi_pct,
                prs_pct.nrfi_pct AS player_nrfi_pct,
                AVG(pp.nrfi_likelihood_score) OVER (PARTITION BY pp.game_id) AS avg_nrfi_score
            FROM ${this.probablePitchersTable} pp
            LEFT JOIN ${this.playersTable} p ON p.player_id = pp.player_id
            LEFT JOIN ${this.playerLookupsTable} pl ON pl.player_id = pp.player_id
            LEFT JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars 
                ON pars.player_id = pp.player_id AND pars.span_days = ? AND pars.split_type = 'overall' AND pars.position = 'P'
            LEFT JOIN ${this.playerRollingStatsPercentilesTable} prs_pct
                ON prs_pct.player_id = pp.player_id AND prs_pct.span_days = ? AND prs_pct.split_type = 'overall' AND prs_pct.position = 'P'
            LEFT JOIN ${this.playerRollingStatsTable} prs_raw
                ON prs_raw.player_id = pp.player_id AND prs_raw.span_days = ? AND prs_raw.split_type = 'overall' AND prs_raw.position = 'P'
            RIGHT JOIN ${this.teamRollingStatsPercentilesTable} team_rs_pct
                ON team_rs_pct.team = pp.team AND team_rs_pct.span_days = ? AND team_rs_pct.split_type = 'overall'
            RIGHT JOIN ${this.teamRollingStatsPercentilesTable} opponent_rs_pct
                ON opponent_rs_pct.team = pp.opponent AND opponent_rs_pct.span_days = ? AND opponent_rs_pct.split_type = 'overall'
            WHERE pp.game_date BETWEEN ? AND ? 
                AND pp.avg_nrfi_score IS NOT NULL
            ORDER BY pp.game_date ASC, avg_nrfi_score DESC
            `, 
            [spanDays, spanDays, spanDays, spanDays, spanDays, spanDays, startDate, endDate]
        );
        return nrfiRankings;
    }
    }

module.exports = Player;