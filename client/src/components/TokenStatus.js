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
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h1>Fantasy Baseball Assistant</h1>
      
      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3>Yahoo Fantasy Connection</h3>
        
        {tokenStatus?.hasToken ? (
          <div>
            {tokenStatus.hasValidToken ? (
              <div>
                <p style={{ color: 'green' }}>✓ Connected to Yahoo Fantasy</p>
                {tokenStatus.expiresAt && (
                  <p>Token expires: {new Date(tokenStatus.expiresAt).toLocaleString()}</p>
                )}
                <button 
                  onClick={() => window.location.href = '/my-team'}
                  style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', marginRight: '10px' }}
                >
                  View My Team
                </button>
                <button 
                  onClick={handleRefreshToken}
                  style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}
                >
                  Refresh Token
                </button>
              </div>
            ) : (
              <div>
                <p style={{ color: 'orange' }}>⚠ Token expired</p>
                <button 
                  onClick={handleRefreshToken}
                  style={{ padding: '10px 20px', backgroundColor: '#ffc107', color: 'black', border: 'none', borderRadius: '4px', marginRight: '10px' }}
                >
                  Refresh Token
                </button>
                <button 
                  onClick={handleYahooLogin}
                  style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}
                >
                  Reconnect Yahoo
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <p>Connect your Yahoo Fantasy account to get started</p>
            <button 
              onClick={handleYahooLogin}
              style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}
            >
              Connect Yahoo Account
            </button>
          </div>
        )}
      </div>

      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #dee2e6' }}>
        <h3>Quick Actions</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ marginBottom: '10px' }}>
            <button 
              onClick={() => window.location.href = '/my-team'}
              style={{ 
                width: '100%', 
                padding: '8px', 
                backgroundColor: '#007bff', 
                color: 'white', 
                border: 'none', 
                borderRadius: '4px',
                opacity: 1
              }}
            >
              My Team
            </button>
          </li>
          <li style={{ marginBottom: '10px' }}>
            <button 
              onClick={() => window.location.href = '/league-teams'}
              style={{ width: '100%', padding: '8px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}
            >
              League Teams
            </button>
          </li>
          <li style={{ marginBottom: '10px' }}>
            <button 
              onClick={() => window.location.href = '/two-start-pitchers'}
              style={{ width: '100%', padding: '8px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}
            >
              Two-Start Pitchers
            </button>
          </li>
          <li style={{ marginBottom: '10px' }}>
            <button 
              disabled
              style={{ width: '100%', padding: '8px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', opacity: 0.6 }}
            >
              Player Recommendations (Coming Soon)
            </button>
          </li>
          <li>
            <button 
              disabled
              style={{ width: '100%', padding: '8px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', opacity: 0.6 }}
            >
              Trade Analyzer (Coming Soon)
            </button>
          </li>
          <li style={{ marginTop: '20px', borderTop: '1px solid #dee2e6', paddingTop: '20px' }}>
            <button 
              onClick={() => window.location.href = '/settings'}
              style={{ width: '100%', padding: '8px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}
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