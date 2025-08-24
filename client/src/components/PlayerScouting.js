import React, { useState, useEffect, useCallback } from 'react';
import api, { handleApiResponse, handleApiError } from '../utils/api';
import { formatIP, getPercentileColor, formatEligiblePositions } from '../utils/functions';

function PlayerScouting() {
  // Filter states
  const [positionType, setPositionType] = useState('B');
  const [position, setPosition] = useState('Any');
  const [category, setCategory] = useState('Any');
  const [spanDays, setSpanDays] = useState(14);

  // Data states
  const [myTeamPlayers, setMyTeamPlayers] = useState([]);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Selection states
  const [selectedDrops, setSelectedDrops] = useState(new Set());
  const [selectedAdds, setSelectedAdds] = useState(new Set());

  // Pagination and sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('desc');

  // AI recommendations
  const [aiRecommendation, setAiRecommendation] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const pageSize = 15;

  const fantasyScoreFields = {
    'B': {
        'title': 'Batter Score',
        'key': 'batter_score',
    },
    'P': {
        'title': 'Pitcher Score',
        'key': 'pitcher_score',
    },
    'speed': {
        'title': 'Speed Score',
        'key': 'sb_pickup_score',
    },
    'contact': {
        'title': 'Contact Score',
        'key': 'contact_onbase_score',
    },
    'power': {
        'title': 'Power Score',
        'key': 'power_score',
    },
    'starter': {
        'title': 'Starter Score',
        'key': 'k_qs_score',
    },
    'reliever': {
        'title': 'Reliever Score',
        'key': 'leverage_relief_score',
    },
  }

  const fetchPlayers = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // Determine positionType based on category
      let actualPositionType = positionType;
      if (category !== 'Any') {
        actualPositionType = category;
      }

      // Determine position filter
      let actualPosition = position === 'Any' ? false : position;

      // Determine orderBy field
      let orderBy = false;
      if (sortField && sortField !== 'fantasy_score') {
        orderBy = sortField;
      }

      // Fetch my team players
      const myTeamResponse = await api.get('/search/players', {
        params: {
          positionType: actualPositionType,
          position: actualPosition,
          isRostered: true,
          isUserTeam: true,
          spanDays,
          orderBy,
          page: 1 // Always get all team players
        }
      });

      // Fetch available players
      const availableResponse = await api.get('/search/players', {
        params: {
          positionType: actualPositionType,
          position: actualPosition,
          isRostered: false,
          isUserTeam: false,
          spanDays,
          orderBy,
          page: currentPage
        }
      });

      const myTeamData = handleApiResponse(myTeamResponse);
      const availableData = handleApiResponse(availableResponse);

      setMyTeamPlayers(myTeamData || []);
      setAvailablePlayers(availableData || []);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, [positionType, position, category, spanDays, sortField, currentPage]);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  const handlePositionTypeChange = (type) => {
    setPositionType(type);
    setCategory('Any');
    setCurrentPage(1);
    setSortField('');
    setSortDirection('desc');
  };

  const handleCategoryChange = (cat) => {
    setCategory(cat);
    setCurrentPage(1);
    setSortField('');
    setSortDirection('desc');
  };

  const handlePositionChange = (pos) => {
    setPosition(pos);
    setCurrentPage(1);
    setSortField('');
    setSortDirection('desc');
  };

  const handleSpanDaysChange = (days) => {
    setSpanDays(parseInt(days));
    setCurrentPage(1);
    setSortField('');
    setSortDirection('desc');
  };

  const handleSort = (field) => {
    setSortField(field);
    if (field === 'era' || field === 'whip') {
      setSortDirection('asc');
    } else {
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
    const addPlayers = availablePlayers.filter(player => selectedAdds.has(player.id));
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
        positionType,
        category,
        spanDays
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
      return 100 - player[field + '_pct'];
    }
    return player[field + '_pct'] || 0;
  }

  const renderPlayerTable = (players, title, isMyTeam) => {
    if (!players || players.length === 0) {
      return (
        <div className="stats-panel">
          <h3>{title}</h3>
          <div className="empty-state">
            <p>No players available.</p>
          </div>
        </div>
      );
    }

    const isBatter = positionType === 'B' || ['speed', 'contact', 'power'].includes(category);
    const scoringFields = isBatter ? ['runs', 'hr', 'rbi', 'sb', 'avg'] : ['strikeouts', 'era', 'whip', 'qs', 'sv', 'hld'];
    const advancedFields = isBatter ? ['obp', 'slg', 'ops', 'k_rate', 'bb_rate', 'iso', 'wraa'] : ['k_per_9', 'bb_per_9', 'fip'];
    let fantasyScoreTitle, fantasyScoreKey;
    if ( category !== 'Any' ) {
        fantasyScoreTitle = fantasyScoreFields[category].title;
        fantasyScoreKey = fantasyScoreFields[category].key;
    } else {
        fantasyScoreTitle = fantasyScoreFields[positionType].title;
        fantasyScoreKey = fantasyScoreFields[positionType].key;
    }

    return (
      <div className="stats-panel">
        <h3>{title}</h3>
        <div className="stats-table-container">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Select</th>
                {isMyTeam && (
                    <th onClick={() => handleSort('position')} className="sortable-header">
                        Pos {sortField === 'position' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                )}
                <th>Player</th>
                <th onClick={() => handleSort('fantasy_score')} className="sortable-header">
                  {fantasyScoreTitle} {sortField === 'fantasy_score' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                {isBatter ? (
                  <>
                    <th>H/AB</th>
                    {scoringFields.map(field => (
                      <th key={field} onClick={() => handleSort(field)} className="sortable-header">
                        {field.toUpperCase()} {sortField === field && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                    ))}
                  </>
                ) : (
                  <>
                    <th>IP</th>
                    {scoringFields.map(field => (
                      <th key={field} onClick={() => handleSort(field)} className="sortable-header">
                        {field.toUpperCase()} {sortField === field && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                    ))}
                  </>
                )}
                {advancedFields.map(field => (
                  <th key={field} onClick={() => handleSort(field)} className="sortable-header">
                    {field.toUpperCase()} {sortField === field && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((player, index) => {
                const isSelected = isMyTeam ? selectedDrops.has(player.id) : selectedAdds.has(player.id);
                
                return (
                  <tr key={index}>
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handlePlayerSelection(player.id, isMyTeam)}
                      />
                    </td>
                    {isMyTeam && (
                      <td>{player.selected_position || 'N/A'}</td>
                    )}
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
                      style={{ backgroundColor: getPercentileColor(player[fantasyScoreKey], player.reliability_score || 100) }}
                    >
                      {player[fantasyScoreKey] ? Number.parseFloat(player[fantasyScoreKey]).toFixed(2) : 'N/A'}
                    </td>
                    {isBatter ? (
                      <>
                        <td>{player.hits}/{player.abs}</td>
                        {scoringFields.map(field => (
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
                      </>
                    ) : (
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
                      </>
                    )}
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderPagination = () => {
    if (category !== 'Any') return null; // No pagination for category-specific searches
    
    return (
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
          disabled={availablePlayers.length < pageSize}
          className="btn btn-secondary"
        >
          Next
        </button>
      </div>
    );
  };

  const { dropPlayers, addPlayers } = getSelectedPlayers();

  return (
    <div className="container">
      <div className="header-with-actions">
        <h1>Player Scouting Analysis</h1>
      </div>

      {/* Filters Section */}
      <div className="section">
        <h3>Filters</h3>
        <div className="filters-container">
          <div className="filter-group">
            <label>Player Type:</label>
            <div className="filter-buttons">
              <button
                className={`filter-btn ${positionType === 'B' ? 'active' : ''}`}
                onClick={() => handlePositionTypeChange('B')}
              >
                All Batters
              </button>
              <button
                className={`filter-btn ${positionType === 'P' ? 'active' : ''}`}
                onClick={() => handlePositionTypeChange('P')}
              >
                All Pitchers
              </button>
            </div>
          </div>

          <div className="filter-group">
            <label>Position:</label>
            <div className="filter-buttons">
              {positionType === 'B' ? (
                <>
                  <button
                    className={`filter-btn ${position === 'Any' ? 'active' : ''}`}
                    onClick={() => handlePositionChange('Any')}
                  >
                    Any
                  </button>
                  <button
                    className={`filter-btn ${position === 'C' ? 'active' : ''}`}
                    onClick={() => handlePositionChange('C')}
                  >
                    C
                  </button>
                  <button
                    className={`filter-btn ${position === '1B' ? 'active' : ''}`}
                    onClick={() => handlePositionChange('1B')}
                  >
                    1B
                  </button>
                  <button
                    className={`filter-btn ${position === '2B' ? 'active' : ''}`}
                    onClick={() => handlePositionChange('2B')}
                  >
                    2B
                  </button>
                  <button
                    className={`filter-btn ${position === '3B' ? 'active' : ''}`}
                    onClick={() => handlePositionChange('3B')}
                  >
                    3B
                  </button>
                  <button
                    className={`filter-btn ${position === 'SS' ? 'active' : ''}`}
                    onClick={() => handlePositionChange('SS')}
                  >
                    SS
                  </button>
                  <button
                    className={`filter-btn ${position === 'OF' ? 'active' : ''}`}
                    onClick={() => handlePositionChange('OF')}
                  >
                    OF
                  </button>
                  <button
                    className={`filter-btn ${position === 'Util' ? 'active' : ''}`}
                    onClick={() => handlePositionChange('Util')}
                  >
                    Util
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={`filter-btn ${position === 'Any' ? 'active' : ''}`}
                    onClick={() => handlePositionChange('Any')}
                  >
                    Any
                  </button>
                  <button
                    className={`filter-btn ${position === 'SP' ? 'active' : ''}`}
                    onClick={() => handlePositionChange('SP')}
                  >
                    SP
                  </button>
                  <button
                    className={`filter-btn ${position === 'RP' ? 'active' : ''}`}
                    onClick={() => handlePositionChange('RP')}
                  >
                    RP
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="filter-group">
            <label>Category:</label>
            <div className="filter-buttons">
              <button
                className={`filter-btn ${category === 'Any' ? 'active' : ''}`}
                onClick={() => handleCategoryChange('Any')}
              >
                Any
              </button>
              {positionType === 'B' && (
                <>
                  <button
                    className={`filter-btn ${category === 'speed' ? 'active' : ''}`}
                    onClick={() => handleCategoryChange('speed')}
                  >
                    Speed
                  </button>
                  <button
                    className={`filter-btn ${category === 'contact' ? 'active' : ''}`}
                    onClick={() => handleCategoryChange('contact')}
                  >
                    Contact/On Base
                  </button>
                  <button
                    className={`filter-btn ${category === 'power' ? 'active' : ''}`}
                    onClick={() => handleCategoryChange('power')}
                  >
                    Power
                  </button>
                </>
              )}
              {positionType === 'P' && (
                <>
                  <button
                    className={`filter-btn ${category === 'starter' ? 'active' : ''}`}
                    onClick={() => handleCategoryChange('starter')}
                  >
                    Starter
                  </button>
                  <button
                    className={`filter-btn ${category === 'reliever' ? 'active' : ''}`}
                    onClick={() => handleCategoryChange('reliever')}
                  >
                    Reliever
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="filter-group">
            <label>Span Days:</label>
            <select
              value={spanDays}
              onChange={(e) => handleSpanDaysChange(e.target.value)}
              className="form-input form-input-select"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </div>
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
                    <span>{player.name} ({positionType === 'B' ? 'Batter' : 'Pitcher'}) {player.mlb_team} - {formatEligiblePositions(player.eligible_positions)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="selection-list">
            <h3>Potential Add List</h3>
            {addPlayers.length === 0 ? (
              <p className="empty-selection">No players selected for adding</p>
            ) : (
              <div className="selected-players">
                {addPlayers.map(player => (
                  <div key={player.id} className="selected-player">
                    {player.headshot_url && (
                      <img src={player.headshot_url} alt={`${player.name} headshot`} className="player-headshot-tiny" />
                    )}
                    <span>{player.name} ({positionType === 'B' ? 'Batter' : 'Pitcher'}) {player.mlb_team} - {formatEligiblePositions(player.eligible_positions)}</span>
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
            {renderPlayerTable(myTeamPlayers, 'My Team', true)}
          </div>
          <div className="player-table-section">
            {renderPlayerTable(availablePlayers, 'Available Players', false)}
            {renderPagination()}
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

export default PlayerScouting; 