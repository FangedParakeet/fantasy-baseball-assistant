import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import TokenStatus from './components/TokenStatus';
import OAuthSuccess from './components/OAuthSuccess';
import AuthRedirect from './components/AuthRedirect';

// Main App Component
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<TokenStatus />} />
        <Route path="/auth/redirect" element={<AuthRedirect />} />
        <Route path="/auth/*" element={<AuthRedirect />} />
        <Route path="/oauth-success" element={<OAuthSuccess />} />
        <Route path="/my-team" element={<div>My Team Page (Coming Soon)</div>} />
        <Route path="*" element={<div>404 - Page not found</div>} />
      </Routes>
    </Router>
  );
}

// Render the app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
