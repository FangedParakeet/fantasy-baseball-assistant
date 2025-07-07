import React, { useState, useEffect } from 'react';

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
      const response = await fetch('/api/my-roster');
      const data = await response.json();
      console.log(data);
      if (response.ok) {
        setPlayers(data.players || []);
      } else {
        setError(data.error || 'Failed to fetch roster');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncRoster = async () => {
    try {
      setSyncing(true);
      const response = await fetch('/api/sync-roster', {
        method: 'POST'
      });
      
      if (response.ok) {
        // Refresh the roster after successful sync
        await fetchMyRoster();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to sync roster');
      }
    } catch (err) {
      setError('Network error during sync');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '50px' }}>Loading your team...</div>;
  if (error) return <div style={{ color: 'red', textAlign: 'center', padding: '20px' }}>{error}</div>;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>My Team</h1>
        <button 
          onClick={handleSyncRoster}
          disabled={syncing}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: syncing ? '#6c757d' : '#28a745', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: syncing ? 'not-allowed' : 'pointer'
          }}
        >
          {syncing ? 'Syncing...' : 'Sync Roster'}
        </button>
      </div>

      {players.length === 0 ? (
        <div style={{ 
          backgroundColor: '#f8f9fa', 
          padding: '40px', 
          borderRadius: '8px', 
          textAlign: 'center' 
        }}>
          <h3>No Players Found</h3>
          <p>Your roster appears to be empty. Try syncing your roster to load your team data.</p>
          <button 
            onClick={handleSyncRoster}
            disabled={syncing}
            style={{ 
              padding: '10px 20px', 
              backgroundColor: '#007bff', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              marginTop: '10px'
            }}
          >
            {syncing ? 'Syncing...' : 'Sync Roster'}
          </button>
        </div>
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
          </div>
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

export default MyTeam; 