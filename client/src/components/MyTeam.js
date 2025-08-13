import React, { useState, useEffect } from 'react';
import api, { handleApiResponse, handleApiError } from '../utils/api';

function MyTeam() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchMyRoster();
  }, []);

  const fetchMyRoster = async () => {
    try {
      setLoading(true);
      const response = await api.get('/my-roster');
      const data = handleApiResponse(response);
      console.log(data);
      setPlayers(data.players || []);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSyncRoster = async () => {
    try {
      setSyncing(true);
      await api.post('/sync-roster');
      // Refresh the roster after successful sync
      await fetchMyRoster();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <div className="loading-container">Loading your team...</div>;
  if (error) return <div className="error-container">{error}</div>;

  return (
    <div className="container">
      <div className="header-with-actions">
        <h1>My Team</h1>
        <button 
          onClick={handleSyncRoster}
          disabled={syncing}
          className={`btn btn-large ${syncing ? 'btn-secondary' : 'btn-success'}`}
        >
          {syncing ? 'Syncing...' : 'Sync Roster'}
        </button>
      </div>

      {players.length === 0 ? (
        <div className="empty-state">
          <h3>No Players Found</h3>
          <p>Your roster appears to be empty. Try syncing your roster to load your team data.</p>
          <button 
            onClick={handleSyncRoster}
            disabled={syncing}
            className="btn btn-primary"
            style={{ marginTop: '10px' }}
          >
            {syncing ? 'Syncing...' : 'Sync Roster'}
          </button>
        </div>
      ) : (
        <div>
          <div className="roster-summary">
            <h3>Roster Summary</h3>
            <p>Total Players: {players.length}</p>
          </div>

          <div className="section-white">
            <h3>Players</h3>
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

export default MyTeam; 