import React, { useState, useEffect } from 'react';
import api, { handleApiResponse, handleApiError } from '../utils/api';

function LeagueTeams() {
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [error, setError] = useState('');
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
  };

  if (teamsLoading) return <div style={{ textAlign: 'center', padding: '50px' }}>Loading teams...</div>;
  if (error) return <div style={{ color: 'red', textAlign: 'center', padding: '20px' }}>{error}</div>;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>League Teams</h1>
        <button 
          onClick={handleSyncRoster}
          disabled={syncing || !selectedTeamId}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: syncing || !selectedTeamId ? '#6c757d' : '#28a745', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: syncing || !selectedTeamId ? 'not-allowed' : 'pointer'
          }}
        >
          {syncing ? 'Syncing...' : 'Sync Roster'}
        </button>
      </div>

      <div style={{ 
        backgroundColor: '#f8f9fa', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '20px' 
      }}>
        <h3>Select Team</h3>
        <select 
          value={selectedTeamId} 
          onChange={handleTeamChange}
          style={{ 
            padding: '8px 12px', 
            fontSize: '16px', 
            borderRadius: '4px', 
            border: '1px solid #ced4da',
            width: '100%',
            maxWidth: '300px'
          }}
        >
          <option value="">Select a team...</option>
          {teams.map(team => (
            <option key={team.id} value={team.id}>
              {team.team_name}
            </option>
          ))}
        </select>
      </div>

      {selectedTeamId && (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '50px' }}>Loading roster...</div>
          ) : (
            <div>
              <div style={{ 
                backgroundColor: '#f8f9fa', 
                padding: '20px', 
                borderRadius: '8px', 
                marginBottom: '20px' 
              }}>
                <h3>Roster Summary</h3>
                <p>Total Players: {players.length}</p>
              </div>

              <div style={{ 
                backgroundColor: 'white', 
                padding: '20px', 
                borderRadius: '8px', 
                border: '1px solid #dee2e6' 
              }}>
                <h3>Players</h3>
                {players.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#6c757d' }}>
                    <p>No players found for this team.</p>
                    <p>Try syncing the roster to load team data.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '15px' }}>
                    {players.map((player, index) => (
                      <div 
                        key={index}
                        style={{ 
                          padding: '15px', 
                          border: '1px solid #e9ecef', 
                          borderRadius: '6px',
                          backgroundColor: '#f8f9fa'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <h4 style={{ margin: '0 0 8px 0', color: '#495057' }}>
                              {player.name} ({player.selected_position || 'N/A'})
                            </h4>
                            <p style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#6c757d' }}>
                              Team: {player.mlb_team}
                            </p>
                            {player.eligible_positions && (
                              <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#6c757d' }}>
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
                                style={{ 
                                  width: '50px', 
                                  height: '50px', 
                                  borderRadius: '4px',
                                  objectFit: 'cover'
                                }}
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

      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <button 
          onClick={() => window.location.href = '/'}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: '#6c757d', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

export default LeagueTeams; 