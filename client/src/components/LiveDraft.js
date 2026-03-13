import React, { useState, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { handleApiResponse, handleApiError } from '../utils/api';

const POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'UTIL', 'SP', 'RP', 'P'];
const PLAYERS_PER_PAGE = 20;
const ROSTER_SLOT_ORDER = ['C', '1B', '2B', '3B', 'SS', 'OF', 'UTIL', 'SP', 'RP', 'P', 'BN', 'IL', 'NA'];

function tierRowBackground(tier, maxTier) {
  if (maxTier <= 1) return 'rgba(34, 139, 34, 0.2)'; // green
  const t = Number(tier) || 1;
  const ratio = (t - 1) / Math.max(1, maxTier - 1);
  const r = Math.round(34 + ratio * 221);
  const g = Math.round(139 - ratio * 139);
  const b = Math.round(34);
  return `rgba(${r},${g},${b},0.2)`;
}

function formatEligible(ep) {
  if (Array.isArray(ep)) return ep.join(', ');
  if (typeof ep === 'string') {
    try {
      const parsed = JSON.parse(ep);
      if (Array.isArray(parsed)) return parsed.join(', ');
    } catch (_) {}
    return ep;
  }
  return String(ep ?? '');
}

function slotFillColor(filled, required) {
  if (required == null || required <= 0) return 'transparent';
  const ratio = Math.min(1, (filled ?? 0) / required);
  const r = Math.round(220 - 186 * ratio);
  const g = Math.round(53 + 86 * ratio);
  const b = Math.round(69 - 35 * ratio);
  return `rgba(${r},${g},${b},0.35)`;
}

function buildRosterRows(teamNeeds) {
  const required = teamNeeds?.required || {};
  const roster = teamNeeds?.roster || [];
  const rosterBySlot = {};
  ROSTER_SLOT_ORDER.forEach((s) => { rosterBySlot[s] = []; });
  roster.forEach((p) => {
    const slot = p.assignedSlot ?? p.primarySlot ?? 'UTIL';
    if (!rosterBySlot[slot]) rosterBySlot[slot] = [];
    rosterBySlot[slot].push(p);
  });
  const rows = [];
  ROSTER_SLOT_ORDER.forEach((slot) => {
    const count = required[slot];
    if (count == null || count <= 0) return;
    for (let i = 0; i < count; i++) {
      rows.push({
        slot,
        slotIndex: i + 1,
        player: rosterBySlot[slot] && rosterBySlot[slot][i] ? rosterBySlot[slot][i] : null,
      });
    }
  });
  return rows;
}

function LiveDraft() {
  const { draftId } = useParams();
  const [models, setModels] = useState([]);
  const [modelId, setModelId] = useState('');
  const [state, setState] = useState(null);
  const [board, setBoard] = useState({ players: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [posFilter, setPosFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [tierMin, setTierMin] = useState('');
  const [tierMax, setTierMax] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [sortKey, setSortKey] = useState('est_auction_value');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [purchaseTeamId, setPurchaseTeamId] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [simulateResult, setSimulateResult] = useState(null);
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [teamNeeds, setTeamNeeds] = useState(null);
  const [selectedTeamForAnalysis, setSelectedTeamForAnalysis] = useState('');
  const [needsLoading, setNeedsLoading] = useState(false);
  const [playersPage, setPlayersPage] = useState(1);
  const [refreshLoading, setRefreshLoading] = useState(false);

  const baseUrl = `/draft/live/${draftId}`;

  useEffect(() => {
    if (!draftId) return;
    api.get(`${baseUrl}/models`)
      .then((res) => {
        const data = handleApiResponse(res);
        const list = data?.models ?? [];
        setModels(list);
        if (list.length > 0 && !modelId) setModelId(String(list[0].id));
      })
      .catch((err) => setError(handleApiError(err)));
  }, [draftId]);

  useEffect(() => {
    if (!draftId || !modelId) return;
    setLoading(true);
    setError('');
    api.get(`${baseUrl}/state`, { params: { modelId, recompute: 'true' } })
      .then((res) => {
        const data = handleApiResponse(res);
        setState(data);
        const teams = data?.draftTeams ?? [];
        if (teams.length > 0 && !purchaseTeamId) setPurchaseTeamId(String(teams[0].draft_team_id));
        if (teams.length > 0 && !selectedTeamForAnalysis) setSelectedTeamForAnalysis(String(teams[0].draft_team_id));
      })
      .catch((err) => setError(handleApiError(err)))
      .finally(() => setLoading(false));
  }, [draftId, modelId]);

  useEffect(() => {
    if (!draftId || !modelId) return;
    const params = {
      modelId,
      limit: '500',
      offset: '0',
    };
    if (posFilter) params.pos = posFilter;
    if (groupFilter && groupFilter !== 'all') params.group = groupFilter;
    if (tierMin !== '') params.tierMin = tierMin;
    if (tierMax !== '') params.tierMax = tierMax;
    if (priceMin !== '') params.priceMin = priceMin;
    if (priceMax !== '') params.priceMax = priceMax;
    api.get(`${baseUrl}/board`, { params })
      .then((res) => {
        const data = handleApiResponse(res);
        setBoard({
          players: data?.players ?? [],
          total: data?.total ?? 0,
        });
      })
      .catch((err) => setError(handleApiError(err)));
  }, [draftId, modelId, posFilter, groupFilter, tierMin, tierMax, priceMin, priceMax]);

  const filteredAndSortedPlayers = useMemo(() => {
    let list = [...(board.players || [])];
    if (nameFilter.trim()) {
      const q = nameFilter.trim().toLowerCase();
      list = list.filter((p) => (p.name || '').toLowerCase().includes(q));
    }
    const key = sortKey;
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let va = a[key];
      let vb = b[key];
      if (key === 'name' || key === 'mlb_team' || key === 'eligible_positions') {
        va = String(va ?? '').toLowerCase();
        vb = String(vb ?? '').toLowerCase();
        return dir * (va < vb ? -1 : va > vb ? 1 : 0);
      }
      va = Number(va);
      vb = Number(vb);
      return dir * (va - vb);
    });
    return list;
  }, [board.players, nameFilter, sortKey, sortDir]);

  const maxTier = useMemo(() => {
    const tiers = (board.players || []).map((p) => Number(p.tier)).filter((t) => !Number.isNaN(t));
    return tiers.length ? Math.max(...tiers) : 1;
  }, [board.players]);

  const totalFiltered = filteredAndSortedPlayers.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PLAYERS_PER_PAGE));
  const currentPage = Math.min(playersPage, totalPages);
  const paginatedPlayers = useMemo(() => {
    const start = (currentPage - 1) * PLAYERS_PER_PAGE;
    return filteredAndSortedPlayers.slice(start, start + PLAYERS_PER_PAGE);
  }, [filteredAndSortedPlayers, currentPage]);

  useEffect(() => {
    setPlayersPage(1);
  }, [nameFilter, posFilter, groupFilter, tierMin, tierMax, priceMin, priceMax, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else setSortKey(key);
  };

  const handleSimulate = async () => {
    if (!selectedPlayer || !purchaseTeamId || purchasePrice === '') return;
    setSimulateLoading(true);
    setSimulateResult(null);
    const bid = Number(purchasePrice);
    if (!Number.isFinite(bid) || bid < 0) {
      setSimulateResult({ error: 'Enter a valid price.' });
      setSimulateLoading(false);
      return;
    }
    try {
      const res = await api.post(`${baseUrl}/simulate`, {
        modelId: Number(modelId),
        draftTeamId: Number(purchaseTeamId),
        playerPk: selectedPlayer.player_pk,
        bid,
      });
      const data = handleApiResponse(res);
      setSimulateResult(data);
    } catch (err) {
      setSimulateResult({ error: handleApiError(err) });
    } finally {
      setSimulateLoading(false);
    }
  };

  const handleConfirmPurchase = async () => {
    if (!selectedPlayer || !purchaseTeamId || purchasePrice === '') return;
    setPurchaseLoading(true);
    setError('');
    const price = Number(purchasePrice);
    if (!Number.isFinite(price) || price < 0) {
      setError('Enter a valid price.');
      setPurchaseLoading(false);
      return;
    }
    try {
      await api.post(`${baseUrl}/purchases`, {
        modelId: Number(modelId),
        draftTeamId: Number(purchaseTeamId),
        playerPk: selectedPlayer.player_pk,
        price,
      });
      setSelectedPlayer(null);
      setPurchasePrice('');
      setSimulateResult(null);
      setState(null);
      setBoard({ players: [], total: 0 });
      const [stateRes, boardRes] = await Promise.all([
        api.get(`${baseUrl}/state`, { params: { modelId, recompute: 'true' } }),
        api.get(`${baseUrl}/board`, { params: { modelId, limit: '500', offset: '0' } }),
      ]);
      setState(handleApiResponse(stateRes));
      const br = handleApiResponse(boardRes);
      setBoard({ players: br?.players ?? [], total: br?.total ?? 0 });
      setTeamNeeds(null);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handleUndo = async (purchaseId) => {
    try {
      await api.post(`${baseUrl}/purchases/${purchaseId}/undo`, { modelId: Number(modelId) });
      const [stateRes, boardRes] = await Promise.all([
        api.get(`${baseUrl}/state`, { params: { modelId, recompute: 'true' } }),
        api.get(`${baseUrl}/board`, { params: { modelId, limit: '500', offset: '0' } }),
      ]);
      setState(handleApiResponse(stateRes));
      const br = handleApiResponse(boardRes);
      setBoard({ players: br?.players ?? [], total: br?.total ?? 0 });
      setTeamNeeds(null);
    } catch (err) {
      setError(handleApiError(err));
    }
  };

  const handleMove = async (purchaseId, direction) => {
    try {
      await api.post(`${baseUrl}/purchases/${purchaseId}/move`, { direction });
      const stateRes = await api.get(`${baseUrl}/state`, { params: { modelId, recompute: 'true' } });
      setState(handleApiResponse(stateRes));
    } catch (err) {
      setError(handleApiError(err));
    }
  };

  const handleRefresh = async () => {
    if (!draftId || !modelId) return;
    setRefreshLoading(true);
    setError('');
    try {
      const boardParams = {
        modelId,
        limit: '500',
        offset: '0',
      };
      if (posFilter) boardParams.pos = posFilter;
      if (groupFilter && groupFilter !== 'all') boardParams.group = groupFilter;
      if (tierMin !== '') boardParams.tierMin = tierMin;
      if (tierMax !== '') boardParams.tierMax = tierMax;
      if (priceMin !== '') boardParams.priceMin = priceMin;
      if (priceMax !== '') boardParams.priceMax = priceMax;
      const [stateRes, boardRes] = await Promise.all([
        api.get(`${baseUrl}/state`, { params: { modelId, recompute: 'true' } }),
        api.get(`${baseUrl}/board`, { params: boardParams }),
      ]);
      setState(handleApiResponse(stateRes));
      const br = handleApiResponse(boardRes);
      setBoard({ players: br?.players ?? [], total: br?.total ?? 0 });
      setTeamNeeds(null);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setRefreshLoading(false);
    }
  };

  const fetchTeamNeeds = async () => {
    if (!selectedTeamForAnalysis) return;
    setNeedsLoading(true);
    try {
      const res = await api.get(`${baseUrl}/teams/${selectedTeamForAnalysis}/needs`, {
        params: { includeRoster: 'true', modelId: modelId || undefined },
      });
      setTeamNeeds(handleApiResponse(res));
    } catch (err) {
      setTeamNeeds({ error: handleApiError(err) });
    } finally {
      setNeedsLoading(false);
    }
  };

  const last10 = state?.last10 ?? [];
  const draftTeams = state?.draftTeams ?? [];
  const teamStates = state?.teamStates ?? [];
  const supply = state?.supply ?? {};
  const positionSupply = supply.positionSupply ?? [];
  const tierSupply = supply.tierSupply ?? [];
  const positionReplacement = supply.positionReplacement ?? [];

  const totalAvailable = positionSupply.reduce((sum, row) => sum + (Number(row.remaining_above_replacement) || 0), 0);
  const bySlot = {};
  positionSupply.forEach((row) => {
    bySlot[row.slot_code] = Number(row.remaining_above_replacement) || 0;
  });
  const hitterSlots = ['C', '1B', '2B', '3B', 'SS', 'OF', 'UTIL'];
  const pitcherSlots = ['SP', 'RP', 'P'];
  const hitterSupply = hitterSlots.reduce((s, slot) => s + (bySlot[slot] || 0), 0);
  const pitcherSupply = pitcherSlots.reduce((s, slot) => s + (bySlot[slot] || 0), 0);

  const topTierBySlot = {};
  tierSupply.forEach((row) => {
    const slot = row.slot_code;
    const tier = Number(row.tier);
    const count = Number(row.remaining_count) || 0;
    if (!topTierBySlot[slot] || tier < topTierBySlot[slot].minTier) {
      topTierBySlot[slot] = { minTier: tier, count };
    } else if (tier === topTierBySlot[slot].minTier) {
      topTierBySlot[slot].count += count;
    }
  });

  const teamStateMap = {};
  teamStates.forEach((ts) => {
    teamStateMap[String(ts.draft_team_id)] = ts;
  });

  if (!draftId) {
    return (
      <div className="container container-wide">
        <p>Invalid draft.</p>
        <Link to="/drafts" className="btn btn-secondary">← Back to Drafts</Link>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 1600 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link to="/drafts" className="nav-back-btn btn btn-secondary" style={{ textDecoration: 'none' }}>← Drafts</Link>
          <h1 style={{ margin: 0 }}>Live Draft</h1>
          <label>
            Model:
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              style={{ marginLeft: 8, padding: 6 }}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRefresh}
            disabled={!modelId || refreshLoading}
          >
            {refreshLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>
      )}

      {!loading && models.length === 0 && draftId ? (
        <div className="section">
          <p>No value models found for this draft’s league. Add models (e.g. run value computation) for the league first.</p>
          <Link to="/drafts" className="btn btn-secondary">← Back to Drafts</Link>
        </div>
      ) : loading && !state ? (
        <p className="loading-text">Loading draft state…</p>
      ) : !modelId ? (
        <p className="loading-text">Select a model.</p>
      ) : (
        <>
          {/* Supply summary */}
          <div className="section" style={{ marginBottom: 16 }}>
            <h3 className="section-title">Supply</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              <div><strong>Total available:</strong> {totalAvailable}</div>
              <div><strong>Hitters:</strong> {hitterSupply} | <strong>Pitchers:</strong> {pitcherSupply}</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {POSITIONS.map((slot) => (
                  <span key={slot}>{slot}: {bySlot[slot] ?? 0}</span>
                ))}
              </div>
              <div>
                <strong>Top tier by position:</strong>
                {Object.entries(topTierBySlot).map(([slot, { minTier, count }]) => (
                  <span key={slot} style={{ marginLeft: 8 }}>{slot} (tier {minTier}): {count}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Purchase box */}
          {selectedPlayer && (
            <div className="section-white" style={{ marginBottom: 16, padding: 16 }}>
              <h3 className="section-title">Purchase</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {selectedPlayer.headshot_url && (
                    <img src={selectedPlayer.headshot_url} alt="" className="player-headshot-tiny" />
                  )}
                  <span style={{ fontWeight: 600 }}>{selectedPlayer.name}</span>
                  <span style={{ color: '#666' }}>{selectedPlayer.mlb_team} · {formatEligible(selectedPlayer.eligible_positions)}</span>
                </div>
                <label>
                  Team:
                  <select
                    value={purchaseTeamId}
                    onChange={(e) => setPurchaseTeamId(e.target.value)}
                    style={{ marginLeft: 8, padding: 6 }}
                  >
                    {draftTeams.map((dt) => (
                      <option key={dt.draft_team_id} value={dt.draft_team_id}>{dt.team_name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Price:
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                    style={{ width: 80, marginLeft: 8, padding: 6 }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSimulate}
                  disabled={simulateLoading}
                >
                  {simulateLoading ? 'Simulating…' : 'Simulate'}
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handleConfirmPurchase}
                  disabled={purchaseLoading}
                >
                  {purchaseLoading ? 'Confirming…' : 'Confirm purchase'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setSelectedPlayer(null); setSimulateResult(null); }}>Clear</button>
              </div>
              {simulateResult && (
                <div className="analysis-section" style={{ marginTop: 12 }}>
                  {simulateResult.error ? (
                    <p style={{ color: '#c00' }}>{simulateResult.error}</p>
                  ) : (
                    <>
                      <p><strong>Affordable:</strong> {simulateResult.simulated?.affordable ? 'Yes' : 'No'}</p>
                      <p><strong>Current:</strong> Budget remaining ${simulateResult.current?.budgetRemaining ?? '—'}, Roster spots {simulateResult.current?.rosterSpotsRemaining ?? '—'}, Hard max bid ${simulateResult.current?.hardMaxBid ?? '—'}</p>
                      <p><strong>After purchase:</strong> Budget remaining ${simulateResult.simulated?.budgetRemaining ?? '—'}, Roster spots {simulateResult.simulated?.rosterSpotsRemaining ?? '—'}, Hard max bid ${simulateResult.simulated?.hardMaxBid ?? '—'}</p>
                      {simulateResult.recommendedMaxBid != null && (
                        <p><strong>Recommended max bid:</strong> ${simulateResult.recommendedMaxBid}</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {/* Main: filters + table */}
            <div style={{ flex: '1 1 0', minWidth: 0 }}>
              <div className="section-white" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                  <input
                    type="text"
                    placeholder="Filter by name…"
                    value={nameFilter}
                    onChange={(e) => setNameFilter(e.target.value)}
                    style={{ padding: 8, minWidth: 180 }}
                  />
                  <select value={posFilter} onChange={(e) => setPosFilter(e.target.value)} style={{ padding: 8 }}>
                    <option value="">All positions</option>
                    {POSITIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} style={{ padding: 8 }}>
                    <option value="all">All</option>
                    <option value="hitter">Hitter</option>
                    <option value="pitcher">Pitcher</option>
                  </select>
                  <input type="number" placeholder="Tier min" value={tierMin} onChange={(e) => setTierMin(e.target.value)} style={{ width: 70, padding: 8 }} />
                  <input type="number" placeholder="Tier max" value={tierMax} onChange={(e) => setTierMax(e.target.value)} style={{ width: 70, padding: 8 }} />
                  <input type="number" placeholder="Price min" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} style={{ width: 80, padding: 8 }} />
                  <input type="number" placeholder="Price max" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} style={{ width: 80, padding: 8 }} />
                </div>
                <div className="stats-table-container" style={{ overflowX: 'auto' }}>
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}></th>
                        <th></th>
                        <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>Name {sortKey === 'name' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                        <th onClick={() => handleSort('mlb_team')} style={{ cursor: 'pointer' }}>Team {sortKey === 'mlb_team' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                        <th onClick={() => handleSort('eligible_positions')} style={{ cursor: 'pointer' }}>Pos {sortKey === 'eligible_positions' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                        <th onClick={() => handleSort('est_auction_value')} style={{ cursor: 'pointer' }}>$ Value {sortKey === 'est_auction_value' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                        <th onClick={() => handleSort('est_max_auction_value')} style={{ cursor: 'pointer' }}>$ Max {sortKey === 'est_max_auction_value' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                        <th onClick={() => handleSort('tier')} style={{ cursor: 'pointer' }}>Tier {sortKey === 'tier' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                        <th onClick={() => handleSort('reliability_score')} style={{ cursor: 'pointer' }}>Rel {sortKey === 'reliability_score' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                        <th onClick={() => handleSort('risk_score')} style={{ cursor: 'pointer' }}>Risk {sortKey === 'risk_score' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPlayers.map((p) => (
                        <tr key={p.player_pk} style={{ backgroundColor: tierRowBackground(p.tier, maxTier) }}>
                          <td>
                            <input
                              type="radio"
                              name="selectedPlayer"
                              checked={selectedPlayer?.player_pk === p.player_pk}
                              onChange={() => setSelectedPlayer(p)}
                            />
                          </td>
                          <td>
                            {p.headshot_url && <img src={p.headshot_url} alt="" className="player-headshot-tiny" />}
                          </td>
                          <td style={{ fontWeight: 600 }}>{p.name}</td>
                          <td>{p.mlb_team}</td>
                          <td>{formatEligible(p.eligible_positions)}</td>
                          <td>{p.est_auction_value != null ? `$${Number(p.est_auction_value).toFixed(1)}` : '—'}</td>
                          <td>{p.est_max_auction_value != null ? `$${Number(p.est_max_auction_value).toFixed(1)}` : '—'}</td>
                          <td>{p.tier}</td>
                          <td>{p.reliability_score != null ? Number(p.reliability_score).toFixed(2) : '—'}</td>
                          <td>{p.risk_score != null ? Number(p.risk_score).toFixed(2) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
                  <p style={{ margin: 0, color: '#666' }}>
                    Showing {totalFiltered === 0 ? 0 : (currentPage - 1) * PLAYERS_PER_PAGE + 1}–{Math.min(currentPage * PLAYERS_PER_PAGE, totalFiltered)} of {totalFiltered} players
                    {board.total !== totalFiltered && ` (${board.total} from board)`}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setPlayersPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                    >
                      Previous
                    </button>
                    <span style={{ color: '#666' }}>Page {currentPage} of {totalPages}</span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setPlayersPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Last 10 picks */}
            <div className="section-white" style={{ width: 320, flexShrink: 0 }}>
              <h3 className="section-title">Last 10 picks</h3>
              {last10.length === 0 ? (
                <p style={{ color: '#666' }}>No picks yet.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {last10.map((pick, idx) => (
                    <li key={pick.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                      <div>
                        <strong>{pick.player_name}</strong>
                        <span style={{ marginLeft: 6, color: '#666' }}>${pick.price}</span>
                        <div style={{ fontSize: 12, color: '#888' }}>{pick.team_name}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: 4, fontSize: 12 }}
                          onClick={() => handleMove(pick.id, 'down')}
                          disabled={idx === 0}
                          title="Move up in list (later in draft order)"
                        >↑</button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: 4, fontSize: 12 }}
                          onClick={() => handleMove(pick.id, 'up')}
                          disabled={idx === last10.length - 1}
                          title="Move down in list (earlier in draft order)"
                        >↓</button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: 4, fontSize: 12 }}
                          onClick={() => handleUndo(pick.id)}
                          disabled={idx !== 0}
                          title={idx === 0 ? 'Undo last pick' : 'Only most recent pick can be undone'}
                        >Undo</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Team analysis */}
          <div className="section-white" style={{ marginTop: 16 }}>
            <h3 className="section-title">Team analysis</h3>
            <div style={{ marginBottom: 12 }}>
              <label>
                Team:
                <select
                  value={selectedTeamForAnalysis}
                  onChange={(e) => setSelectedTeamForAnalysis(e.target.value)}
                  style={{ marginLeft: 8, padding: 8 }}
                >
                  {draftTeams.map((dt) => (
                    <option key={dt.draft_team_id} value={dt.draft_team_id}>{dt.team_name}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn-primary" onClick={fetchTeamNeeds} disabled={needsLoading} style={{ marginLeft: 12 }}>
                {needsLoading ? 'Loading…' : 'Get team needs'}
              </button>
            </div>
            {teamStateMap[selectedTeamForAnalysis] && (
              <div className="roster-summary" style={{ marginBottom: 12 }}>
                <p><strong>Budget remaining:</strong> ${teamStateMap[selectedTeamForAnalysis].budget_remaining}</p>
                <p><strong>Roster spots remaining:</strong> {teamStateMap[selectedTeamForAnalysis].roster_spots_remaining}</p>
                <p><strong>Hard max bid:</strong> ${teamStateMap[selectedTeamForAnalysis].hard_max_bid}</p>
              </div>
            )}
            {teamNeeds && (
              <div>
                {teamNeeds.error ? (
                  <p style={{ color: '#c00' }}>{teamNeeds.error}</p>
                ) : (
                  <>
                    <h4>Required / Filled / Remaining</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>
                      {ROSTER_SLOT_ORDER.filter((slot) => (teamNeeds.required?.[slot] ?? 0) > 0).map((slot) => {
                        const filled = teamNeeds.filled?.[slot] ?? 0;
                        const required = teamNeeds.required?.[slot] ?? 0;
                        const rem = teamNeeds.remaining?.[slot] ?? 0;
                        return (
                          <span
                            key={slot}
                            style={{
                              backgroundColor: slotFillColor(filled, required),
                              padding: '4px 10px',
                              borderRadius: 6,
                            }}
                          >
                            {slot}: {filled}/{required} (need {rem})
                          </span>
                        );
                      })}
                    </div>
                    {teamNeeds.required && Object.keys(teamNeeds.required).length > 0 && (
                      <>
                        <h4>Roster</h4>
                        <table className="stats-table">
                          <thead>
                            <tr>
                              <th>Slot</th>
                              <th>Player</th>
                              <th>Primary Slot</th>
                              <th>Eligible positions</th>
                              <th>Price</th>
                              <th>Tier</th>
                            </tr>
                          </thead>
                          <tbody>
                            {buildRosterRows(teamNeeds).map((row, idx) => (
                              <tr key={`${row.slot}-${row.slotIndex}-${row.player?.playerPk ?? idx}`}>
                                <td>{row.slot} {row.slotIndex}</td>
                                <td>{row.player ? row.player.name : <em style={{ color: '#888' }}>—</em>}</td>
                                <td>{row.player ? row.player.primarySlot : '—'}</td>
                                <td>{row.player && row.player.eligiblePositions != null ? formatEligible(row.player.eligiblePositions) : '—'}</td>
                                <td>{row.player && row.player.price != null ? `$${row.player.price}` : '—'}</td>
                                <td>{row.player && row.player.tier != null ? row.player.tier : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default LiveDraft;
