ROLLING_WINDOWS = [7, 14, 30]
MAX_AGE_DAYS = 30
BUFFER_DAYS = 7
# MLB team IDs for the 30 MLB teams
MLB_TEAM_IDS = {
    'NYY': 147, 'BOS': 111, 'TOR': 141, 'BAL': 110, 'TB': 139,
    'CLE': 114, 'DET': 116, 'KC': 118, 'MIN': 142, 'CWS': 145,
    'HOU': 117, 'TEX': 140, 'LAA': 108, 'OAK': 133, 'SEA': 136,
    'ATL': 144, 'MIA': 146, 'NYM': 121, 'PHI': 143, 'WSH': 120,
    'CHC': 112, 'CIN': 113, 'MIL': 158, 'PIT': 134, 'STL': 138,
    'ARI': 109, 'COL': 115, 'LAD': 119, 'SD': 135, 'SF': 137
}
SPLITS = ['overall', 'home', 'away', 'vs_lhp', 'vs_rhp']
WOBASCALE = 1.25  # This should ideally be year-specific
LEAGUE_WOBA = 0.320
LEAGUE_ERA = 4.20
BATCH_SIZE = 500
