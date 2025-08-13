import React, { useState, useEffect } from 'react';
import api, { handleApiResponse, handleApiError } from '../utils/api';

function LeagueTeams() {
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [players, setPlayers] = useState([]);
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(true);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchTeams();
  }, []);

  useEffect(() => {
    if (selectedTeamId) {
      fetchTeamRoster(selectedTeamId);
    }
  }, [selectedTeamId]);

  const fetchTeams = async () => {
    try {
      setTeamsLoading(true);
      const response = await api.get('/league-teams');
      const data = handleApiResponse(response);
      setTeams(data.teams || []);
      // Auto-select first team if available
      if (data.teams && data.teams.length > 0) {
        setSelectedTeamId(data.teams[0].id);
      }
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setTeamsLoading(false);
    }
  };

  const fetchTeamRoster = async (teamId) => {
    try {
      setLoading(true);
      const response = await api.get(`/league-teams/${teamId}`);
      const data = handleApiResponse(response);
      setPlayers(data.players || []);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAllRosters = async () => {
    try {
      setSyncing(true);
      await api.post('/league-teams/sync-all-rosters');
      // Refresh the roster after successful sync
      await fetchTeamRoster(selectedTeamId);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncRoster = async () => {
    if (!selectedTeamId) return;
    
    try {
      setSyncing(true);
      await api.post(`/league-teams/${selectedTeamId}/sync-roster`);
      // Refresh the roster after successful sync
      await fetchTeamRoster(selectedTeamId);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSyncing(false);
    }
  };

  const handleTeamChange = (event) => {
    setSelectedTeamId(event.target.value);
    setValidationError('');
  };

  const handleDateChange = (event) => {
    setSelectedDate(event.target.value);
    setValidationError('');
  };

  const handleAnalyzeTeam = async () => {
    if (!selectedTeamId || !selectedDate) {
      setValidationError('Please select both a team and a date to analyze.');
      return;
    }

    try {
      setAnalysing(true);
      setError('');
      setValidationError('');
      
      const response = await api.post('/ai/opponent-analysis', {
        teamId: selectedTeamId,
        weekStart: selectedDate
      });
      
      const data = handleApiResponse(response);
      setAnalysis(data.result);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setAnalysing(false);
    }
  };

  // Helper to format AI response with bold tags
  function formatAIResponse(text) {
    if (!text) return '';
    // Replace **text** with <b>text</b>
    return text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  }

  if (teamsLoading) return <div className="loading-container">Loading teams...</div>;
  if (error) return <div className="error-container">{error}</div>;

  return (
    <div className="container">
      <div className="header-with-actions">
        <h1>League Teams</h1>
        <button 
          onClick={handleSyncAllRosters}
          disabled={syncing}
          className={`btn btn-large ${syncing ? 'btn-secondary' : 'btn-success'}`}
        >
          {syncing ? 'Syncing...' : 'Sync All Rosters'}
        </button>
        <button 
          onClick={handleSyncRoster}
          disabled={syncing || !selectedTeamId}
          className={`btn btn-large ${syncing || !selectedTeamId ? 'btn-secondary' : 'btn-success'}`}
        >
          {syncing ? 'Syncing...' : 'Sync Selected Roster'}
        </button>
      </div>

      <div className="section">
        <h3>Team Analysis</h3>
        
        {validationError && (
          <div className="form-error">
            {validationError}
          </div>
        )}

        <div className="form-container-wide">
          <div className="form-group">
            <label>
              Select Team:
            </label>
            <select
              value={selectedTeamId}
              onChange={handleTeamChange}
              className="form-input form-input-select"
            >
              <option value="">Select a team...</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.team_name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>
              Week Start Date (Monday):
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              className="form-input form-input-date"
            />
          </div>

          <div className="form-actions">
            <button
              onClick={handleAnalyzeTeam}
              disabled={analysing || !selectedTeamId || !selectedDate}
              className={`btn btn-large ${analysing || !selectedTeamId || !selectedDate ? 'btn-secondary' : 'btn-primary'}`}
              style={{ width: '100%', minWidth: '120px' }}
            >
              {analysing ? 'Analysing...' : 'Analyse Team'}
            </button>
          </div>
        </div>
      </div>

      {selectedTeamId && (
        <div>
          {loading ? (
            <div className="loading-container">Loading roster...</div>
          ) : (
            <div>
              <div className="roster-summary">
                <h3>Roster Summary</h3>
                <p>Total Players: {players.length}</p>
                
                {analysis && (
                  <div className="analysis-section">
                    <h4 className="section-title">AI Analysis</h4>
                    <div 
                      className="analysis-content"
                      dangerouslySetInnerHTML={{ __html: formatAIResponse(analysis) }}
                    />
                  </div>
                )}
              </div>

              <div className="section-white">
                <h3>Players</h3>
                {players.length === 0 ? (
                  <div className="empty-state">
                    <p>No players found for this team.</p>
                    <p>Try syncing the roster to load team data.</p>
                  </div>
                ) : (
                  <div className="players-grid">
                    {players.map((player, index) => (
                      <div 
                        key={index}
                        className="player-card"
                      >
                        <div className="player-card-header">
                          <div className="player-info">
                            <h4>
                              {player.name} ({player.selected_position || 'N/A'})
                            </h4>
                            <p>
                              Team: {player.mlb_team}
                            </p>
                            {player.eligible_positions && (
                              <p>
                                Eligible: {(() => {
                                  try {
                                    const positions = JSON.parse(player.eligible_positions);
                                    if (Array.isArray(positions)) {
                                      // If array of objects with 'position' key
                                      if (positions.length > 0 && typeof positions[0] === 'object' && positions[0] !== null && 'position' in positions[0]) {
                                        return positions.map(pos => pos.position).join(', ');
                                      }
                                      // If array of strings
                                      return positions.join(', ');
                                    }
                                    return positions;
                                  } catch (error) {
                                    console.error('Error parsing eligible_positions:', error, player.eligible_positions);
                                    return player.eligible_positions || 'N/A';
                                  }
                                })()}
                              </p>
                            )}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {player.headshot_url && (
                              <img 
                                src={player.headshot_url} 
                                alt={`${player.name} headshot`}
                                className="player-headshot"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
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

export default LeagueTeams; 