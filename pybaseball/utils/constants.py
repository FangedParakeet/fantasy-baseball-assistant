ROLLING_WINDOWS = [7, 14, 30]
MAX_AGE_DAYS = 30
BUFFER_DAYS = 7
BATCH_SIZE = 500
# MLB team IDs for the 30 MLB teams
MLB_TEAM_IDS = {
    'NYY': 147, 'BOS': 111, 'TOR': 141, 'BAL': 110, 'TB': 139,
    'CLE': 114, 'DET': 116, 'KC': 118, 'MIN': 142, 'CWS': 145,
    'HOU': 117, 'TEX': 140, 'LAA': 108, 'OAK': 133, 'SEA': 136,
    'ATL': 144, 'MIA': 146, 'NYM': 121, 'PHI': 143, 'WSH': 120,
    'CHC': 112, 'CIN': 113, 'MIL': 158, 'PIT': 134, 'STL': 138,
    'ARI': 109, 'COL': 115, 'LAD': 119, 'SD': 135, 'SF': 137
}
MLB_TEAM_IDS_REVERSE_MAP = {v: k for k, v in MLB_TEAM_IDS.items()}

# Mapping from Yahoo API team abbreviations to backend team abbreviations
YAHOO_TO_BACKEND_TEAM_MAP = {
    'AZ': 'ARI',  # Arizona Diamondbacks
    'TB': 'TB',   # Tampa Bay Rays (same)
    'KC': 'KC',   # Kansas City Royals (same)
    'CWS': 'CWS', # Chicago White Sox (same)
    'LAA': 'LAA', # Los Angeles Angels (same)
    'ATH': 'OAK', # Oakland Athletics
    'SEA': 'SEA', # Seattle Mariners (same)
    'ATL': 'ATL', # Atlanta Braves (same)
    'MIA': 'MIA', # Miami Marlins (same)
    'NYM': 'NYM', # New York Mets (same)
    'PHI': 'PHI', # Philadelphia Phillies (same)
    'WSH': 'WSH', # Washington Nationals (same)
    'CHC': 'CHC', # Chicago Cubs (same)
    'CIN': 'CIN', # Cincinnati Reds (same)
    'MIL': 'MIL', # Milwaukee Brewers (same)
    'PIT': 'PIT', # Pittsburgh Pirates (same)
    'STL': 'STL', # St. Louis Cardinals (same)
    'COL': 'COL', # Colorado Rockies (same)
    'LAD': 'LAD', # Los Angeles Dodgers (same)
    'SD': 'SD',   # San Diego Padres (same)
    'SF': 'SF',   # San Francisco Giants (same)
    'NYY': 'NYY', # New York Yankees (same)
    'BOS': 'BOS', # Boston Red Sox (same)
    'TOR': 'TOR', # Toronto Blue Jays (same)
    'BAL': 'BAL', # Baltimore Orioles (same)
    'CLE': 'CLE', # Cleveland Guardians (same)
    'DET': 'DET', # Detroit Tigers (same)
    'MIN': 'MIN', # Minnesota Twins (same)
    'HOU': 'HOU', # Houston Astros (same)
    'TEX': 'TEX'  # Texas Rangers (same)
}
ESPN_TO_BACKEND_TEAM_MAP = {
    'ARI': 'ARI',  # Arizona Diamondbacks
    'TB': 'TB',   # Tampa Bay Rays (same)
    'KC': 'KC',   # Kansas City Royals (same)
    'CWS': 'CWS', # Chicago White Sox (same)
    'LAA': 'LAA', # Los Angeles Angels (same)
    'ATH': 'OAK', # Oakland Athletics
    'SEA': 'SEA', # Seattle Mariners (same)
    'ATL': 'ATL', # Atlanta Braves (same)
    'MIA': 'MIA', # Miami Marlins (same)
    'NYM': 'NYM', # New York Mets (same)
    'PHI': 'PHI', # Philadelphia Phillies (same)
    'WSH': 'WSH', # Washington Nationals (same)
    'CHC': 'CHC', # Chicago Cubs (same)
    'CIN': 'CIN', # Cincinnati Reds (same)
    'MIL': 'MIL', # Milwaukee Brewers (same)
    'PIT': 'PIT', # Pittsburgh Pirates (same)
    'STL': 'STL', # St. Louis Cardinals (same)
    'COL': 'COL', # Colorado Rockies (same)
    'LAD': 'LAD', # Los Angeles Dodgers (same)
    'SD': 'SD',   # San Diego Padres (same)
    'SF': 'SF',   # San Francisco Giants (same)
    'NYY': 'NYY', # New York Yankees (same)
    'BOS': 'BOS', # Boston Red Sox (same)
    'TOR': 'TOR', # Toronto Blue Jays (same)
    'BAL': 'BAL', # Baltimore Orioles (same)
    'CLE': 'CLE', # Cleveland Guardians (same)
    'DET': 'DET', # Detroit Tigers (same)
    'MIN': 'MIN', # Minnesota Twins (same)
    'HOU': 'HOU', # Houston Astros (same)
    'TEX': 'TEX'  # Texas Rangers (same)
}
SPLITS = ['overall', 'home', 'away', 'vs_lhp', 'vs_rhp']
WOBASCALE = 1.240 # See https://www.fangraphs.com/tools/guts
FIP_CONSTANT = 3.094 # See https://www.fangraphs.com/tools/guts
SEASON_START_DATE = '2025-03-01' # For FanGraphs API requests
SEASON_END_DATE = '2025-11-01' # For FanGraphs API requests
CURRENT_TIMEZONE = 'America/New_York'