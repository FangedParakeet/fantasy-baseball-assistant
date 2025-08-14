const { db, executeInTransaction } = require('../db');

class Player {
    constructor() {
        this.probablePitchersTable = 'probable_pitchers';
        this.playersTable = 'players';
        this.playerLookupsTable = 'player_lookup';
        this.playerRollingStatsTable = 'player_rolling_stats';
        this.playerRollingStatsPercentilesTable = 'player_rolling_stats_percentiles';
        this.playerAdvancedRollingStatsPercentilesTable = 'player_advanced_rolling_stats_percentiles';
        this.teamVsPitcherSplitsPercentilesTable = 'team_vs_pitcher_splits_percentiles';

        this.pageSize = 25
    }

    async getAvailableTwoStartPitchers(startDate, endDate) {
        if (!startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        const spanDays = 30;
        const [probablePitchers] = await db.query(
            `SELECT 
                p.id, pp.game_date, pp.team, pp.opponent, pp.home, pp.player_id, p.normalised_name, pp.accuracy, pp.qs_likelihood_score,
                p.name, p.mlb_team, p.eligible_positions, p.headshot_url,
                prs_raw.ip,
                prs_raw.strikeouts,
                prs.strikeouts_pct,
                prs_raw.era,
                prs.era_pct,
                prs_raw.whip,
                prs.whip_pct,
                prs_raw.qs,
                prs.qs_pct,
                prs_raw.sv,
                prs.sv_pct,
                prs_raw.hld,
                prs.hld_pct,
                pars.k_per_9_pct,
                pars.bb_per_9_pct,
                pars.fip_pct,
                prs.reliability_score
            FROM ${this.probablePitchersTable} pp
            LEFT JOIN ${this.playersTable} p ON p.player_id = pp.player_id
            LEFT JOIN ${this.playerLookupsTable} pl ON pl.player_id = pp.player_id
            LEFT JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars 
                ON pars.player_id = pp.player_id AND pars.span_days = ? AND pars.split_type = 'overall' AND pars.position = 'P'
            LEFT JOIN ${this.playerRollingStatsPercentilesTable} prs
                ON prs.player_id = pp.player_id AND prs.span_days = ? AND prs.split_type = 'overall' AND prs.position = 'P'
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
            ORDER BY pp.normalised_name ASC, pp.game_date ASC
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
        const [probablePitchers] = await db.query(
            `SELECT pp.game_date, pp.team, pp.opponent, pp.home, pp.player_id, pp.normalised_name, pp.accuracy, pp.qs_likelihood_score,
                p.name, p.mlb_team, p.eligible_positions, p.headshot_url,
                prs_raw.ip,
                prs_raw.strikeouts,
                prs.strikeouts_pct,
                prs_raw.era,
                prs.era_pct,
                prs_raw.whip,
                prs.whip_pct,
                prs_raw.qs,
                prs.qs_pct,
                prs_raw.sv,
                prs.sv_pct,
                prs_raw.hld,
                prs.hld_pct,
                pars.k_per_9_pct,
                pars.bb_per_9_pct,
                pars.fip_pct,
                prs.reliability_score
            FROM ${this.probablePitchersTable} pp
            LEFT JOIN ${this.playersTable} p ON p.player_id = pp.player_id
            LEFT JOIN ${this.playerLookupsTable} pl ON pl.player_id = pp.player_id
            LEFT JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars 
                ON pars.player_id = pp.player_id AND pars.span_days = ? AND pars.split_type = 'overall' AND pars.position = 'P'
            LEFT JOIN ${this.playerRollingStatsPercentilesTable} prs
                ON prs.player_id = pp.player_id AND prs.span_days = ? AND prs.split_type = 'overall' AND prs.position = 'P'
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
        const [probablePitchers] = await db.query(
            `SELECT 
                p.id, pp.game_date, pp.team, pp.opponent, pp.home, pp.player_id, pp.normalised_name, pp.accuracy, pp.qs_likelihood_score,
                p.name, p.mlb_team, p.eligible_positions, p.headshot_url
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
            ORDER BY pp.game_date ASC, pp.normalised_name ASC
            `,
            [startDate, endDate, teamId, startDate, endDate]
        );
        return probablePitchers;
    }

    async getProbablePitchersForTeam(teamId, startDate, endDate) {
        if (!teamId || !startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        const [probablePitchers] = await db.query(
            `SELECT 
                pp.game_date, pp.team, pp.opponent, pp.home, p.player_id, p.normalised_name, pp.accuracy, pp.qs_likelihood_score,
                p.name, p.mlb_team, p.eligible_positions, p.headshot_url
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
        let orderByClause = '';
        if (orderBy) {
            orderByClause = `ORDER BY prs_p.${orderBy}_pct DESC`;
        }
        const [playerStats] = await db.query(
            `SELECT p.id, p.name, p.mlb_team, p.eligible_positions, p.selected_position, p.headshot_url, 
            prs.hits, prs.abs, prs.runs, prs_p.runs_pct, prs.hr, prs_p.hr_pct, prs.rbi, prs_p.rbi_pct, prs.sb, prs_p.sb_pct, prs.avg, prs_p.avg_pct 
            FROM ${this.playersTable} p
            LEFT JOIN ${this.playerRollingStatsTable} prs 
                ON prs.player_id = p.player_id 
                AND prs.position = p.position
                AND prs.span_days = ?
                AND prs.split_type = 'overall'
            LEFT JOIN ${this.playerRollingStatsPercentilesTable} prs_p 
                ON prs_p.player_id = p.player_id
                AND prs_p.position = p.position
                AND prs_p.span_days = ?
                AND prs_p.split_type = 'overall'
            WHERE p.team_id = ? AND p.position = 'B'
            ${orderByClause}
            `,
            [spanDays, spanDays, teamId]
        );
        return playerStats;
    }

    async getScoringStatsForTeamPitchers(teamId, spanDays=14, orderBy=false) {
        if (!teamId) {
            throw new Error('Missing required parameters');
        }
        let orderByClause = '';
        if (orderBy) {
            orderByClause = `ORDER BY prs_p.${orderBy}_pct DESC`;
        }
        const [playerStats] = await db.query(
            `SELECT p.id, p.name, p.mlb_team, p.eligible_positions, p.selected_position, p.headshot_url, 
            prs.ip, prs.strikeouts, prs_p.strikeouts_pct, prs.era, prs_p.era_pct, prs.whip, prs_p.whip_pct, prs.qs, prs_p.qs_pct, prs.sv, prs_p.sv_pct, prs.hld, prs_p.hld_pct
            FROM ${this.playersTable} p
            LEFT JOIN ${this.playerRollingStatsTable} prs 
                ON prs.player_id = p.player_id 
                AND prs.position = p.position
                AND prs.span_days = ?
                AND prs.split_type = 'overall'
            LEFT JOIN ${this.playerRollingStatsPercentilesTable} prs_p 
                ON prs_p.player_id = p.player_id
                AND prs_p.position = p.position
                AND prs_p.span_days = ?
                AND prs_p.split_type = 'overall'
            WHERE p.team_id = ? AND p.position = 'P'
            ${orderByClause}
            `,
            [spanDays, spanDays, teamId]
        );
        return playerStats;
    }

    async getWeeklyPitcherScheduleStrengthPreviewForTeam(teamId, startDate, endDate, spanDays=14) {
        if (!teamId || !startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        return executeInTransaction(async (connection) => {
            const [pitcherScores] = await connection.query(`
                SELECT p.id, p.name, p.mlb_team, p.eligible_positions, p.selected_position, p.headshot_url, 
                    AVG(start_score) AS week_stream_score, COUNT(*) AS starts, 
                    MAX(qs_pct) AS qs_pct, MAX(fip_pct) AS fip_pct, 100 - AVG(opp_ops_vs_hand_pct) AS opp_ops_vs_hand_pct,
                    MAX(bb_per_9_pct) AS bb_per_9_pct
                    FROM (
                        SELECT
                            p.id,
                            pp.player_id,
                            p.name,
                            p.headshot_url,
                            p.mlb_team,
                            p.eligible_positions,
                            p.selected_position,
                            pp.game_date,
                            pp.team,
                            pp.opponent,
                            pp.home,
                            tvp.ops_pct     AS opp_ops_vs_hand_pct,
                            pars.fip_pct,
                            prs.qs_pct,
                            pars.bb_per_9_pct,
                            /* start_score formula - handle NULLs gracefully */
                            (0.45*(100 - COALESCE(tvp.ops_pct, 50))  -- Default to 50 if missing
                                + 0.25*COALESCE(pars.fip_pct, 50)    -- Default to 50 if missing
                                + 0.20*COALESCE(prs.qs_pct, 50)      -- Default to 50 if missing
                                + 0.10*(100 - COALESCE(pars.bb_per_9_pct, 50))  -- Default to 50 if missing
                                + CASE WHEN pp.home THEN 3 ELSE 0 END) AS start_score
                        FROM ${this.probablePitchersTable} pp
                        JOIN ${this.playersTable} p ON p.player_id = pp.player_id AND p.position = 'P'
                        JOIN ${this.playerLookupsTable} lu ON lu.player_id = pp.player_id
                        LEFT JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars
                            ON pars.player_id = pp.player_id AND pars.span_days = ? AND pars.split_type = 'overall' AND pars.position = 'P'
                        LEFT JOIN ${this.playerRollingStatsPercentilesTable} prs
                            ON prs.player_id = pp.player_id AND prs.span_days = ? AND prs.split_type = 'overall' AND prs.position = 'P'
                        LEFT JOIN ${this.teamVsPitcherSplitsPercentilesTable} tvp
                            ON tvp.team = pp.opponent AND tvp.throws = lu.throws AND tvp.span_days = ?
                        WHERE pp.game_date BETWEEN ? AND ?
                            AND pp.player_id IS NOT NULL
                            AND p.team_id = ?
                        ) s
                    GROUP BY player_id
                    ORDER BY week_stream_score DESC
                `, [spanDays, spanDays, spanDays, startDate, endDate, teamId]);
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
            const [hitterScores] = await connection.query(`
                SELECT
                    p.id,
                    p.player_id,
                    p.name,
                    p.mlb_team,
                    p.eligible_positions,
                    p.selected_position,
                    p.headshot_url,
                    SUM(t.games * (
                        0.50*(100 - trs.whip_pct)
                        + 0.30*(100 - trs.fip_pct)
                        + 0.20*(100 - tvb.ops_pct)
                    )) / NULLIF(SUM(t.games),0) AS hitter_week_score
                FROM temp_opponents t
                JOIN ${this.playerLookupsTable} lu ON lu.player_id = t.player_id
                JOIN ${this.playersTable} p ON p.player_id = lu.player_id AND p.position = 'B'
                JOIN ${this.teamRollingStatsPercentilesTable} trs
                    ON trs.team = t.opponent_team AND trs.split_type = 'overall' AND trs.span_days = ? AND trs.position = 'B'
                JOIN ${this.teamVsBatterSplitsPercentilesTable} tvb
                    ON tvb.team = t.opponent_team AND tvb.bats = lu.bats AND tvb.span_days = ?
                GROUP BY t.player_id
                ORDER BY hitter_week_score DESC;
            `, [spanDays, spanDays, teamId]);

            // Drop the temporary table
            await connection.query(`
                DROP TABLE temp_opponents;
            `);
            
            return hitterScores;
        });
    }

    async getHitterSpeedWatchlist(page=1, spanDays=14, position=false) {
        let positionFilter = position ? `AND p.is_${position.toLowerCase()} = 1` : '';
        const offset = (page - 1) * this.pageSize;
        const minAbs = 15;
        const [hitterScores] = await db.query(`
            SELECT p.id,
                p.player_id,
                p.name,
                p.mlb_team,
                p.eligible_positions,
                p.headshot_url,
                prs.span_days,
                prs.split_type,
                prs_raw.hits,
                prs_raw.abs,
                prs_raw.runs,
                prs.runs_pct,
                prs_raw.hr,
                prs.hr_pct,
                prs_raw.rbi,
                prs.rbi_pct,
                prs_raw.avg,
                prs.avg_pct,
                prs_raw.sb,
                prs.sb_pct,
                pars.obp_pct,
                pars.k_rate_pct,
                prs.reliability_score,
                /* score: SB heavy, OBP/contact support, light AVG, penalise K% */
                ( 1.00*prs.sb_pct
                + 0.35*pars.obp_pct
                + 0.25*prs.avg_pct
                - 0.30*pars.k_rate_pct
                + 0.20*prs.runs_pct ) AS sb_pickup_score
            FROM ${this.playerRollingStatsPercentilesTable} prs
            JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars
                ON pars.player_id = prs.player_id AND pars.span_days = prs.span_days AND pars.split_type = prs.split_type AND pars.position = 'B'
            JOIN ${this.playerRollingStatsTable} prs_raw
                ON prs_raw.player_id = prs.player_id AND prs_raw.span_days = ? AND prs_raw.split_type = ? AND prs_raw.position = 'B'
            LEFT JOIN ${this.playerLookupsTable} pls ON pls.player_id = prs.player_id
            LEFT JOIN ${this.playersTable} p ON p.player_id = prs.player_id AND p.position = 'B'
            WHERE prs.span_days = ?
                AND prs.split_type = ?
                AND prs.reliability_score >= 60
                AND prs_raw.abs >= ?
                AND p.status = 'free_agent'
                ${positionFilter}
            ORDER BY sb_pickup_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, spanDays, minAbs, offset, this.pageSize]);
        return hitterScores;
    }

    async getHitterContactOnBaseWatchlist(page=1, spanDays=14, position=false) {
        let positionFilter = position ? `AND p.is_${position.toLowerCase()} = 1` : '';
        const offset = (page - 1) * this.pageSize;
        const minAbs = 15;
        const [hitterScores] = await db.query(`
            SELECT p.id,
                p.player_id,
                p.name,
                p.mlb_team,
                p.eligible_positions,
                p.headshot_url,
                prs.span_days,
                prs.split_type,
                prs_raw.hits,
                prs.hits_pct,
                prs_raw.abs,
                prs_raw.runs,
                prs.runs_pct,
                prs_raw.hr,
                prs.hr_pct,
                prs_raw.rbi,
                prs.rbi_pct,
                prs_raw.avg,
                prs.avg_pct,
                prs_raw.sb,
                prs.sb_pct,
                pars.obp_pct,
                pars.bb_rate_pct,
                pars.k_rate_pct,
                prs.reliability_score,
                (0.60*prs.avg_pct + 0.45*pars.obp_pct + 0.25*pars.bb_rate_pct - 0.30*pars.k_rate_pct) AS contact_onbase_score
            FROM ${this.playerRollingStatsPercentilesTable} prs
            JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars
                ON pars.player_id = prs.player_id AND pars.span_days = prs.span_days AND pars.split_type = prs.split_type AND pars.position = 'B'
            JOIN ${this.playerRollingStatsTable} prs_raw ON prs_raw.player_id = prs.player_id AND prs_raw.span_days = ? AND prs_raw.split_type = 'overall' AND prs_raw.position = 'B'
            LEFT JOIN ${this.playerLookupsTable} pls ON pls.player_id = prs.player_id
            LEFT JOIN ${this.playersTable} p ON p.player_id = prs.player_id AND p.position = 'B'
            WHERE prs.span_days = ? AND prs.split_type = 'overall'
                AND prs.reliability_score >= 60
                AND prs_raw.abs >= ?
                AND p.status = 'free_agent'
                ${positionFilter}
            ORDER BY contact_onbase_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, spanDays, minAbs, this.pageSize, offset]);
        return hitterScores;
    }

    async getHitterPowerWatchlist(page=1, spanDays=14, position=false) {
        let positionFilter = position ? `AND p.is_${position.toLowerCase()} = 1` : '';
        const offset = (page - 1) * this.pageSize;
        const minAbs = 15;
        const [hitterScores] = await db.query(`
            SELECT p.id,
                p.player_id,
                p.name,
                p.mlb_team,
                p.eligible_positions,
                p.headshot_url,
                prs_raw.hits,
                prs_raw.abs,
                prs_raw.runs,
                prs.runs_pct,
                prs_raw.hr,
                prs.hr_pct,
                prs_raw.rbi,
                prs.rbi_pct,
                prs_raw.avg,
                prs.avg_pct,
                prs_raw.sb,
                prs.sb_pct,
                prs.span_days,
                prs.split_type,
                pars.iso_pct,
                pars.slg_pct,
                pars.k_rate_pct,
                prs.reliability_score,
                (0.70*prs.hr_pct + 0.40*pars.iso_pct + 0.35*pars.slg_pct - 0.20*pars.k_rate_pct + 0.15*prs.rbi_pct) AS power_score
            FROM ${this.playerRollingStatsPercentilesTable} prs
            JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars
                ON pars.player_id = prs.player_id AND pars.span_days = prs.span_days AND pars.split_type = prs.split_type AND pars.position = 'B'
            JOIN ${this.playerRollingStatsTable} prs_raw ON prs_raw.player_id = prs.player_id AND prs_raw.span_days = ? AND prs_raw.split_type = 'overall' AND prs_raw.position = 'B'
            LEFT JOIN ${this.playerLookupsTable} pls ON pls.player_id = prs.player_id
            LEFT JOIN ${this.playersTable} p ON p.player_id = prs.player_id AND p.position = 'B'
            WHERE prs.span_days = ? AND prs.split_type = 'overall'
                AND prs.reliability_score >= 60
                AND prs_raw.abs >= ?
                AND p.status = 'free_agent'
                ${positionFilter}
            ORDER BY power_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, spanDays, minAbs, this.pageSize, offset]);
        return hitterScores;
    }

    async getPitcherStarterWatchlist(page=1, spanDays=14) {
        const offset = (page - 1) * this.pageSize;
        const minIp = 6;
        const [starterScores] = await db.query(`
            SELECT p.id,
                p.player_id,
                p.name,
                p.mlb_team,
                p.eligible_positions,
                p.headshot_url,
                prs.span_days,
                prs.split_type,
                prs_raw.ip,
                prs_raw.strikeouts,
                prs.strikeouts_pct,
                prs_raw.era,
                prs.era_pct,
                prs_raw.whip,
                prs.whip_pct,
                prs_raw.qs,
                prs.qs_pct,
                prs_raw.sv,
                prs.sv_pct,
                prs_raw.hld,
                prs.hld_pct,
                pars.k_per_9_pct,
                pars.bb_per_9_pct,
                pars.fip_pct,
                prs.reliability_score,
                (0.45*pars.k_per_9_pct - 0.30*pars.bb_per_9_pct + 0.30*prs.qs_pct + 0.25*pars.fip_pct
                    + 0.15*prs.whip_pct + 0.10*prs.era_pct) AS k_qs_score
            FROM ${this.playerRollingStatsPercentilesTable} prs
            JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars
                ON pars.player_id = prs.player_id AND pars.span_days = prs.span_days AND pars.split_type = prs.split_type AND pars.position = 'P'
            JOIN ${this.playerRollingStatsTable} prs_raw ON prs_raw.player_id = prs.player_id AND prs_raw.span_days = ? AND prs_raw.split_type = 'overall' AND prs_raw.position = 'P'
            LEFT JOIN ${this.playerLookupsTable} pls ON pls.player_id = prs.player_id
            LEFT JOIN ${this.playersTable} p ON p.player_id = prs.player_id AND p.position = 'P'
            WHERE prs.span_days = ? AND prs.split_type = 'overall'
                AND prs.reliability_score >= 60
                AND prs_raw.ip >= ?
                AND p.status = 'free_agent'
            ORDER BY k_qs_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, spanDays, minIp, this.pageSize, offset]);
        return starterScores;
    }

    async getPitcherRelieverWatchlist(page=1, spanDays=14) {
        const offset = (page - 1) * this.pageSize;
        const minIp = 4;
        const [relieverScores] = await db.query(`
            SELECT p.id,
                p.player_id,
                p.name,
                p.mlb_team,
                p.eligible_positions,
                p.headshot_url,
                prs.span_days,
                prs.split_type,
                prs_raw.ip,
                prs_raw.strikeouts,
                prs.strikeouts_pct,
                prs_raw.era,
                prs.era_pct,
                prs_raw.whip,
                prs.whip_pct,
                prs_raw.qs,
                prs.qs_pct,
                prs_raw.sv,
                prs.sv_pct,
                prs_raw.hld,
                prs.hld_pct,
                pars.k_per_9_pct,
                pars.bb_per_9_pct,
                pars.fip_pct,
                prs.reliability_score,
                /* Emphasise recent role (SV/HLD), then skills; punish walks */
                (0.55*GREATEST(prs.sv_pct, prs.hld_pct)
                    + 0.25*pars.k_per_9_pct
                    + 0.15*prs.whip_pct
                    + 0.20*pars.fip_pct
                    - 0.20*pars.bb_per_9_pct) AS leverage_relief_score
            FROM ${this.playerRollingStatsPercentilesTable} prs
            JOIN ${this.playerAdvancedRollingStatsPercentilesTable} pars
                ON pars.player_id = prs.player_id AND pars.span_days = prs.span_days AND pars.split_type = prs.split_type AND pars.position = 'P'
            JOIN ${this.playerRollingStatsTable} prs_raw
                ON prs_raw.player_id = prs.player_id AND prs_raw.span_days = ? AND prs_raw.split_type = 'overall' AND prs_raw.position = 'P'
            LEFT JOIN ${this.playerLookupsTable} pls ON pls.player_id = prs.player_id
            LEFT JOIN ${this.playersTable} p ON p.player_id = prs.player_id AND p.position = 'P'
            WHERE prs.span_days = ? AND prs.split_type = 'overall'
                AND prs.reliability_score >= 55
                AND prs_raw.ip >= ?
                AND p.status = 'free_agent'
            ORDER BY leverage_relief_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, spanDays, minIp, this.pageSize, offset]);
        return relieverScores;
    }
}

module.exports = Player;