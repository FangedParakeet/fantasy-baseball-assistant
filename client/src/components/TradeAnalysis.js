import { useState, useEffect, useCallback } from 'react';
import api, { handleApiResponse, handleApiError } from '../utils/api';
import {
  formatEligiblePositions,
  getRankingColor,
  getTierColor,
  sortScoringValuePlayers,
  getEligiblePositions,
} from '../utils/functions';
import { HITTER_CATEGORIES, PITCHER_CATEGORIES, POSITION_SORT_ORDER } from '../utils/leagueConstants';

const playerField = (row, key) => row[`p.${key}`] ?? row[key];

function TradeAnalysis() {
  const [teams, setTeams] = useState([]);
  const [myTeamId, setMyTeamId] = useState(null);
  const [selectedOtherTeamId, setSelectedOtherTeamId] = useState('');
  const [spanDays, setSpanDays] = useState(7);
  const [modelId, setModelId] = useState('');
  const [valueModels, setValueModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('desc');

  // My team data
  const [myTeamScoring, setMyTeamScoring] = useState([]);
  const [myTeamPosition, setMyTeamPosition] = useState([]);
  const [myTeamBatting, setMyTeamBatting] = useState([]);
  const [myTeamPitching, setMyTeamPitching] = useState([]);

  // Other team data
  const [otherTeamScoring, setOtherTeamScoring] = useState([]);
  const [otherTeamPosition, setOtherTeamPosition] = useState([]);
  const [otherTeamBatting, setOtherTeamBatting] = useState([]);
  const [otherTeamPitching, setOtherTeamPitching] = useState([]);

  // Trade selection: gives = in the trade (other side receives), drops = we drop (no one receives)
  const [myTeamGives, setMyTeamGives] = useState(new Set());
  const [myTeamDrops, setMyTeamDrops] = useState(new Set());
  const [otherTeamGives, setOtherTeamGives] = useState(new Set());
  const [otherTeamDrops, setOtherTeamDrops] = useState(new Set());

  // Fetched value stats for players in the trade (for projecting totals)
  const [tradePlayersValueStats, setTradePlayersValueStats] = useState([]);
  const [tradePlayersLoading, setTradePlayersLoading] = useState(false);

  const otherTeams = teams.filter((t) => !t.is_user_team);
  const myTeam = teams.find((t) => t.is_user_team);

  useEffect(() => {
    let cancelled = false;
    const fetchTeams = async () => {
      try {
        setTeamsLoading(true);
        const response = await api.get('/league-teams');
        const data = handleApiResponse(response) || [];
        if (cancelled) return;
        setTeams(data);
        const my = data.find((t) => t.is_user_team);
        if (my) setMyTeamId(my.id);
        if (data.length > 0) {
          const firstOther = data.find((t) => !t.is_user_team);
          if (firstOther) setSelectedOtherTeamId(String(firstOther.id));
        }
      } catch (e) {
        if (!cancelled) setError(handleApiError(e));
      } finally {
        if (!cancelled) setTeamsLoading(false);
      }
    };
    fetchTeams();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const fetchValueModels = async () => {
      try {
        const response = await api.get('/league/value-models');
        const models = handleApiResponse(response) || [];
        setValueModels(models);
        if (models.length > 0 && !modelId) {
          setModelId(String(models[0].id));
        } else if (models.length > 0 && !models.some((m) => Number(m.id) === Number(modelId))) {
          setModelId(String(models[0].id));
        }
      } catch (_) {
        setValueModels([]);
      }
    };
    fetchValueModels();
  }, [modelId]);

  const fetchTradePlayerValues = useCallback(async () => {
    const allIds = [...new Set([...myTeamGives, ...myTeamDrops, ...otherTeamGives, ...otherTeamDrops])];
    if (allIds.length === 0) {
      setTradePlayersValueStats([]);
      return;
    }
    const effectiveModelId = modelId || valueModels[0]?.id;
    if (!effectiveModelId) {
      setTradePlayersValueStats([]);
      return;
    }
    setTradePlayersLoading(true);
    try {
      const teamIdForRequest = myTeamId || selectedOtherTeamId || allIds[0];
      const response = await api.get(`/preview/team/${teamIdForRequest}/value-stats/players`, {
        params: { modelId: effectiveModelId, spanDays, playerIds: JSON.stringify(allIds) },
      });
      const data = handleApiResponse(response) || [];
      setTradePlayersValueStats(Array.isArray(data) ? data : []);
    } catch (_) {
      setTradePlayersValueStats([]);
    } finally {
      setTradePlayersLoading(false);
    }
  }, [myTeamGives, myTeamDrops, otherTeamGives, otherTeamDrops, modelId, valueModels, spanDays, myTeamId, selectedOtherTeamId]);

  useEffect(() => {
    fetchTradePlayerValues();
  }, [fetchTradePlayerValues]);

  const fetchBothTeamsData = useCallback(async () => {
    if (!myTeamId || !selectedOtherTeamId) return;
    const effectiveModelId = modelId || valueModels[0]?.id;
    if (!effectiveModelId) return;

    setLoading(true);
    setError('');
    const valueParams = { modelId: effectiveModelId, spanDays };

    try {
      const [
        myScoringRes,
        myPositionRes,
        myBattingRes,
        myPitchingRes,
        otherScoringRes,
        otherPositionRes,
        otherBattingRes,
        otherPitchingRes,
      ] = await Promise.all([
        api.get(`/preview/team/${myTeamId}/value-stats/scoring`, { params: valueParams }),
        api.get(`/preview/team/${myTeamId}/value-stats/position`, { params: valueParams }),
        api.get(`/preview/team/${myTeamId}/value-stats/batting`, { params: valueParams }),
        api.get(`/preview/team/${myTeamId}/value-stats/pitching`, { params: valueParams }),
        api.get(`/preview/team/${selectedOtherTeamId}/value-stats/scoring`, { params: valueParams }),
        api.get(`/preview/team/${selectedOtherTeamId}/value-stats/position`, { params: valueParams }),
        api.get(`/preview/team/${selectedOtherTeamId}/value-stats/batting`, { params: valueParams }),
        api.get(`/preview/team/${selectedOtherTeamId}/value-stats/pitching`, { params: valueParams }),
      ]);

      setMyTeamScoring(handleApiResponse(myScoringRes) || []);
      setMyTeamPosition(handleApiResponse(myPositionRes) || []);
      setMyTeamBatting(handleApiResponse(myBattingRes) || []);
      setMyTeamPitching(handleApiResponse(myPitchingRes) || []);
      setOtherTeamScoring(handleApiResponse(otherScoringRes) || []);
      setOtherTeamPosition(handleApiResponse(otherPositionRes) || []);
      setOtherTeamBatting(handleApiResponse(otherBattingRes) || []);
      setOtherTeamPitching(handleApiResponse(otherPitchingRes) || []);
    } catch (e) {
      setError(handleApiError(e));
    } finally {
      setLoading(false);
    }
  }, [myTeamId, selectedOtherTeamId, modelId, valueModels, spanDays]);

  useEffect(() => {
    if (myTeamId && selectedOtherTeamId) {
      fetchBothTeamsData();
    }
  }, [fetchBothTeamsData, myTeamId, selectedOtherTeamId]);

  const handleModelChange = (e) => {
    setModelId(e.target.value);
  };

  const handleSpanDaysChange = (e) => {
    setSpanDays(Number(e.target.value));
  };

  const handleOtherTeamChange = (e) => {
    setSelectedOtherTeamId(e.target.value);
    setMyTeamGives(new Set());
    setMyTeamDrops(new Set());
    setOtherTeamGives(new Set());
    setOtherTeamDrops(new Set());
  };

  const toggleMyTeamGive = (playerId) => {
    setMyTeamGives((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
    setMyTeamDrops((prev) => {
      const next = new Set(prev);
      next.delete(playerId);
      return next;
    });
  };

  const toggleMyTeamDrop = (playerId) => {
    setMyTeamDrops((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
    setMyTeamGives((prev) => {
      const next = new Set(prev);
      next.delete(playerId);
      return next;
    });
  };

  const toggleOtherTeamGive = (playerId) => {
    setOtherTeamGives((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
    setOtherTeamDrops((prev) => {
      const next = new Set(prev);
      next.delete(playerId);
      return next;
    });
  };

  const toggleOtherTeamDrop = (playerId) => {
    setOtherTeamDrops((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
    setOtherTeamGives((prev) => {
      const next = new Set(prev);
      next.delete(playerId);
      return next;
    });
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'era' || field === 'whip' ? 'asc' : 'desc');
    }
  };

  // Build per-player deltas for trade. Uses each player's total_value from the API and applies it to
  // every eligible position (so we subtract/add that value from each eligible slot in position bars).
  const getTradeDeltas = () => {
    const byPlayerId = new Map();
    for (const row of tradePlayersValueStats) {
      const id = Number(playerField(row, 'id') ?? row.id);
      if (Number.isNaN(id)) continue;
      // API may return total_value qualified (e.g. pvs.total_value) or unqualified
      const totalValue = Number(row.total_value ?? row['pvs.total_value']) || 0;
      const categories = [...HITTER_CATEGORIES, ...PITCHER_CATEGORIES];
      const scoringDelta = {};
      for (const code of categories) {
        const cat = row[code];
        scoringDelta[code] = cat?.weighted_value != null ? Number(cat.weighted_value) : 0;
      }
      let positions = [];
      try {
        const ep = playerField(row, 'eligible_positions') ?? row.eligible_positions;
        positions = getEligiblePositions(ep);
      } catch (_) {
        positions = [];
      }
      const positionDelta = {};
      for (const slot of positions) {
        positionDelta[slot] = totalValue;
      }
      byPlayerId.set(id, { scoringDelta, positionDelta, totalValue });
    }
    return byPlayerId;
  };

  const tradeDeltas = getTradeDeltas();

  // Projected scoring: base +/- give/receive
  const projectScoring = (baseScoring, subtractIds, addIds) => {
    const byCode = new Map(baseScoring.map((d) => [d.category_code, { ...d, total_value: Number(d.total_value) }]));
    for (const id of subtractIds) {
      const d = tradeDeltas.get(id);
      if (!d) continue;
      for (const [code, val] of Object.entries(d.scoringDelta)) {
        const cur = byCode.get(code);
        if (cur) cur.total_value -= val;
      }
    }
    for (const id of addIds) {
      const d = tradeDeltas.get(id);
      if (!d) continue;
      for (const [code, val] of Object.entries(d.scoringDelta)) {
        let cur = byCode.get(code);
        if (!cur) {
          cur = { category_code: code, total_value: 0, league_avg: 0, team_count: 1, ranking: 0 };
          byCode.set(code, cur);
        }
        cur.total_value += val;
      }
    }
    return Array.from(byCode.values());
  };

  // Projected position totals: subtract each traded-away player's value from every slot they're eligible for,
  // and add each received player's value to every slot they're eligible for (using API total_value).
  const projectPosition = (basePosition, subtractIds, addIds) => {
    const bySlot = new Map(
      basePosition.map((d) => [d.slot_code, { ...d, total_value: Number(d.total_value), player_count: d.player_count ?? 0 }])
    );
    for (const id of subtractIds) {
      const d = tradeDeltas.get(id);
      if (!d) continue;
      for (const [slot, val] of Object.entries(d.positionDelta)) {
        const cur = bySlot.get(slot);
        if (cur) {
          cur.total_value -= val;
          cur.player_count = Math.max(0, (cur.player_count ?? 0) - 1);
        }
      }
    }
    for (const id of addIds) {
      const d = tradeDeltas.get(id);
      if (!d) continue;
      for (const [slot, val] of Object.entries(d.positionDelta)) {
        let cur = bySlot.get(slot);
        if (!cur) {
          cur = { slot_code: slot, total_value: 0, player_count: 0, league_avg: 0, ranking: 0, team_count: 1 };
          bySlot.set(slot, cur);
        }
        cur.total_value += val;
        cur.player_count = (cur.player_count ?? 0) + 1;
      }
    }
    return Array.from(bySlot.values());
  };

  const myTeamSubtractIds = [...myTeamGives, ...myTeamDrops];
  const otherTeamSubtractIds = [...otherTeamGives, ...otherTeamDrops];
  const myTeamScoringProjected = projectScoring(myTeamScoring, myTeamSubtractIds, otherTeamGives);
  const myTeamPositionProjected = projectPosition(myTeamPosition, myTeamSubtractIds, otherTeamGives);
  const otherTeamScoringProjected = projectScoring(otherTeamScoring, otherTeamSubtractIds, myTeamGives);
  const otherTeamPositionProjected = projectPosition(otherTeamPosition, otherTeamSubtractIds, myTeamGives);

  const hasTradeSelections = myTeamGives.size > 0 || myTeamDrops.size > 0 || otherTeamGives.size > 0 || otherTeamDrops.size > 0;

  const getPlayerName = (playerId, battingList, pitchingList) => {
    const fromTrade = tradePlayersValueStats.find((r) => (playerField(r, 'id') ?? r.id) === playerId);
    if (fromTrade) return playerField(fromTrade, 'name') ?? fromTrade.name;
    const list = [...(battingList || []), ...(pitchingList || [])];
    const row = list.find((r) => (playerField(r, 'id') ?? r.id) === playerId);
    return row ? playerField(row, 'name') ?? row.name : `Player ${playerId}`;
  };

  const renderScoringCategoryChart = (scoringData, scoringProjected, title, teamCount = 12) => {
    if (!scoringData || scoringData.length === 0) {
      return (
        <div className="stats-panel">
          <h3>{title}</h3>
          <div className="empty-state">
            <p>No category totals available.</p>
          </div>
        </div>
      );
    }
    const order = [...HITTER_CATEGORIES, ...PITCHER_CATEGORIES];
    const ordered = order.map((code) => scoringData.find((d) => d.category_code === code)).filter(Boolean);
    const projectedMap = new Map((scoringProjected || []).map((d) => [d.category_code, d]));

    const values = ordered.map((d) => {
      const proj = projectedMap.get(d.category_code);
      const currentVal = Number(d.total_value);
      const projectedVal = proj != null ? Number(proj.total_value) : currentVal;
      return {
        ...d,
        total_value: currentVal,
        league_avg: Number(d.league_avg),
        diff: currentVal - Number(d.league_avg),
        projected_value: projectedVal,
        projected_diff: projectedVal - Number(d.league_avg),
      };
    });

    const maxAbsDiff = Math.max(...values.map((d) => Math.max(Math.abs(d.diff), Math.abs(d.projected_diff || 0))), 0.01);
    const barScale = 60 / maxAbsDiff;

    return (
      <div className="stats-panel">
        <h3>{title}</h3>
        <div className="value-chart" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '180px' }}>
          {values.map((d) => {
            const color = getRankingColor(d.ranking, teamCount);
            const barHeight = Math.min(Math.abs(d.diff) * barScale, 55);
            const projBarHeight = Math.min(Math.abs(d.projected_diff || 0) * barScale, 55);
            const isAbove = d.diff >= 0;
            const isProjAbove = (d.projected_diff ?? 0) >= 0;
            return (
              <div
                key={d.category_code}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 1 36px', minWidth: '36px' }}
              >
                <div style={{ fontSize: '10px', marginBottom: '4px', fontWeight: 600 }}>{d.category_code}</div>
                <div
                  style={{
                    height: '120px',
                    width: '36px',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: '2px',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ width: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      {isAbove && (
                        <div
                          style={{
                            width: '12px',
                            height: `${barHeight}px`,
                            backgroundColor: color,
                            borderRadius: '2px 2px 0 0',
                          }}
                          title={`Current: ${d.total_value.toFixed(2)}`}
                        />
                      )}
                    </div>
                    <div style={{ width: '100%', height: '2px', backgroundColor: '#444', flexShrink: 0 }} />
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                      {!isAbove && (
                        <div
                          style={{
                            width: '12px',
                            height: `${barHeight}px`,
                            backgroundColor: color,
                            borderRadius: '0 0 2px 2px',
                          }}
                          title={`Current: ${d.total_value.toFixed(2)}`}
                        />
                      )}
                    </div>
                  </div>
                  <div style={{ width: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      {isProjAbove && (
                        <div
                          style={{
                            width: '12px',
                            height: `${projBarHeight}px`,
                            backgroundColor: hasTradeSelections ? 'rgba(100, 149, 237, 0.85)' : color,
                            borderRadius: '2px 2px 0 0',
                          }}
                          title={`After trade: ${(d.projected_value ?? d.total_value).toFixed(2)}`}
                        />
                      )}
                    </div>
                    <div style={{ width: '100%', height: '2px', backgroundColor: '#444', flexShrink: 0 }} />
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                      {!isProjAbove && (
                        <div
                          style={{
                            width: '12px',
                            height: `${projBarHeight}px`,
                            backgroundColor: hasTradeSelections ? 'rgba(100, 149, 237, 0.85)' : color,
                            borderRadius: '0 0 2px 2px',
                          }}
                          title={`After trade: ${(d.projected_value ?? d.total_value).toFixed(2)}`}
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '9px', marginTop: '4px' }}>
                  {hasTradeSelections ? (
                    <span title={`Current / After: ${d.total_value.toFixed(1)} / ${(d.projected_value ?? d.total_value).toFixed(1)}`}>
                      C / A
                    </span>
                  ) : (
                    `${d.ranking}${d.ranking === 1 ? 'st' : d.ranking === 2 ? 'nd' : d.ranking === 3 ? 'rd' : 'th'}`
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {hasTradeSelections && (
          <div style={{ fontSize: '11px', color: '#666', marginTop: '8px' }}>
            Left bar = current, right bar = after trade. Baseline = league average.
          </div>
        )}
      </div>
    );
  };

  const renderPositionValueChart = (positionData, positionProjected, title, teamCount = 12) => {
    if (!positionData || positionData.length === 0) {
      return (
        <div className="stats-panel">
          <h3>{title}</h3>
          <div className="empty-state">
            <p>No position totals available.</p>
          </div>
        </div>
      );
    }
    const sorted = [...positionData].sort(
      (a, b) => (POSITION_SORT_ORDER[a.slot_code] ?? 99) - (POSITION_SORT_ORDER[b.slot_code] ?? 99)
    );
    const projectedMap = new Map((positionProjected || []).map((d) => [d.slot_code, d]));
    const values = sorted.map((d) => {
      const proj = projectedMap.get(d.slot_code);
      return {
        ...d,
        total_value: Number(d.total_value),
        league_avg: Number(d.league_avg),
        diff: Number(d.total_value) - Number(d.league_avg),
        projected_value: proj != null ? Number(proj.total_value) : Number(d.total_value),
        projected_diff: proj != null ? Number(proj.total_value) - Number(d.league_avg) : Number(d.total_value) - Number(d.league_avg),
      };
    });
    const maxAbsDiff = Math.max(...values.map((d) => Math.max(Math.abs(d.diff), Math.abs(d.projected_diff || 0))), 0.01);
    const barScale = 60 / maxAbsDiff;

    return (
      <div className="stats-panel">
        <h3>{title}</h3>
        <div className="value-chart" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '180px' }}>
          {values.map((d) => {
            const color = getRankingColor(d.ranking, teamCount);
            const barHeight = Math.min(Math.abs(d.diff) * barScale, 55);
            const projBarHeight = Math.min(Math.abs(d.projected_diff || 0) * barScale, 55);
            const isAbove = d.diff >= 0;
            const isProjAbove = (d.projected_diff ?? 0) >= 0;
            return (
              <div
                key={d.slot_code}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 1 36px', minWidth: '36px' }}
                title={`${d.slot_code}: ${d.total_value.toFixed(2)} → ${(d.projected_value ?? d.total_value).toFixed(2)}`}
              >
                <div style={{ fontSize: '10px', marginBottom: '4px', fontWeight: 600 }}>{d.slot_code}</div>
                <div style={{ height: '120px', width: '36px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '2px', justifyContent: 'center' }}>
                  <div style={{ width: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      {isAbove && (
                        <div
                          style={{
                            width: '12px',
                            height: `${barHeight}px`,
                            backgroundColor: color,
                            borderRadius: '2px 2px 0 0',
                          }}
                        />
                      )}
                    </div>
                    <div style={{ width: '100%', height: '2px', backgroundColor: '#444' }} />
                    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                      {!isAbove && (
                        <div
                          style={{
                            width: '12px',
                            height: `${barHeight}px`,
                            backgroundColor: color,
                            borderRadius: '0 0 2px 2px',
                          }}
                        />
                      )}
                    </div>
                  </div>
                  <div style={{ width: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      {isProjAbove && (
                        <div
                          style={{
                            width: '12px',
                            height: `${projBarHeight}px`,
                            backgroundColor: hasTradeSelections ? 'rgba(100, 149, 237, 0.85)' : color,
                            borderRadius: '2px 2px 0 0',
                          }}
                        />
                      )}
                    </div>
                    <div style={{ width: '100%', height: '2px', backgroundColor: '#444' }} />
                    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                      {!isProjAbove && (
                        <div
                          style={{
                            width: '12px',
                            height: `${projBarHeight}px`,
                            backgroundColor: hasTradeSelections ? 'rgba(100, 149, 237, 0.85)' : color,
                            borderRadius: '0 0 2px 2px',
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '9px', marginTop: '4px' }}>{hasTradeSelections ? 'C/A' : `${d.ranking}${d.ranking === 1 ? 'st' : d.ranking === 2 ? 'nd' : d.ranking === 3 ? 'rd' : 'th'}`}</div>
              </div>
            );
          })}
        </div>
        {hasTradeSelections && (
          <div style={{ fontSize: '11px', color: '#666', marginTop: '8px' }}>Left = current, right = after trade.</div>
        )}
      </div>
    );
  };

  const renderBatterTable = (data, teamLabel, isMyTeam, giveSet, dropSet) => {
    if (!data || data.length === 0) {
      return (
        <div className="stats-panel">
          <h3>Batter Scoring Value – {teamLabel}</h3>
          <div className="empty-state">
            <p>No batter value stats available.</p>
          </div>
        </div>
      );
    }
    const categoryCodes = HITTER_CATEGORIES.filter((code) =>
      data.some((row) => row[code] != null && (row[code].weighted_value != null || row[code].category_tier != null))
    );
    const sortedData = sortScoringValuePlayers(data, sortField, sortDirection);
    return (
      <div className="stats-panel">
        <h3>Batter Scoring Value – {teamLabel}</h3>
        <div className="stats-table-container">
          <table className="stats-table">
            <thead>
              <tr>
                <th style={{ width: '36px' }} title="Include in trade (other side receives)">Give</th>
                <th style={{ width: '36px' }} title="Drop from roster">Drop</th>
                <th onClick={() => handleSort('p.selected_position')} className="sortable-header">
                  Pos {sortField === 'p.selected_position' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Batters</th>
                <th onClick={() => handleSort('total_tier')} className="sortable-header">
                  Tier {sortField === 'total_tier' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('total_value')} className="sortable-header">
                  Value {sortField === 'total_value' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                {categoryCodes.map((code) => (
                  <th key={code} onClick={() => handleSort(code)} className="sortable-header">
                    {code} {sortField === code && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                ))}
                <th onClick={() => handleSort('risk_score')} className="sortable-header">
                  Risk {sortField === 'risk_score' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((row, index) => {
                const id = playerField(row, 'id') ?? row.id;
                const giveChecked = giveSet.has(id);
                const dropChecked = dropSet.has(id);
                return (
                  <tr key={id ?? index}>
                    <td>
                      <input
                        type="checkbox"
                        checked={giveChecked}
                        onChange={() => (isMyTeam ? toggleMyTeamGive(id) : toggleOtherTeamGive(id))}
                        title={isMyTeam ? 'Include in trade (other team receives)' : 'Other team gives this player'}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={dropChecked}
                        onChange={() => (isMyTeam ? toggleMyTeamDrop(id) : toggleOtherTeamDrop(id))}
                        title={isMyTeam ? 'Drop from roster' : 'Other team drops this player'}
                      />
                    </td>
                    <td>{playerField(row, 'selected_position') || '—'}</td>
                    <td className="player-cell">
                      <div className="player-info-cell">
                        {playerField(row, 'headshot_url') && (
                          <img src={playerField(row, 'headshot_url')} alt="" className="player-headshot-small" />
                        )}
                        <div>
                          <div className="player-name">{playerField(row, 'name') || '—'}</div>
                          <div className="player-details">
                            {playerField(row, 'mlb_team') || '—'} · {formatEligiblePositions(playerField(row, 'eligible_positions')) || '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="stat-cell" style={{ backgroundColor: getTierColor(row.total_tier) }}>
                      {row.total_tier != null ? row.total_tier : '—'}
                    </td>
                    <td className="stat-cell" style={{ backgroundColor: getTierColor(row.total_tier) }}>
                      {row.total_value != null ? Number(row.total_value).toFixed(2) : '—'}
                    </td>
                    {categoryCodes.map((code) => {
                      const cat = row[code];
                      const val = cat?.weighted_value;
                      const tier = cat?.category_tier;
                      return (
                        <td
                          key={code}
                          className="stat-cell"
                          style={{ backgroundColor: getTierColor(tier) }}
                          title={tier != null ? `Tier ${tier}` : undefined}
                        >
                          {val != null ? Number(val).toFixed(2) : '—'}
                        </td>
                      );
                    })}
                    <td className="stat-cell" style={{ backgroundColor: getTierColor(null) }}>
                      {row.risk_score != null ? row.risk_score : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderPitcherTable = (data, teamLabel, isMyTeam, giveSet, dropSet) => {
    if (!data || data.length === 0) {
      return (
        <div className="stats-panel">
          <h3>Pitcher Scoring Value – {teamLabel}</h3>
          <div className="empty-state">
            <p>No pitcher value stats available.</p>
          </div>
        </div>
      );
    }
    const categoryCodes = PITCHER_CATEGORIES.filter((code) =>
      data.some((row) => row[code] != null && (row[code].weighted_value != null || row[code].category_tier != null))
    );
    const sortedData = sortScoringValuePlayers(data, sortField, sortDirection);
    return (
      <div className="stats-panel">
        <h3>Pitcher Scoring Value – {teamLabel}</h3>
        <div className="stats-table-container">
          <table className="stats-table">
            <thead>
              <tr>
                <th style={{ width: '36px' }} title="Include in trade (other side receives)">Give</th>
                <th style={{ width: '36px' }} title="Drop from roster">Drop</th>
                <th onClick={() => handleSort('p.selected_position')} className="sortable-header">
                  Pos {sortField === 'p.selected_position' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Pitchers</th>
                <th onClick={() => handleSort('total_tier')} className="sortable-header">
                  Tier {sortField === 'total_tier' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('total_value')} className="sortable-header">
                  Value {sortField === 'total_value' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                {categoryCodes.map((code) => (
                  <th key={code} onClick={() => handleSort(code)} className="sortable-header">
                    {code} {sortField === code && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                ))}
                <th onClick={() => handleSort('risk_score')} className="sortable-header">
                  Risk {sortField === 'risk_score' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((row, index) => {
                const id = playerField(row, 'id') ?? row.id;
                const giveChecked = giveSet.has(id);
                const dropChecked = dropSet.has(id);
                return (
                  <tr key={id ?? index}>
                    <td>
                      <input
                        type="checkbox"
                        checked={giveChecked}
                        onChange={() => (isMyTeam ? toggleMyTeamGive(id) : toggleOtherTeamGive(id))}
                        title={isMyTeam ? 'Include in trade (other team receives)' : 'Other team gives this player'}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={dropChecked}
                        onChange={() => (isMyTeam ? toggleMyTeamDrop(id) : toggleOtherTeamDrop(id))}
                        title={isMyTeam ? 'Drop from roster' : 'Other team drops this player'}
                      />
                    </td>
                    <td>{playerField(row, 'selected_position') || '—'}</td>
                    <td className="player-cell">
                      <div className="player-info-cell">
                        {playerField(row, 'headshot_url') && (
                          <img src={playerField(row, 'headshot_url')} alt="" className="player-headshot-small" />
                        )}
                        <div>
                          <div className="player-name">{playerField(row, 'name') || '—'}</div>
                          <div className="player-details">
                            {playerField(row, 'mlb_team') || '—'} · {formatEligiblePositions(playerField(row, 'eligible_positions')) || '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="stat-cell" style={{ backgroundColor: getTierColor(row.total_tier) }}>
                      {row.total_tier != null ? row.total_tier : '—'}
                    </td>
                    <td className="stat-cell" style={{ backgroundColor: getTierColor(row.total_tier) }}>
                      {row.total_value != null ? Number(row.total_value).toFixed(2) : '—'}
                    </td>
                    {categoryCodes.map((code) => {
                      const cat = row[code];
                      const val = cat?.weighted_value;
                      const tier = cat?.category_tier;
                      return (
                        <td
                          key={code}
                          className="stat-cell"
                          style={{ backgroundColor: getTierColor(tier) }}
                          title={tier != null ? `Tier ${tier}` : undefined}
                        >
                          {val != null ? Number(val).toFixed(2) : '—'}
                        </td>
                      );
                    })}
                    <td className="stat-cell" style={{ backgroundColor: getTierColor(null) }}>
                      {row.risk_score != null ? row.risk_score : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const teamCount = myTeamScoring[0]?.team_count ?? otherTeamScoring[0]?.team_count ?? 12;
  const otherTeamName = teams.find((t) => String(t.id) === selectedOtherTeamId)?.team_name || 'Other Team';

  if (teamsLoading) return <div className="loading-container">Loading teams...</div>;
  if (error) return <div className="error-container">{error}</div>;

  return (
    <div className="container">
      <div className="header-with-actions">
        <h1>Trade Analysis</h1>
      </div>

      <div className="section">
        <h3>Filters</h3>
        <div className="form-container-wide">
          <div className="form-group">
            <label htmlFor="trade-value-model">Value model:</label>
            <select
              id="trade-value-model"
              value={modelId}
              onChange={handleModelChange}
              className="form-input form-input-select"
            >
              <option value="">Select model...</option>
              {valueModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || `Model ${m.id}`}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="trade-span-days">Collected Data Span (Days):</label>
            <select id="trade-span-days" value={spanDays} onChange={handleSpanDaysChange} className="form-input form-input-select">
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="trade-other-team">Trade with team:</label>
            <select
              id="trade-other-team"
              value={selectedOtherTeamId}
              onChange={handleOtherTeamChange}
              className="form-input form-input-select"
            >
              <option value="">Select a team...</option>
              {otherTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.team_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {hasTradeSelections && (
        <div className="section" style={{ backgroundColor: 'var(--section-alt, #f8f9fa)', padding: '12px 16px', borderRadius: 8 }}>
          <h3>Trade summary</h3>
          <p style={{ margin: '4px 0' }}>
            <strong>My team ({myTeam?.team_name || 'My Team'}) receives:</strong>{' '}
            {otherTeamGives.size === 0
              ? '—'
              : [...otherTeamGives]
                  .map((id) => getPlayerName(id, otherTeamBatting, otherTeamPitching))
                  .join(', ')}
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>My team gives (in trade):</strong>{' '}
            {myTeamGives.size === 0
              ? '—'
              : [...myTeamGives]
                  .map((id) => getPlayerName(id, myTeamBatting, myTeamPitching))
                  .join(', ')}
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>My team drops:</strong>{' '}
            {myTeamDrops.size === 0
              ? '—'
              : [...myTeamDrops]
                  .map((id) => getPlayerName(id, myTeamBatting, myTeamPitching))
                  .join(', ')}
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>{otherTeamName} receives:</strong>{' '}
            {myTeamGives.size === 0 ? '—' : [...myTeamGives].map((id) => getPlayerName(id, myTeamBatting, myTeamPitching)).join(', ')}
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>{otherTeamName} gives (in trade):</strong>{' '}
            {otherTeamGives.size === 0 ? '—' : [...otherTeamGives].map((id) => getPlayerName(id, otherTeamBatting, otherTeamPitching)).join(', ')}
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>{otherTeamName} drops:</strong>{' '}
            {otherTeamDrops.size === 0 ? '—' : [...otherTeamDrops].map((id) => getPlayerName(id, otherTeamBatting, otherTeamPitching)).join(', ')}
          </p>
          {tradePlayersLoading && <p style={{ fontSize: '12px', color: '#666' }}>Updating projected values…</p>}
        </div>
      )}

      {selectedOtherTeamId && myTeamId && (
        <div className="section">
          {loading ? (
            <div className="loading-container">Loading value data...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
              <div>
                <h2 style={{ marginBottom: '12px' }}>{myTeam?.team_name || 'My Team'}</h2>
                {renderScoringCategoryChart(myTeamScoring, myTeamScoringProjected, 'Team value by scoring category', teamCount)}
                {renderPositionValueChart(myTeamPosition, myTeamPositionProjected, 'Team value by position', teamCount)}
                {renderBatterTable(myTeamBatting, myTeam?.team_name || 'My Team', true, myTeamGives, myTeamDrops)}
                {renderPitcherTable(myTeamPitching, myTeam?.team_name || 'My Team', true, myTeamGives, myTeamDrops)}
              </div>
              <div>
                <h2 style={{ marginBottom: '12px' }}>{otherTeamName}</h2>
                {renderScoringCategoryChart(otherTeamScoring, otherTeamScoringProjected, 'Team value by scoring category', teamCount)}
                {renderPositionValueChart(otherTeamPosition, otherTeamPositionProjected, 'Team value by position', teamCount)}
                {renderBatterTable(otherTeamBatting, otherTeamName, false, otherTeamGives, otherTeamDrops)}
                {renderPitcherTable(otherTeamPitching, otherTeamName, false, otherTeamGives, otherTeamDrops)}
              </div>
            </div>
          )}
        </div>
      )}

      {(!selectedOtherTeamId || !myTeamId) && !teamsLoading && (
        <div className="section">
          <p>Select a team to compare, and ensure your league has been synced (e.g. from League Teams).</p>
        </div>
      )}

      <div className="text-center mt-20">
        <button type="button" onClick={() => (window.location.href = '/')} className="btn btn-secondary">
          Back to Home
        </button>
      </div>
    </div>
  );
}

export default TradeAnalysis;
