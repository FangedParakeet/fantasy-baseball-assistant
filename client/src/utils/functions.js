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
    const date = new Date(dateString);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`;
  };

  const formatEligiblePositions = (eligiblePositions) => {
    try {
      return JSON.parse(eligiblePositions).join(', ');
    } catch (error) {
      return eligiblePositions.replace(/["\[\]]/g, '');
    }
  };


export { ucfirst, formatIP, sortPlayers, getPercentileColor, formatDate, formatEligiblePositions };