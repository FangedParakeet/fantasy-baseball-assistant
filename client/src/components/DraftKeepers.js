import React, { useState, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { handleApiResponse, handleApiError } from '../utils/api';
import { POSITION_SORT_ORDER } from '../utils/leagueConstants';

function parseEligiblePositions(eligiblePositions) {
  if (!eligiblePositions) return [];
  try {
    const parsed = typeof eligiblePositions === 'string' ? JSON.parse(eligiblePositions) : eligiblePositions;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function positionSortOrder(pos) {
  const p = (pos || '').toUpperCase();
  return POSITION_SORT_ORDER[p] ?? 999;
}

function DraftKeepers() {
  const { draftId } = useParams();
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [roster, setRoster] = useState([]);
  const [keepersFromApi, setKeepersFromApi] = useState([]);
  const [keeperState, setKeeperState] = useState({}); // playerId -> { isKeeper, cost }
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTeams();
  }, []);

  useEffect(() => {
    if (selectedTeamId && draftId) {
      fetchRosterAndKeepers();
    } else {
      setRoster([]);
      setKeepersFromApi([]);
      setKeeperState({});
    }
  }, [selectedTeamId, draftId]);

  const fetchTeams = async () => {
    try {
      setError('');
      const response = await api.get('/league-teams');
      const data = handleApiResponse(response);
      const list = Array.isArray(data) ? data : [];
      setTeams(list);
      if (list.length > 0 && !selectedTeamId) {
        setSelectedTeamId(String(list[0].id));
      }
    } catch (err) {
      setError(handleApiError(err));
      setTeams([]);
    } finally {
      setLoadingTeams(false);
    }
  };

  const fetchRosterAndKeepers = async () => {
    if (!selectedTeamId || !draftId) return;
    try {
      setLoadingRoster(true);
      setError('');
      const [rosterRes, keepersRes] = await Promise.all([
        api.get(`/league-teams/${selectedTeamId}`),
        api.get(`/draft/settings/draft/${draftId}/team/${selectedTeamId}/keepers`).catch(() => ({ data: { data: [] } })),
      ]);
      const rosterData = handleApiResponse(rosterRes);
      const keepersData = handleApiResponse(keepersRes);
      const rosterList = Array.isArray(rosterData) ? rosterData : [];
      const keepersList = Array.isArray(keepersData) ? keepersData : [];
      setRoster(rosterList);
      setKeepersFromApi(keepersList);
      const byPlayer = {};
      keepersList.forEach((k) => {
        const pid = k.player_id ?? k.player_pk;
        if (pid != null) byPlayer[pid] = { isKeeper: true, cost: k.cost ?? 0 };
      });
      rosterList.forEach((p) => {
        const id = p.id;
        if (id != null && !byPlayer[id]) byPlayer[id] = { isKeeper: false, cost: 0 };
      });
      setKeeperState(byPlayer);
    } catch (err) {
      setError(handleApiError(err));
      setRoster([]);
      setKeepersFromApi([]);
      setKeeperState({});
    } finally {
      setLoadingRoster(false);
    }
  };

  const sortedRoster = useMemo(() => {
    return [...roster].sort((a, b) => {
      const posA = a.selected_position ?? a.selectedPosition ?? a.position ?? '';
      const posB = b.selected_position ?? b.selectedPosition ?? b.position ?? '';
      const orderA = positionSortOrder(posA);
      const orderB = positionSortOrder(posB);
      if (orderA !== orderB) return orderA - orderB;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [roster]);

  const setKeeper = (playerId, isKeeper, cost) => {
    setKeeperState((prev) => ({
      ...prev,
      [playerId]: { isKeeper, cost: cost ?? prev[playerId]?.cost ?? 0 },
    }));
  };

  const setCost = (playerId, cost) => {
    const num = cost === '' ? 0 : Math.max(0, parseInt(String(cost), 10) || 0);
    setKeeperState((prev) => ({
      ...prev,
      [playerId]: { ...prev[playerId], cost: num },
    }));
  };

  const handleSave = async () => {
    if (!selectedTeamId || !draftId) return;
    const keepers = sortedRoster
      .filter((p) => keeperState[p.id]?.isKeeper)
      .map((p) => ({
        player_id: p.id,
        cost: keeperState[p.id]?.cost ?? 0,
      }));
    try {
      setSaving(true);
      setError('');
      await api.post(`/draft/settings/draft/${draftId}/team/${selectedTeamId}/keepers`, { keepers });
      setKeepersFromApi(keepers);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const selectedTeam = teams.find((t) => String(t.id) === String(selectedTeamId));
  const teamName = selectedTeam?.team_name ?? selectedTeam?.name ?? 'Team';

  return (
    <div className="container container-wide">
      <h1>Set Keepers</h1>
      <Link to="/drafts" className="nav-back-btn btn btn-secondary" style={{ display: 'inline-block', marginBottom: 20 }}>
        ← Back to Drafts
      </Link>

      {error && (
        <div className="form-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="section-white" style={{ marginBottom: 20 }}>
        <div className="form-group" style={{ maxWidth: 320 }}>
          <label htmlFor="team-select">Team</label>
          <select
            id="team-select"
            className="form-input form-input-select"
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            disabled={loadingTeams}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.team_name ?? t.name ?? `Team ${t.id}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loadingRoster ? (
        <p className="loading-text">Loading roster...</p>
      ) : roster.length === 0 && selectedTeamId ? (
        <div className="empty-state">
          <p>No roster for this team. Sync roster from League Teams first.</p>
        </div>
      ) : (
        <>
          <div className="section-white">
            <h3 className="section-title">{teamName} – Roster</h3>
            <p style={{ marginBottom: 12, color: '#6c757d', fontSize: 14 }}>
              Check players to mark as keepers and enter cost in $.
            </p>
            <div className="stats-table-container">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>Keeper</th>
                    <th>Cost ($)</th>
                    <th></th>
                    <th>Name</th>
                    <th>MLB Team</th>
                    <th>Eligible Positions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRoster.map((player) => {
                    const id = player.id;
                    const state = keeperState[id] ?? { isKeeper: false, cost: 0 };
                    const headshot = player.headshot_url ?? player.headshotUrl;
                    const name = player.name;
                    const mlbTeam = player.mlb_team ?? player.mlbTeam ?? '—';
                    const positions = parseEligiblePositions(player.eligible_positions ?? player.eligiblePositions);
                    const posDisplay = positions.length ? positions.join(', ') : (player.selected_position || player.selectedPosition || '—');
                    return (
                      <tr key={id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={state.isKeeper}
                            onChange={(e) => setKeeper(id, e.target.checked, state.cost)}
                            aria-label={`Keeper: ${name}`}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            className="form-input"
                            style={{ width: 70 }}
                            value={state.isKeeper ? state.cost : ''}
                            onChange={(e) => setCost(id, e.target.value)}
                            disabled={!state.isKeeper}
                            placeholder="0"
                          />
                        </td>
                        <td>
                          {headshot ? (
                            <img
                              src={headshot}
                              alt=""
                              className="player-headshot-tiny"
                              style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }}
                            />
                          ) : (
                            <span style={{ width: 28, height: 28, display: 'inline-block' }} />
                          )}
                        </td>
                        <td className="player-cell">
                          <span className="player-name">{name}</span>
                        </td>
                        <td>{mlbTeam}</td>
                        <td>{posDisplay}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ marginTop: 20 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save Keepers'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default DraftKeepers;
