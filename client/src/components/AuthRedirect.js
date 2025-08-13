import React, { useEffect } from 'react';

function AuthRedirect() {
  useEffect(() => {
    const backendUrl = window.location.origin;
    const currentPath = window.location.pathname;
    const currentSearch = window.location.search;
    const redirectUrl = backendUrl + currentPath + currentSearch;
    
    setTimeout(() => {
      window.location.href = redirectUrl;
    }, 100);
  }, []);

  return <div className="loading-container">Redirecting to backend...</div>;
}

export default AuthRedirect; 