import React, { useState, useEffect, useCallback } from 'react';
import api, { handleApiResponse, handleApiError } from '../utils/api';
import { formatDate, formatEligiblePositions, getPercentileColor } from '../utils/functions';

function NRFIAnalysis() {
  // Date filter states
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - startDate.getDay());
    return startDate.toISOString().split('T')[0];
  });

  const [selectedWeekEnd, setSelectedWeekEnd] = useState(() => {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - endDate.getDay() + 6);
    return endDate.toISOString().split('T')[0];
  });

  // Data states
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Pagination and sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('desc');

  const pageSize = 12;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch NRFI rankings
      const response = await api.get('/search/pitchers/nrfi', {
        params: {
          startDate: selectedWeekStart,
          endDate: selectedWeekEnd
        }
      });

      const gamesData = handleApiResponse(response);
      setGames(gamesData || []);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, [selectedWeekStart, selectedWeekEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleWeekStartChange = (date) => {
    setSelectedWeekStart(date);
    // Auto-update end date to be 7 days after start date
    const newEndDate = new Date(date);
    newEndDate.setDate(newEndDate.getDate() + 6);
    setSelectedWeekEnd(newEndDate.toISOString().split('T')[0]);
    setCurrentPage(1);
    setSortField('');
    setSortDirection('desc');
  };

  const handleWeekEndChange = (date) => {
    setSelectedWeekEnd(date);
    setCurrentPage(1);
    setSortField('');
    setSortDirection('desc');
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  const formatOpponent = (opponent, home) => {
    return home ? `v. ${opponent}` : `@ ${opponent}`;
  };

  const getPlayerPercentile = (player, field) => {
    if (['era', 'whip', 'fip', 'bb_per_9'].includes(field)) {
      // For ERA, WHIP, FIP, BB/9 - lower is better, so invert the percentile
      return Number.parseFloat(100 - player[field + '_pct']).toFixed(2);
    }
    return Number.parseFloat(player[field + '_pct']).toFixed(2) || 0;
  };

  const sortGames = (gamesData) => {
    if (!sortField) return gamesData;
    
    return [...gamesData].sort((a, b) => {
      let aVal = a[sortField] || 0;
      let bVal = b[sortField] || 0;
      
      if (sortField === 'game_date') {
        return sortDirection === 'asc' ? new Date(aVal) - new Date(bVal) : new Date(bVal) - new Date(aVal);
      } else {
        // For scoring stats, higher is better
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
    });
  };

  const getPaginatedGames = (gamesData) => {
    const sortedGames = sortGames(gamesData);
    const startIndex = (currentPage - 1) * pageSize;
    return sortedGames.slice(startIndex, startIndex + pageSize);
  };

  const renderGamesTable = () => {
    if (!games || games.length === 0) {
      return (
        <div className="stats-panel">
          <h3>Games</h3>
          <div className="empty-state">
            <p>No games available for the selected date range.</p>
          </div>
        </div>
      );
    }

    const paginatedGames = getPaginatedGames(games);

    return (
      <div className="stats-panel">
        <h3>Games</h3>
        <div className="stats-table-container">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Player</th>
                <th onClick={() => handleSort('game_date')} className="sortable-header">
                  Game Date {sortField === 'game_date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Team</th>
                <th>Opponent</th>
                <th onClick={() => handleSort('avg_nrfi_score')} className="sortable-header">
                  Game Score {sortField === 'avg_nrfi_score' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('nrfi_likelihood_score')} className="sortable-header">
                  Matchup Score {sortField === 'nrfi_likelihood_score' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('team_nrfi_pct')} className="sortable-header">
                  Team Score {sortField === 'team_nrfi_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('opponent_nrfi_pct')} className="sortable-header">
                  Opponent Score {sortField === 'opponent_nrfi_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('player_nrfi_pct')} className="sortable-header">
                  Player Score {sortField === 'player_nrfi_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('era')} className="sortable-header">
                  ERA {sortField === 'era' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('whip')} className="sortable-header">
                  WHIP {sortField === 'whip' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('fip_pct')} className="sortable-header">
                  FIP %-ile {sortField === 'fip_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('qs_pct')} className="sortable-header">
                  QS %-ile {sortField === 'qs_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedGames.map((game, index) => (
                <tr key={index}>
                  <td className="player-cell">
                    <div className="player-info-cell">
                      {game.headshot_url && (
                        <img src={game.headshot_url} alt={`${game.name} headshot`} className="player-headshot-small" />
                      )}
                      <div>
                        <div className="player-name">{game.name || 'Unknown Player'}</div>
                        <div className="player-details">
                          {game.mlb_team || 'N/A'} - {formatEligiblePositions(game.eligible_positions) || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{formatDate(game.game_date)}</td>
                  <td>{game.team}</td>
                  <td>{formatOpponent(game.opponent, game.home)}</td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(game.avg_nrfi_score, game.reliability_score || 100) }}
                    title={game.avg_nrfi_score ? `${game.avg_nrfi_score} NRFI Score` : 'No data'}
                  >
                    {game.avg_nrfi_score ? Number.parseFloat(game.avg_nrfi_score).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(game.nrfi_likelihood_score, game.reliability_score || 100) }}
                    title={game.nrfi_likelihood_score ? `${game.nrfi_likelihood_score} NRFI Score` : 'No data'}
                  >
                    {game.nrfi_likelihood_score ? Number.parseFloat(game.nrfi_likelihood_score).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(game.team_nrfi_pct, game.reliability_score || 100) }}
                    title={game.team_nrfi_pct ? `${game.team_nrfi_pct}th %-ile` : 'No data'}
                  >
                    {game.team_nrfi_pct ? Number.parseFloat(game.team_nrfi_pct).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(game.opponent_nrfi_pct, game.reliability_score || 100) }}
                    title={game.opponent_nrfi_pct ? `${game.opponent_nrfi_pct}th %-ile` : 'No data'}
                  >
                    {game.opponent_nrfi_pct ? Number.parseFloat(game.opponent_nrfi_pct).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(game.player_nrfi_pct, game.reliability_score || 100) }}
                    title={game.player_nrfi_pct ? `${game.player_nrfi_pct}th %-ile` : 'No data'}
                  >
                    {game.player_nrfi_pct ? Number.parseFloat(game.player_nrfi_pct).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(getPlayerPercentile(game, 'era'), game.reliability_score || 100) }}
                    title={getPlayerPercentile(game, 'era') ? `${getPlayerPercentile(game, 'era')}th %-ile` : 'No data'}
                  >
                    {game.era ? Number.parseFloat(game.era).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(getPlayerPercentile(game, 'whip'), game.reliability_score || 100) }}
                    title={getPlayerPercentile(game, 'whip') ? `${getPlayerPercentile(game, 'whip')}th %-ile` : 'No data'}
                  >
                    {game.whip ? Number.parseFloat(game.whip).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(getPlayerPercentile(game, 'fip'), game.reliability_score || 100) }}
                    title={getPlayerPercentile(game, 'fip') ? `${getPlayerPercentile(game, 'fip')}th %-ile` : 'No data'}
                  >
                    {getPlayerPercentile(game, 'fip') ? Number.parseFloat(getPlayerPercentile(game, 'fip')).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(getPlayerPercentile(game, 'qs'), game.reliability_score || 100) }}
                    title={getPlayerPercentile(game, 'qs') ? `${getPlayerPercentile(game, 'qs')}th %-ile` : 'No data'}
                  >
                    {game.qs_pct ? Number.parseFloat(game.qs_pct).toFixed(2) : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="pagination">
          <button 
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="btn btn-secondary"
          >
            Previous
          </button>
          <span className="page-info">Page {currentPage}</span>
          <button 
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={paginatedGames.length < pageSize}
            className="btn btn-secondary"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="container">
      <div className="header-with-actions">
        <h1>NRFI Analysis</h1>
      </div>

      {/* Filters Section */}
      <div className="section">
        <h3>Filters</h3>
        <div className="filters-container">
          <div className="filter-group">
            <label>Start Date:</label>
            <input
              type="date"
              value={selectedWeekStart}
              onChange={(e) => handleWeekStartChange(e.target.value)}
              className="form-input"
            />
          </div>
          
          <div className="filter-group">
            <label>End Date:</label>
            <input
              type="date"
              value={selectedWeekEnd}
              onChange={(e) => handleWeekEndChange(e.target.value)}
              min={selectedWeekStart}
              className="form-input"
            />
          </div>
        </div>
      </div>

      {/* Games Table */}
      {loading ? (
        <div className="loading-container">Loading games...</div>
      ) : error ? (
        <div className="error-container">{error}</div>
      ) : (
        <div className="player-tables-container nrfi-analysis" style={{ display: 'block' }}>
            {renderGamesTable()}
        </div>
      )}

      <div className="text-center mt-20">
        <button 
          onClick={() => window.location.href = '/'}
          className="btn btn-secondary"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

export default NRFIAnalysis; 