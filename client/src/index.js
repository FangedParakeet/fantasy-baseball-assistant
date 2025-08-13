import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import './styles/index.css';
import TokenStatus from './components/TokenStatus';
import OAuthSuccess from './components/OAuthSuccess';
import AuthRedirect from './components/AuthRedirect';
import MyTeam from './components/MyTeam';
import LeagueTeams from './components/LeagueTeams';
import Settings from './components/Settings';
import TwoStartPitchers from './components/TwoStartPitchers';

// Main App Component
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<TokenStatus />} />
        <Route path="/auth/redirect" element={<AuthRedirect />} />
        <Route path="/auth/*" element={<AuthRedirect />} />
        <Route path="/oauth-success" element={<OAuthSuccess />} />
        <Route path="/my-team" element={<MyTeam />} />
        <Route path="/league-teams" element={<LeagueTeams />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/two-start-pitchers" element={<TwoStartPitchers />} />
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
