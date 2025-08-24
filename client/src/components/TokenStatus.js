import React, { useState, useEffect } from 'react';
import api, { handleApiResponse, handleApiError } from '../utils/api';

function TokenStatus() {
  const [tokenStatus, setTokenStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTokenStatus();
  }, []);

  const fetchTokenStatus = async () => {
    try {
      const response = await api.get('/auth/token-status');
      const data = handleApiResponse(response);
      setTokenStatus(data);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleYahooLogin = () => {
    window.location.href = '/auth/login';
  };

  const handleRefreshToken = async () => {
    try {
      await api.post('/auth/refresh-token');
      fetchTokenStatus(); // Refresh the status
    } catch (err) {
      setError(handleApiError(err));
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;

  return (
    <div className="container" style={{ maxWidth: '600px' }}>
      <h1>Fantasy Baseball Assistant</h1>
      
      <div className="section">
        <h3>Yahoo Fantasy Connection</h3>
        
        {tokenStatus?.hasToken ? (
          <div>
            {tokenStatus.hasValidToken ? (
              <div>
                <p style={{ color: 'green' }}>✓ Connected to Yahoo Fantasy</p>
                {tokenStatus.expiresAt && (
                  <p>Token expires: {new Date(tokenStatus.expiresAt).toLocaleString()}</p>
                )}
                <div className="btn-group">
                  <button 
                    onClick={() => window.location.href = '/my-team'}
                    className="btn btn-primary btn-large"
                  >
                    View My Team
                  </button>
                  <button 
                    onClick={handleRefreshToken}
                    className="btn btn-success btn-large"
                  >
                    Refresh Token
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ color: 'orange' }}>⚠ Token expired</p>
                <div className="btn-group">
                  <button 
                    onClick={handleRefreshToken}
                    className="btn btn-warning btn-large"
                  >
                    Refresh Token
                  </button>
                  <button 
                    onClick={handleYahooLogin}
                    className="btn btn-primary btn-large"
                  >
                    Reconnect Yahoo
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <p>Connect your Yahoo Fantasy account to get started</p>
            <button 
              onClick={handleYahooLogin}
              className="btn btn-primary btn-large"
            >
              Connect Yahoo Account
            </button>
          </div>
        )}
      </div>

      <div className="section-white">
        <h3>Quick Actions</h3>
        <ul className="quick-actions">
          <li>
            <button 
              onClick={() => window.location.href = '/my-team'}
              className="btn btn-primary btn-full"
            >
              My Team
            </button>
          </li>
          <li>
            <button 
              onClick={() => window.location.href = '/league-teams'}
              className="btn btn-primary btn-full"
            >
              League Teams
            </button>
          </li>
          <li>
            <button 
              onClick={() => window.location.href = '/two-start-pitchers'}
              className="btn btn-primary btn-full"
            >
              Two-Start Pitchers
            </button>
          </li>
          <li>
            <button 
              onClick={() => window.location.href = '/player-scouting'}
              className="btn btn-primary btn-full"
            >
              Player Scouting
            </button>
          </li>
          <li>
            <button 
              disabled
              className="btn btn-secondary btn-full"
            >
              Player Recommendations (Coming Soon)
            </button>
          </li>
          <li>
            <button 
              disabled
              className="btn btn-secondary btn-full"
            >
              Trade Analyzer (Coming Soon)
            </button>
          </li>
          <li className="quick-actions-separator">
            <button 
              onClick={() => window.location.href = '/settings'}
              className="btn btn-secondary btn-full"
            >
              Settings
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default TokenStatus; 