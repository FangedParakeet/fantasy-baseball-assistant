import { positionOrder } from './constants';

const ucfirst = (string) => {
    return string.charAt(0).toUpperCase() + string.slice(1);
};

// Convert IP from 0.33 to 0.1, etc
const formatIP = (ip) => {
    if (!ip) return '0.0';
    const [innings, outs] = ip.split('.');
    let totalOuts;
    if (outs === '33') {
        totalOuts = 1;
    } else if (outs === '67') {
        totalOuts = 2;
    } else {
        totalOuts = 0;
    }
    return `${innings}.${totalOuts}`;
};

const sortPlayers = (players, field, direction) => {
    if (!field) return players;
    
    return [...players].sort((a, b) => {
      let aVal = a[field] || 0;
      let bVal = b[field] || 0;
      
      if (field === 'position') {
        const aPos = positionOrder[a.selected_position] || 999;
        const bPos = positionOrder[b.selected_position] || 999;
        return direction === 'asc' ? aPos - bPos : bPos - aPos;
      }
      else if (field === 'game_date') {
        return direction === 'asc' ? new Date(aVal) - new Date(bVal) : new Date(bVal) - new Date(aVal);
      }
      else if (field === 'era' || field === 'whip') {
        // For ERA/WHIP, lower is better
        return direction === 'asc' ? aVal - bVal : bVal - aVal;
      } else {
        // For other stats, higher is better
        return direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
    });
  };

  const getPercentileColor = (percentile, reliabilityScore) => {
    // Handle missing data
    if (!percentile || !reliabilityScore || reliabilityScore < 70) {
      return 'rgba(171, 178, 183, 0.75)'; // Gray for low reliability or missing data
    }
    
    if (percentile >= 90) return 'rgba(120, 200, 65, 1)'; // Green
    if (percentile >= 80) return 'rgba(180, 229, 130, 1)'; // Green
    if (percentile >= 70) return 'rgba(229, 245, 190, 1)'; // Light green
    if (percentile >= 60) return 'rgba(245, 245, 190, 1)'; // Yellow
    if (percentile >= 50) return 'rgba(245, 229, 190, 1)'; // Orange
    if (percentile >= 40) return 'rgba(245, 200, 190, 1)'; // Red
    return 'rgba(244, 120, 124, 1)'; // Red
  };

  const formatDate = (dateString) => {
    // Handle both UTC timestamps and EST date strings
    let date;
    
    if (dateString.includes('T') && dateString.includes('Z')) {
      // UTC timestamp format (e.g., "2025-08-18T00:00:00.000Z")
      date = new Date(dateString);
      // Convert to EST (UTC-5) for proper display
      const estOffset = -5 * 60 * 60 * 1000; // EST is UTC-5
      date = new Date(date.getTime() + estOffset);
    } else {
      // EST date string format (e.g., "2025-08-18")
      date = new Date(dateString + 'T00:00:00-05:00');
    }
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`;
  };

  const formatEligiblePositions = (eligiblePositions) => {
    try {
      return JSON.parse(eligiblePositions).join(', ');
    } catch (error) {
      return eligiblePositions.replace(/["[\]]/g, '');
    }
  };

  const getEligiblePositions = (eligiblePositions) => {
    try {
      return JSON.parse(eligiblePositions);
    } catch (error) {
      return [eligiblePositions.replace(/["[\]]/g, '')];
    }
  };

  /** Green (best, tier 1) to red (worst, tier 50+). Use for total_tier or category_tier in value stats tables. */
  const getTierColor = (tier) => {
    if (tier == null || tier === undefined) return 'rgba(171, 178, 183, 0.75)';
    const t = Number(tier);
    if (Number.isNaN(t) || t >= 50) return 'rgba(244, 120, 124, 0.9)';
    if (t <= 1) return 'rgba(120, 200, 65, 0.9)';
    const pct = (t - 1) / 49;
    if (pct <= 0.2) return 'rgba(180, 229, 130, 0.9)';
    if (pct <= 0.4) return 'rgba(229, 245, 190, 0.9)';
    if (pct <= 0.6) return 'rgba(245, 245, 190, 0.9)';
    if (pct <= 0.8) return 'rgba(245, 200, 190, 0.9)';
    return 'rgba(244, 120, 124, 0.9)';
  };

  /** Red (worst) to green (best) by ranking; teamCount = number of teams in league. */
  const getRankingColor = (ranking, teamCount) => {
    if (ranking == null || teamCount == null || teamCount <= 1) return 'rgba(171, 178, 183, 0.85)';
    const pct = (teamCount - ranking) / Math.max(teamCount, 1); // 0 = last, 1 = first
    if (pct >= 0.8) return 'rgba(120, 200, 65, 0.9)';
    if (pct >= 0.6) return 'rgba(180, 229, 130, 0.9)';
    if (pct >= 0.4) return 'rgba(229, 245, 190, 0.9)';
    if (pct >= 0.2) return 'rgba(245, 245, 190, 0.9)';
    if (pct >= 0.1) return 'rgba(245, 200, 190, 0.9)';
    return 'rgba(244, 120, 124, 0.9)';
  };

  /** Sort rows from batting/pitching value stats (flat + category objects with weighted_value). */
  const sortScoringValuePlayers = (players, field, direction) => {
    if (!field || !players?.length) return players || [];
    const posField = field === 'position' || field === 'p.selected_position';
    return [...players].sort((a, b) => {
      if (posField) {
        const aPos = positionOrder[a['p.selected_position'] || a.selected_position] ?? 999;
        const bPos = positionOrder[b['p.selected_position'] || b.selected_position] ?? 999;
        return direction === 'asc' ? aPos - bPos : bPos - aPos;
      }
      let aVal = a[field];
      let bVal = b[field];
      if (aVal != null && typeof aVal === 'object' && 'weighted_value' in aVal) aVal = aVal.weighted_value;
      if (bVal != null && typeof bVal === 'object' && 'weighted_value' in bVal) bVal = bVal.weighted_value;
      aVal = aVal ?? 0;
      bVal = bVal ?? 0;
      if (field === 'era' || field === 'whip') return direction === 'asc' ? aVal - bVal : bVal - aVal;
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  };

export { ucfirst, formatIP, sortPlayers, getPercentileColor, formatDate, formatEligiblePositions, getEligiblePositions, getRankingColor, getTierColor, sortScoringValuePlayers };