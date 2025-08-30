import React, { useState, useEffect, useCallback } from 'react';
import api, { handleApiResponse, handleApiError } from '../utils/api';
import { formatIP, getPercentileColor, formatEligiblePositions, formatDate, getEligiblePositions, sortPlayers } from '../utils/functions';

function StreamingPitchers() {
  // Filter states
  const [streamingType, setStreamingType] = useState('daily-streamer');

  // Data states
  const [myTeamPlayers, setMyTeamPlayers] = useState([]);
  const [availablePitchers, setAvailablePitchers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Selection states
  const [selectedDrops, setSelectedDrops] = useState(new Set());
  const [selectedAdds, setSelectedAdds] = useState(new Set());

  // Pagination and sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [myTeamPage, setMyTeamPage] = useState(1);
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('desc');
  const [myTeamSortField, setMyTeamSortField] = useState('');
  const [myTeamSortDirection, setMyTeamSortDirection] = useState('desc');

  // AI recommendations
  const [aiRecommendation, setAiRecommendation] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const pageSize = 12;
  const myTeamPageSize = 12;

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



  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch my team players (pitchers first, then batters)
      const [pitchersResponse, battersResponse] = await Promise.all([
        api.get('/search/players', {
          params: {
            positionType: 'P',
            isRostered: true,
            isUserTeam: true,
            spanDays: 30,
            page: 1
          }
        }),
        api.get('/search/players', {
          params: {
            positionType: 'B',
            isRostered: true,
            isUserTeam: true,
            spanDays: 30,
            page: 1
          }
        })
      ]);

      const pitchersData = handleApiResponse(pitchersResponse);
      const battersData = handleApiResponse(battersResponse);

      // Combine pitchers first, then batters
      const combinedTeam = [...(pitchersData || []), ...(battersData || [])];
      setMyTeamPlayers(combinedTeam);

      // Fetch available streaming pitchers
      const availableResponse = await api.get(`/search/pitchers/${streamingType}`, {
        params: {
          startDate: selectedWeekStart,
          endDate: streamingType === 'two-start' ? 
            (() => {
              const endDate = new Date(selectedWeekStart);
              endDate.setDate(endDate.getDate() + 6);
              return endDate.toISOString().split('T')[0];
            })() : 
            selectedWeekEnd
        }
      });

      const availableData = handleApiResponse(availableResponse);
      setAvailablePitchers(availableData || []);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, [streamingType, selectedWeekStart, selectedWeekEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStreamingTypeChange = (type) => {
    setStreamingType(type);
    setCurrentPage(1);
    setSortField('');
    setSortDirection('desc');
  };

  const handleMyTeamSort = (field) => {
    if (myTeamSortField === field) {
      setMyTeamSortDirection(myTeamSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setMyTeamSortField(field);
      setMyTeamSortDirection('desc');
    }
    setMyTeamPage(1);
  };

  const handleMyTeamPageChange = (newPage) => {
    setMyTeamPage(newPage);
  };

  const handleWeekStartChange = (date) => {
    setSelectedWeekStart(date);
    // Auto-update end date to be 7 days after start date
    const newEndDate = new Date(date);
    newEndDate.setDate(newEndDate.getDate() + 6);
    setSelectedWeekEnd(newEndDate.toISOString().split('T')[0]);
    setCurrentPage(1);
    setMyTeamPage(1);
  };

  const handleWeekEndChange = (date) => {
    setSelectedWeekEnd(date);
    setCurrentPage(1);
    setMyTeamPage(1);
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

  const handlePlayerSelection = (playerId, isMyTeam) => {
    if (isMyTeam) {
      const newSelectedDrops = new Set(selectedDrops);
      if (newSelectedDrops.has(playerId)) {
        newSelectedDrops.delete(playerId);
      } else {
        newSelectedDrops.add(playerId);
      }
      setSelectedDrops(newSelectedDrops);
    } else {
      const newSelectedAdds = new Set(selectedAdds);
      if (newSelectedAdds.has(playerId)) {
        newSelectedAdds.delete(playerId);
      } else {
        newSelectedAdds.add(playerId);
      }
      setSelectedAdds(newSelectedAdds);
    }
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  const getSelectedPlayers = () => {
    const dropPlayers = myTeamPlayers.filter(player => selectedDrops.has(player.id));
    const addPlayers = availablePitchers.filter(player => selectedAdds.has(player.player_id));
    return { dropPlayers, addPlayers };
  };

  const handleGetRecommendation = async () => {
    const { dropPlayers, addPlayers } = getSelectedPlayers();
    
    if (dropPlayers.length === 0 && addPlayers.length === 0) {
      setError('Please select at least one player to drop or add');
      return;
    }

    try {
      setAiLoading(true);
      setError('');
      
      // TODO: Replace with actual AI recommendations endpoint
      const response = await api.post('/ai/recommendations', {
        dropPlayers,
        addPlayers,
        streamingType,
        context: 'streaming-pitchers'
      });

      const data = handleApiResponse(response);
      setAiRecommendation(data.recommendation || 'No recommendation available');
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setAiLoading(false);
    }
  };

  const getPlayerPercentile = (player, field) => {
    if (['era', 'whip', 'k_rate', 'bb_per_9', 'fip'].includes(field)) {
      return Number.parseFloat(100 - player[field + '_pct']).toFixed(2);
    }
    return Number.parseFloat(player[field + '_pct']).toFixed(2) || 0;
  };

  const formatOpponent = (opponent, home) => {
    return home ? `v. ${opponent}` : `@ ${opponent}`;
  };

  const sortAvailablePitchers = (pitchers) => {
    if (!sortField) return pitchers;
    
    return [...pitchers].sort((a, b) => {
      let aVal = a[sortField] || 0;
      let bVal = b[sortField] || 0;
      
      if (sortField === 'game_date') {
        return sortDirection === 'asc' ? new Date(aVal) - new Date(bVal) : new Date(bVal) - new Date(aVal);
      } else if (sortField === 'era' || sortField === 'whip') {
        // For ERA/WHIP, lower is better
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      } else {
        // For other stats, higher is better
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
    });
  };

  const getPaginatedPitchers = (pitchers) => {
    const sortedPitchers = sortAvailablePitchers(pitchers);
    const startIndex = (currentPage - 1) * pageSize;
    return sortedPitchers.slice(startIndex, startIndex + pageSize);
  };

  const getPaginatedMyTeamPlayers = (players) => {
    // Add computed fantasy score field for sorting
    const playersWithFantasyScore = players.map(player => {
      const eligiblePositions = getEligiblePositions(player.eligible_positions);
      const isPitcher = eligiblePositions.includes('P');
      const fantasyScore = isPitcher ? player.pitcher_score : player.batter_score;
      return { ...player, fantasy_score: fantasyScore };
    });
    
    const sortedPlayers = sortPlayers(playersWithFantasyScore, myTeamSortField, myTeamSortDirection);
    const startIndex = (myTeamPage - 1) * myTeamPageSize;
    return sortedPlayers.slice(startIndex, startIndex + myTeamPageSize);
  };

  const renderMyTeamTable = () => {
    if (!myTeamPlayers || myTeamPlayers.length === 0) {
      return (
        <div className="stats-panel">
          <h3>My Team</h3>
          <div className="empty-state">
            <p>No players available.</p>
          </div>
        </div>
      );
    }

    const scoringFields = ['strikeouts', 'era', 'whip', 'qs', 'sv', 'hld'];
    const advancedFields = ['k_per_9', 'bb_per_9', 'fip'];
    const batterScoringFields = ['runs', 'hr', 'rbi', 'sb', 'avg'];
    const batterAdvancedFields = ['obp', 'slg', 'ops', 'k_rate', 'bb_rate', 'iso', 'wraa'];
    const paginatedMyTeamPlayers = getPaginatedMyTeamPlayers(myTeamPlayers);

    return (
      <div className="stats-panel">
        <h3>My Team</h3>
        <div className="stats-table-container">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Select</th>
                <th onClick={() => handleMyTeamSort('position')} className="sortable-header">
                  Position {myTeamSortField === 'position' && (myTeamSortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Player</th>
                <th onClick={() => handleMyTeamSort('fantasy_score')} className="sortable-header">
                  Fantasy Score {myTeamSortField === 'fantasy_score' && (myTeamSortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>IP</th>
                {scoringFields.map(field => (
                  <th key={field} onClick={() => handleMyTeamSort(field)} className="sortable-header">
                    {field.toUpperCase()} {myTeamSortField === field && (myTeamSortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                ))}
                {advancedFields.map(field => (
                  <th key={field} onClick={() => handleMyTeamSort(field)} className="sortable-header">
                    {field.toUpperCase()} {myTeamSortField === field && (myTeamSortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                ))}
                <th>H/AB</th>
                {batterScoringFields.map(field => (
                  <th key={field} onClick={() => handleMyTeamSort(field)} className="sortable-header">
                    {field.toUpperCase()} {myTeamSortField === field && (myTeamSortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                ))}
                {batterAdvancedFields.map(field => (
                  <th key={field} onClick={() => handleMyTeamSort(field)} className="sortable-header">
                    {field.toUpperCase()} {myTeamSortField === field && (myTeamSortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedMyTeamPlayers.map((player, index) => {
                const isSelected = selectedDrops.has(player.id);
                const eligiblePositions = getEligiblePositions(player.eligible_positions);
                const isPitcher = eligiblePositions.includes('P');
                const fantasyScore = isPitcher ? player.pitcher_score : player.batter_score;
                
                return (
                  <tr key={index}>
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handlePlayerSelection(player.id, true)}
                      />
                    </td>
                    <td>{player.selected_position || 'N/A'}</td>
                    <td className="player-cell">
                      <div className="player-info-cell">
                        {player.headshot_url && (
                          <img src={player.headshot_url} alt={`${player.name} headshot`} className="player-headshot-small" />
                        )}
                        <div>
                          <div className="player-name">{player.name || 'Unknown Player'}</div>
                          <div className="player-details">
                            {player.mlb_team || 'N/A'} - {formatEligiblePositions(player.eligible_positions) || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td
                      className="stat-cell"
                      style={{ backgroundColor: getPercentileColor(fantasyScore, player.reliability_score || 100) }}
                    >
                      {fantasyScore ? Number.parseFloat(fantasyScore).toFixed(2) : 'N/A'}
                    </td>
                    {isPitcher ? (
                      <>
                        <td>{formatIP(player.ip) || 0}</td>
                        {scoringFields.map(field => (
                          <td 
                            key={field}
                            className="stat-cell"
                            style={{ backgroundColor: getPercentileColor(getPlayerPercentile(player, field), player.reliability_score) }}
                            title={getPlayerPercentile(player, field) ? `${getPlayerPercentile(player, field)}th %-ile` : 'No data'}
                          >
                            {field === 'era' || field === 'whip'
                              ? (player[field] ? Number.parseFloat(player[field]).toFixed(2) : 'N/A')
                              : (player[field] || 0)
                            }
                          </td>
                        ))}
                        {advancedFields.map(field => (
                          <td 
                            key={field}
                            className="stat-cell"
                            style={{ backgroundColor: getPercentileColor(getPlayerPercentile(player, field), player.reliability_score) }}
                            title={getPlayerPercentile(player, field) ? `${getPlayerPercentile(player, field)}th %-ile` : 'No data'}
                          >
                            {getPlayerPercentile(player, field) ? Number.parseFloat(getPlayerPercentile(player, field)).toFixed(2) : 'N/A'}
                          </td>
                        ))}
                        <td colSpan={batterScoringFields.length + batterAdvancedFields.length + 1}>-</td>
                      </>
                    ) : (
                      <>
                        <td colSpan={scoringFields.length + advancedFields.length + 1}>-</td>
                        <td>{player.hits}/{player.abs}</td>
                        {batterScoringFields.map(field => (
                          <td 
                            key={field}
                            className="stat-cell"
                            style={{ backgroundColor: getPercentileColor(getPlayerPercentile(player, field), player.reliability_score) }}
                            title={getPlayerPercentile(player, field) ? `${getPlayerPercentile(player, field)}th %-ile` : 'No data'}
                          >
                            {field === 'avg' 
                              ? (player.hits && player.abs ? Number.parseFloat((player.hits / player.abs).toFixed(3)) : 'N/A')
                              : (player[field] || 0)
                            }
                          </td>
                        ))}
                        {batterAdvancedFields.map(field => (
                          <td 
                            key={field}
                            className="stat-cell"
                            style={{ backgroundColor: getPercentileColor(getPlayerPercentile(player, field), player.reliability_score) }}
                            title={getPlayerPercentile(player, field) ? `${getPlayerPercentile(player, field)}th %-ile` : 'No data'}
                          >
                            {getPlayerPercentile(player, field) ? Number.parseFloat(getPlayerPercentile(player, field)).toFixed(2) : 'N/A'}
                          </td>
                        ))}
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="pagination">
          <button 
            onClick={() => handleMyTeamPageChange(myTeamPage - 1)}
            disabled={myTeamPage === 1}
            className="btn btn-secondary"
          >
            Previous
          </button>
          <span className="page-info">Page {myTeamPage}</span>
          <button 
            onClick={() => handleMyTeamPageChange(myTeamPage + 1)}
            disabled={paginatedMyTeamPlayers.length < myTeamPageSize}
            className="btn btn-secondary"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  const renderAvailablePitchersTable = () => {
    if (!availablePitchers || availablePitchers.length === 0) {
      return (
        <div className="stats-panel">
          <h3>Available Players</h3>
          <div className="empty-state">
            <p>No pitchers available.</p>
          </div>
        </div>
      );
    }

    const scoringFields = ['strikeouts', 'era', 'whip', 'qs', 'sv', 'hld'];
    const advancedFields = ['k_per_9', 'bb_per_9', 'fip'];
    const paginatedPitchers = getPaginatedPitchers(availablePitchers);

    return (
      <div className="stats-panel">
        <h3>Available Players</h3>
        <div className="stats-table-container">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Select</th>
                <th>Player</th>
                <th onClick={() => handleSort('game_date')} className="sortable-header">
                  Game Date {sortField === 'game_date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Opponent</th>
                {streamingType === 'two-start' && (
                  <th onClick={() => handleSort('avg_qs_score')} className="sortable-header">
                    Avg QS Score {sortField === 'avg_qs_score' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                )}
                <th onClick={() => handleSort('qs_likelihood_score')} className="sortable-header">
                  {streamingType === 'two-start' ? 'QS Score' : 'QS Score'} {sortField === 'qs_likelihood_score' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>IP</th>
                {scoringFields.map(field => (
                  <th key={field} onClick={() => handleSort(field)} className="sortable-header">
                    {field.toUpperCase()} {sortField === field && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                ))}
                {advancedFields.map(field => (
                  <th key={field} onClick={() => handleSort(field)} className="sortable-header">
                    {field.toUpperCase()} {sortField === field && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedPitchers.map((pitcher, index) => {
                const isSelected = selectedAdds.has(pitcher.player_id);
                
                return (
                  <tr key={index}>
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handlePlayerSelection(pitcher.player_id, false)}
                      />
                    </td>
                    <td className="player-cell">
                      <div className="player-info-cell">
                        {pitcher.headshot_url && (
                          <img src={pitcher.headshot_url} alt={`${pitcher.name} headshot`} className="player-headshot-small" />
                        )}
                        <div>
                          <div className="player-name">{pitcher.name || 'Unknown Player'}</div>
                          <div className="player-details">
                            {pitcher.mlb_team || 'N/A'} - {formatEligiblePositions(pitcher.eligible_positions) || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{formatDate(pitcher.game_date)}</td>
                    <td>{formatOpponent(pitcher.opponent, pitcher.home)}</td>
                    {streamingType === 'two-start' && (
                      <td
                        className="stat-cell"
                        style={{ backgroundColor: getPercentileColor(pitcher.avg_qs_score, pitcher.reliability_score || 100) }}
                      >
                        {pitcher.avg_qs_score ? Number.parseFloat(pitcher.avg_qs_score).toFixed(2) : 'N/A'}
                      </td>
                    )}
                    <td
                      className="stat-cell"
                      style={{ backgroundColor: getPercentileColor(pitcher.qs_likelihood_score, pitcher.reliability_score || 100) }}
                    >
                      {pitcher.qs_likelihood_score ? Number.parseFloat(pitcher.qs_likelihood_score).toFixed(2) : 'N/A'}
                    </td>
                    <td>{formatIP(pitcher.ip) || 0}</td>
                    {scoringFields.map(field => (
                      <td 
                        key={field}
                        className="stat-cell"
                        style={{ backgroundColor: getPercentileColor(getPlayerPercentile(pitcher, field), pitcher.reliability_score) }}
                        title={getPlayerPercentile(pitcher, field) ? `${getPlayerPercentile(pitcher, field)}th %-ile` : 'No data'}
                      >
                        {field === 'era' || field === 'whip'
                          ? (pitcher[field] ? Number.parseFloat(pitcher[field]).toFixed(2) : 'N/A')
                          : (pitcher[field] || 0)
                        }
                      </td>
                    ))}
                    {advancedFields.map(field => (
                      <td 
                        key={field}
                        className="stat-cell"
                        style={{ backgroundColor: getPercentileColor(getPlayerPercentile(pitcher, field), pitcher.reliability_score) }}
                        title={getPlayerPercentile(pitcher, field) ? `${getPlayerPercentile(pitcher, field)}th %-ile` : 'No data'}
                      >
                        {getPlayerPercentile(pitcher, field) ? Number.parseFloat(getPlayerPercentile(pitcher, field)).toFixed(2) : 'N/A'}
                      </td>
                    ))}
                  </tr>
                );
              })}
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
            disabled={paginatedPitchers.length < pageSize}
            className="btn btn-secondary"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  const { dropPlayers, addPlayers } = getSelectedPlayers();

  return (
    <div className="container">
      <div className="header-with-actions">
        <h1>Streaming Pitchers Analysis</h1>
      </div>

      {/* Filters Section */}
      <div className="section">
        <h3>Filters</h3>
        <div className="filters-container">
          <div className="filter-group">
            <label>Streaming Type:</label>
            <div className="filter-buttons">
              <button
                className={`filter-btn ${streamingType === 'daily-streamer' ? 'active' : ''}`}
                onClick={() => handleStreamingTypeChange('daily-streamer')}
              >
                Daily Streamer
              </button>
              <button
                className={`filter-btn ${streamingType === 'two-start' ? 'active' : ''}`}
                onClick={() => handleStreamingTypeChange('two-start')}
              >
                Two-Start Pitcher
              </button>
            </div>
          </div>
          
          <div className="filter-group">
            <label>Week Start Date:</label>
            <input
              type="date"
              value={selectedWeekStart}
              onChange={(e) => handleWeekStartChange(e.target.value)}
              className="form-input"
            />
          </div>
          
          {streamingType === 'daily-streamer' && (
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
          )}
        </div>
      </div>

      {/* Potential Drop/Add Lists */}
      <div className="section">
        <div className="selection-lists">
          <div className="selection-list">
            <h3>Potential Drop List</h3>
            {dropPlayers.length === 0 ? (
              <p className="empty-selection">No players selected for dropping</p>
            ) : (
              <div className="selected-players">
                {dropPlayers.map(player => (
                  <div key={player.id} className="selected-player">
                    {player.headshot_url && (
                      <img src={player.headshot_url} alt={`${player.name} headshot`} className="player-headshot-tiny" />
                    )}
                    <span>{player.name} ({player.position === 'P' ? 'Pitcher' : 'Batter'}) {player.mlb_team} - {formatEligiblePositions(player.eligible_positions)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="selection-list">
            <h3>Potential Add List</h3>
            {addPlayers.length === 0 ? (
              <p className="empty-selection">No pitchers selected for adding</p>
            ) : (
              <div className="selected-players">
                {addPlayers.map(pitcher => (
                  <div key={pitcher.player_id} className="selected-player">
                    {pitcher.headshot_url && (
                      <img src={pitcher.headshot_url} alt={`${pitcher.name} headshot`} className="player-headshot-tiny" />
                    )}
                    <span>{pitcher.name} (Pitcher) {pitcher.mlb_team} - {formatDate(pitcher.game_date)} vs {pitcher.opponent}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="recommendation-button-container">
          <button
            onClick={handleGetRecommendation}
            disabled={aiLoading || (dropPlayers.length === 0 && addPlayers.length === 0)}
            className="btn btn-large btn-success"
          >
            {aiLoading ? 'Getting Recommendation...' : 'Get Add / Drop Recommendation'}
          </button>
        </div>
      </div>

      {/* AI Recommendation */}
      {aiRecommendation && (
        <div className="section">
          <h3>AI Recommendation</h3>
          <div className="ai-recommendation">
            <p>{aiRecommendation}</p>
          </div>
        </div>
      )}

      {/* Player Tables */}
      {loading ? (
        <div className="loading-container">Loading players...</div>
      ) : error ? (
        <div className="error-container">{error}</div>
      ) : (
        <div className="player-tables-container">
          <div className="player-table-section">
            {renderMyTeamTable()}
          </div>
          <div className="player-table-section">
            {renderAvailablePitchersTable()}
          </div>
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

export default StreamingPitchers; 