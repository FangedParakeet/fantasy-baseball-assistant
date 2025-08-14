const POSITION_MAP = {
    'C': 'is_c',
    '1B': 'is_1b',
    '2B': 'is_2b',
    '3B': 'is_3b',
    'SS': 'is_ss',
    'OF': 'is_of',
    'UTIL': 'is_util',
    'SP': 'is_sp',
    'RP': 'is_rp'
};

// Mapping from Yahoo API team abbreviations to backend team abbreviations
const YAHOO_TO_BACKEND_TEAM_MAP = {
    'AZ': 'ARI',  // Arizona Diamondbacks
    'TB': 'TB',   // Tampa Bay Rays (same)
    'KC': 'KC',   // Kansas City Royals (same)
    'CWS': 'CWS', // Chicago White Sox (same)
    'LAA': 'LAA', // Los Angeles Angels (same)
    'ATH': 'OAK', // Oakland Athletics
    'SEA': 'SEA', // Seattle Mariners (same)
    'ATL': 'ATL', // Atlanta Braves (same)
    'MIA': 'MIA', // Miami Marlins (same)
    'NYM': 'NYM', // New York Mets (same)
    'PHI': 'PHI', // Philadelphia Phillies (same)
    'WSH': 'WSH', // Washington Nationals (same)
    'CHC': 'CHC', // Chicago Cubs (same)
    'CIN': 'CIN', // Cincinnati Reds (same)
    'MIL': 'MIL', // Milwaukee Brewers (same)
    'PIT': 'PIT', // Pittsburgh Pirates (same)
    'STL': 'STL', // St. Louis Cardinals (same)
    'COL': 'COL', // Colorado Rockies (same)
    'LAD': 'LAD', // Los Angeles Dodgers (same)
    'SD': 'SD',   // San Diego Padres (same)
    'SF': 'SF',   // San Francisco Giants (same)
    'NYY': 'NYY', // New York Yankees (same)
    'BOS': 'BOS', // Boston Red Sox (same)
    'TOR': 'TOR', // Toronto Blue Jays (same)
    'BAL': 'BAL', // Baltimore Orioles (same)
    'CLE': 'CLE', // Cleveland Guardians (same)
    'DET': 'DET', // Detroit Tigers (same)
    'MIN': 'MIN', // Minnesota Twins (same)
    'HOU': 'HOU', // Houston Astros (same)
    'TEX': 'TEX'  // Texas Rangers (same)
};

// Function to convert Yahoo team abbreviation to backend abbreviation
function convertYahooTeamAbbr(yahooAbbr) {
    if (!yahooAbbr) return null;
    return YAHOO_TO_BACKEND_TEAM_MAP[yahooAbbr] || yahooAbbr;
}

module.exports = {
    POSITION_MAP,
    YAHOO_TO_BACKEND_TEAM_MAP,
    convertYahooTeamAbbr
};