# Advanced Baseball Statistics

This document outlines the new advanced statistics fields added to the player game logs and their importance for baseball analytics.

## New Batting Statistics

### Basic Hit Types
- **singles**: Number of singles (calculated as hits - homeRuns - doubles - triples)
- **doubles**: Number of doubles (from MLB API)
- **triples**: Number of triples (from MLB API)

### Advanced Batting Metrics
- **total_bases**: Total bases (from MLB API) - used for SLG calculations
- **sac_flies**: Sacrifice flies (from MLB API) - used for OBP calculations
- **hit_by_pitch**: Hit by pitch (from MLB API) - used for OBP and wOBA
- **ground_outs**: Ground outs (from MLB API) - contact quality analysis
- **air_outs**: Air outs/fly outs (from MLB API) - contact quality analysis
- **left_on_base**: Left on base (from MLB API) - situational hitting
- **ground_into_dp**: Ground into double plays (from MLB API) - situational hitting

## New Pitching Statistics

### Advanced Pitching Metrics
- **batters_faced**: Batters faced (from MLB API) - for advanced metrics
- **wild_pitches**: Wild pitches (from MLB API) - control metrics
- **balks**: Balks (from MLB API) - control metrics
- **home_runs_allowed**: Home runs allowed (from MLB API) - specific HR tracking
- **inherited_runners**: Inherited runners (from MLB API) - relief situations
- **inherited_runners_scored**: Inherited runners scored (from MLB API) - relief effectiveness

## Advanced Analytics Applications

### Batting Analytics
1. **Contact Quality Analysis**
   - Ground out to air out ratio
   - BABIP calculations with more granular data
   - Contact type distribution

2. **Situational Hitting**
   - Clutch hitting with LOB data
   - Double play avoidance
   - Sacrifice effectiveness

3. **Advanced Metrics**
   - wOBA with HBP inclusion
   - wRC+ calculations
   - ISO (Isolated Power) = (doubles + 2*triples + 3*homeRuns) / atBats

### Pitching Analytics
1. **Control Metrics**
   - Wild pitch rate
   - Balk frequency
   - BB/9 with more context

2. **Relief Pitching**
   - **Saves**: Directly from MLB API (`saves` field)
   - **Holds**: Directly from MLB API (`holds` field)
   - **Blown Saves**: Available from MLB API (`blownSaves` field)
   - **Save Opportunities**: Available from MLB API (`saveOpportunities` field)
   - Inherited runner scoring rate (inherited_runners_scored / inherited_runners)
   - High-leverage situation effectiveness

3. **Advanced Metrics**
   - FIP with more granular HR data
   - K/BB ratio with batters faced context

## Database Schema Changes

The `player_game_logs` table now includes these new columns with default values of 0:

```sql
-- New advanced batting statistics
singles INT DEFAULT 0,
doubles INT DEFAULT 0,
triples INT DEFAULT 0,
total_bases INT DEFAULT 0,
sac_flies INT DEFAULT 0,
hit_by_pitch INT DEFAULT 0,
ground_outs INT DEFAULT 0,
air_outs INT DEFAULT 0,
left_on_base INT DEFAULT 0,
ground_into_dp INT DEFAULT 0,

-- New advanced pitching statistics
batters_faced INT DEFAULT 0,
wild_pitches INT DEFAULT 0,
balks INT DEFAULT 0,
home_runs_allowed INT DEFAULT 0,
inherited_runners INT DEFAULT 0,
inherited_runners_scored INT DEFAULT 0,
```

## Migration

The migration script automatically adds these columns to existing databases. The sync process will now extract these fields from the MLB API and populate them in the database.

## Testing

Run the test script to verify field extraction:

```bash
cd pybaseball
python test_mlb_api_fields.py
```

This will test the extraction of new fields from a recent MLB game and display the values found. 