import React, { useEffect, useState } from 'react';
import api from '../api';

const MyTeamPage = () => {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const fetchRoster = async () => {
    setLoading(true);
    try {
      const res = await api.get('/my-roster');
      setPlayers(res.data.players || []);
    } catch (err) {
      setError('Failed to load roster.');
    }
    setLoading(false);
  };

  const handleSyncRoster = async () => {
    setSyncing(true);
    try {
      await api.get('/sync-roster');
      await fetchRoster();
    } catch (err) {
      setError('Failed to sync roster.');
    }
    setSyncing(false);
  };

  useEffect(() => {
    fetchRoster();
  }, []);

  return (
    <div style={{ padding: '1rem' }}>
      <h2>My Team Roster</h2>
      <button onClick={handleSyncRoster} disabled={syncing}>
        {syncing ? 'Syncing...' : 'Refresh Roster'}
      </button>
      {loading && <p>Loading roster...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {!loading && players.length > 0 && (
        <table style={{ marginTop: '1rem', width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>MLB Team</th>
              <th>Positions</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.id}>
                <td>{player.name}</td>
                <td>{player.mlb_team}</td>
                <td>{player.positions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default MyTeamPage;
