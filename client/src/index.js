import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import './styles/index.css';
import TokenStatus from './components/TokenStatus';
import OAuthSuccess from './components/OAuthSuccess';
import AuthRedirect from './components/AuthRedirect';
import MyTeam from './components/MyTeam';
import LeagueTeams from './components/LeagueTeams';
import TradeAnalysis from './components/TradeAnalysis';
import Settings from './components/Settings';
import LeagueSettings from './components/LeagueSettings';
import TwoStartPitchers from './components/TwoStartPitchers';
import PlayerScouting from './components/PlayerScouting';
import StreamingPitchers from './components/StreamingPitchers';
import NRFIAnalysis from './components/NRFIAnalysis';
import Drafts from './components/Drafts';
import DraftForm from './components/DraftForm';
import DraftKeepers from './components/DraftKeepers';
import LiveDraft from './components/LiveDraft';

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
        <Route path="/trade-analysis" element={<TradeAnalysis />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/league-settings" element={<LeagueSettings />} />
        <Route path="/two-start-pitchers" element={<TwoStartPitchers />} />
        <Route path="/player-scouting" element={<PlayerScouting />} />
        <Route path="/streaming-pitchers" element={<StreamingPitchers />} />
        <Route path="/nrfi-analysis" element={<NRFIAnalysis />} />
        <Route path="/drafts" element={<Drafts />} />
        <Route path="/drafts/new" element={<DraftForm />} />
        <Route path="/drafts/:draftId/edit" element={<DraftForm />} />
        <Route path="/drafts/:draftId/keepers" element={<DraftKeepers />} />
        <Route path="/drafts/:draftId/live" element={<LiveDraft />} />
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
