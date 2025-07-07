import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function OAuthSuccess() {
  const location = useLocation();

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    if (urlParams.get('oauth') === 'success') {
      // OAuth was successful, redirect to home
      setTimeout(() => {
        window.location.href = '/';
      }, 1000);
    }
  }, [location]);

  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <h2>OAuth Successful!</h2>
      <p>Redirecting to home page...</p>
    </div>
  );
}

export default OAuthSuccess; 