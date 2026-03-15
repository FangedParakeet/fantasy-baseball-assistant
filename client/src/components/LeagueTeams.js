import React, { useState, useEffect, useCallback } from 'react';
import api, { handleApiResponse, handleApiError } from '../utils/api';
import { ucfirst, formatIP, sortPlayers, getPercentileColor, formatDate, formatEligiblePositions, getRankingColor, getTierColor, sortScoringValuePlayers } from '../utils/functions';
import { HITTER_CATEGORIES, PITCHER_CATEGORIES, POSITION_SORT_ORDER } from '../utils/leagueConstants';

function LeagueTeams() {
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [spanDays, setSpanDays] = useState(7);
  const [activeTab, setActiveTab] = useState('summary');
  const [batters, setBatters] = useState([]);
  const [pitchers, setPitchers] = useState([]);
  const [twoStartPitchers, setTwoStartPitchers] = useState([]);
  const [probablePitchers, setProbablePitchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('desc');
  const [modelId, setModelId] = useState('');
  const [valueModels, setValueModels] = useState([]);
  const [battingValueStats, setBattingValueStats] = useState([]);
  const [pitchingValueStats, setPitchingValueStats] = useState([]);
  const [teamScoringStats, setTeamScoringStats] = useState([]);
  const [teamPositionStats, setTeamPositionStats] = useState([]);

  useEffect(() => {
    fetchTeams();
    // Set default date to current Monday
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);
    setSelectedDate(monday.toISOString().split('T')[0]);
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
      } catch (err) {
        setValueModels([]);
      }
    };
    fetchValueModels();
  }, [modelId]);

  const fetchTeamData = useCallback(async () => {
    if (!selectedTeamId || !selectedDate) return;

    try {
      setLoading(true);
      setError('');

      const endDate = new Date(selectedDate);
      endDate.setDate(endDate.getDate() + 6); // Sunday
      const endDateStr = endDate.toISOString().split('T')[0];

      const queryParams = {
        startDate: selectedDate,
        endDate: endDateStr,
        spanDays: spanDays
      };

      if (activeTab === 'summary') {
        const [battersResponse, pitchersResponse] = await Promise.all([
          api.get(`/preview/team/${selectedTeamId}/stats/batting`, { params: queryParams }),
          api.get(`/preview/team/${selectedTeamId}/stats/pitching`, { params: queryParams })
        ]);
        
        const battersData = handleApiResponse(battersResponse);
        const pitchersData = handleApiResponse(pitchersResponse);
        
        console.log('Batters data:', battersData);
        console.log('Pitchers data:', pitchersData);

        setBatters(battersData);
        setPitchers(pitchersData);
      } else if (activeTab === 'schedule-strength') {
        const [battersResponse, pitchersResponse] = await Promise.all([
          api.get(`/preview/team/${selectedTeamId}/schedule-strength/batting`, { params: queryParams }),
          api.get(`/preview/team/${selectedTeamId}/schedule-strength/pitching`, { params: queryParams })
        ]);
        const battersData = handleApiResponse(battersResponse);
        const pitchersData = handleApiResponse(pitchersResponse);
        
        console.log('Schedule Strength - Batters data:', battersData);
        console.log('Schedule Strength - Pitchers data:', pitchersData);
        
        setBatters(battersData);
        setPitchers(pitchersData);
      } else if (activeTab === 'probable-pitchers') {
        const response = await api.get(`/preview/team/${selectedTeamId}/probable-pitchers`, { params: queryParams });
        const data = handleApiResponse(response);
        
        console.log('Probable pitchers data:', data);
        
        const twoStart = data.twoStartPitchers;
        const regular = data.probablePitchers;
        console.log('Two-start pitchers:', twoStart);
        console.log('Regular probable pitchers:', regular);
        
        setTwoStartPitchers(twoStart);
        setProbablePitchers(regular);
      } else if (activeTab === 'scoring-value') {
        const effectiveModelId = modelId || valueModels[0]?.id;
        if (!effectiveModelId) {
          setBattingValueStats([]);
          setPitchingValueStats([]);
          setTeamScoringStats([]);
          setTeamPositionStats([]);
        } else {
          const valueParams = { modelId: effectiveModelId, spanDays };
          const [battingRes, pitchingRes, scoringRes, positionRes] = await Promise.all([
          api.get(`/preview/team/${selectedTeamId}/value-stats/batting`, { params: valueParams }),
          api.get(`/preview/team/${selectedTeamId}/value-stats/pitching`, { params: valueParams }),
          api.get(`/preview/team/${selectedTeamId}/value-stats/scoring`, { params: valueParams }),
          api.get(`/preview/team/${selectedTeamId}/value-stats/position`, { params: valueParams })
        ]);
          setBattingValueStats(handleApiResponse(battingRes) || []);
          setPitchingValueStats(handleApiResponse(pitchingRes) || []);
          setTeamScoringStats(handleApiResponse(scoringRes) || []);
          setTeamPositionStats(handleApiResponse(positionRes) || []);
        }
      }
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId, selectedDate, spanDays, activeTab, modelId, valueModels]);

  useEffect(() => {
    if (selectedTeamId && selectedDate) {
      fetchTeamData();
    }
  }, [selectedTeamId, selectedDate, fetchTeamData]);

  const fetchTeams = async () => {
    try {
      setTeamsLoading(true);
      const response = await api.get('/league-teams');
      const data = handleApiResponse(response);
      setTeams(data || []);
      if (data && data.length > 0) {
        setSelectedTeamId(data[0].id);
      }
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setTeamsLoading(false);
    }
  };

  const handleSyncAllRosters = async () => {
    try {
      setSyncing(true);
      await api.post('/league-teams/sync-all-rosters');
      await fetchTeamData();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncRoster = async () => {
    if (!selectedTeamId) return;
    
    try {
      setSyncing(true);
      await api.post(`/league-teams/${selectedTeamId}/sync-roster`);
      await fetchTeamData();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSyncing(false);
    }
  };

  const handleTeamChange = (event) => {
    setSelectedTeamId(event.target.value);
  };

  const handleDateChange = (event) => {
    setSelectedDate(event.target.value);
  };

  const handleSpanDaysChange = (event) => {
    setSpanDays(parseInt(event.target.value));
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'era' || field === 'whip' ? 'asc' : 'desc');
    }
  };


  const renderBattersTable = (data, title) => {
    console.log(data);
    if (!data || data.length === 0) {
      return (
        <div className="stats-panel">
          <h3>{title}</h3>
          <div className="empty-state">
            <p>No batters data available.</p>
          </div>
        </div>
      );
    }
    
    const sortedData = sortPlayers(data, sortField, sortDirection);

    return (
      <div className="stats-panel">
        <h3>{title}</h3>
        <div className="stats-table-container">
          <table className="stats-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('position')} className="sortable-header">
                  Pos {sortField === 'position' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Batters</th>
                <th>H/AB</th>
                <th onClick={() => handleSort('fantasy_score')} className="sortable-header">
                  Fantasy Score {sortField === 'fantasy_score' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('runs')} className="sortable-header">
                  R {sortField === 'runs' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('hr')} className="sortable-header">
                  HR {sortField === 'hr' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('rbi')} className="sortable-header">
                  RBI {sortField === 'rbi' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('sb')} className="sortable-header">
                  SB {sortField === 'sb' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('avg')} className="sortable-header">
                  AVG {sortField === 'avg' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((player, index) => (
                <tr key={index}>
                  <td>{player.selected_position || 'N/A'}</td>
                  <td className="player-cell">
                    <div className="player-info-cell">
                      {player.headshot_url && (
                        <img src={player.headshot_url} alt={`${player.name} headshot`} className="player-headshot-small" />
                      )}
                      <div>
                        <div className="player-name">{player.name || 'Unknown Player'}</div>
                        <div className="player-details">
                          {player.mlb_team || 'N/A'} - {formatEligiblePositions(player.eligible_positions) || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{player.hits}/{player.abs}</td>
                  <td
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.fantasy_score, player.reliability_score) }}
                  >
                    {player.fantasy_score ? Number.parseFloat(player.fantasy_score).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.runs_pct, player.reliability_score) }}
                    title={player.runs_pct ? `${player.runs_pct}th %-ile` : 'No data'}
                  >
                    {player.runs || 0}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.hr_pct, player.reliability_score) }}
                    title={player.hr_pct ? `${player.hr_pct}th %-ile` : 'No data'}
                  >
                    {player.hr || 0}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.rbi_pct, player.reliability_score) }}
                    title={player.rbi_pct ? `${player.rbi_pct}th %-ile` : 'No data'}
                  >
                    {player.rbi || 0}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.sb_pct, player.reliability_score) }}
                    title={player.sb_pct ? `${player.sb_pct}th %-ile` : 'No data'}
                  >
                    {player.sb || 0}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.avg_pct, player.reliability_score) }}
                    title={player.avg_pct ? `${player.avg_pct}th %-ile` : 'No data'}
                  >
                    {player.hits && player.abs ? Number.parseFloat((player.hits / player.abs).toFixed(3)) : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderPitchersTable = (data, title) => {
    if (!data || data.length === 0) {
      return (
        <div className="stats-panel">
          <h3>{title}</h3>
          <div className="empty-state">
            <p>No pitchers data available.</p>
          </div>
        </div>
      );
    }
    
    const sortedData = sortPlayers(data, sortField, sortDirection);

    return (
      <div className="stats-panel">
        <h3>{title}</h3>
        <div className="stats-table-container">
          <table className="stats-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('position')} className="sortable-header">
                  Pos {sortField === 'position' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Pitchers</th>
                <th>IP</th>
                <th onClick={() => handleSort('fantasy_score')} className="sortable-header">
                  Fantasy Score {sortField === 'fantasy_score' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('strikeouts')} className="sortable-header">
                  K {sortField === 'strikeouts' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('era')} className="sortable-header">
                  ERA {sortField === 'era' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('whip')} className="sortable-header">
                  WHIP {sortField === 'whip' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('qs')} className="sortable-header">
                  QS {sortField === 'qs' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('sv')} className="sortable-header">
                  SV {sortField === 'sv' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('hld')} className="sortable-header">
                  HLD {sortField === 'hld' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((player, index) => (
                <tr key={index}>
                  <td>{player.selected_position || 'N/A'}</td>
                  <td className="player-cell">
                    <div className="player-info-cell">
                      {player.headshot_url && (
                        <img src={player.headshot_url} alt={`${player.name} headshot`} className="player-headshot-small" />
                      )}
                      <div>
                        <div className="player-name">{player.name || 'Unknown Player'}</div>
                        <div className="player-details">
                          {player.mlb_team || 'N/A'} - {formatEligiblePositions(player.eligible_positions) || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{formatIP(player.ip) || 0}</td>
                  <td
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.fantasy_score, player.reliability_score) }}
                  >
                    {player.fantasy_score ? Number.parseFloat(player.fantasy_score).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.strikeouts_pct, player.reliability_score) }}
                    title={player.strikeouts_pct ? `${player.strikeouts_pct}th %-ile` : 'No data'}
                  >
                    {player.strikeouts || 0}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(100 - player.era_pct, player.reliability_score) }}
                    title={player.era_pct ? `${100 - player.era_pct}th %-ile` : 'No data'}
                  >
                    {player.era ? Number.parseFloat(player.era).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(100 - player.whip_pct, player.reliability_score) }}
                    title={player.whip_pct ? `${100 - player.whip_pct}th %-ile` : 'No data'}
                  >
                    {player.whip ? Number.parseFloat(player.whip).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.qs_pct, player.reliability_score) }}
                    title={player.qs_pct ? `${player.qs_pct}th %-ile` : 'No data'}
                  >
                    {player.qs || 0}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.sv_pct, player.reliability_score) }}
                    title={player.sv_pct ? `${player.sv_pct}th %-ile` : 'No data'}
                  >
                    {player.sv || 0}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.hld_pct, player.reliability_score) }}
                    title={player.hld_pct ? `${player.hld_pct}th %-ile` : 'No data'}
                  >
                    {player.hld || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const playerField = (row, key) => row[`p.${key}`] ?? row[key];

  const renderScoringValueBattersTable = (data) => {
    if (!data || data.length === 0) {
      return (
        <div className="stats-panel">
          <h3>Batter Scoring Value</h3>
          <div className="empty-state">
            <p>No batter value stats available.</p>
          </div>
        </div>
      );
    }
    const batterCategoryCodes = HITTER_CATEGORIES.filter((code) =>
      data.some((row) => row[code] != null && (row[code].weighted_value != null || row[code].category_tier != null))
    );
    const sortedData = sortScoringValuePlayers(data, sortField, sortDirection);
    return (
      <div className="stats-panel">
        <h3>Batter Scoring Value</h3>
        <div className="stats-table-container">
          <table className="stats-table">
            <thead>
              <tr>
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
                {batterCategoryCodes.map((code) => (
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
              {sortedData.map((row, index) => (
                <tr key={playerField(row, 'id') ?? index}>
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
                  <td
                    className="stat-cell"
                    style={{ backgroundColor: getTierColor(row.total_tier) }}
                  >
                    {row.total_tier != null ? row.total_tier : '—'}
                  </td>
                  <td
                    className="stat-cell"
                    style={{ backgroundColor: getTierColor(row.total_tier) }}
                  >
                    {row.total_value != null ? Number(row.total_value).toFixed(2) : '—'}
                  </td>
                  {batterCategoryCodes.map((code) => {
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
                  <td
                    className="stat-cell"
                    style={{ backgroundColor: getTierColor(null) }}
                  >
                    {row.risk_score != null ? row.risk_score : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderScoringValuePitchersTable = (data) => {
    if (!data || data.length === 0) {
      return (
        <div className="stats-panel">
          <h3>Pitcher Scoring Value</h3>
          <div className="empty-state">
            <p>No pitcher value stats available.</p>
          </div>
        </div>
      );
    }
    const pitcherCategoryCodes = PITCHER_CATEGORIES.filter((code) =>
      data.some((row) => row[code] != null && (row[code].weighted_value != null || row[code].category_tier != null))
    );
    const sortedData = sortScoringValuePlayers(data, sortField, sortDirection);
    return (
      <div className="stats-panel">
        <h3>Pitcher Scoring Value</h3>
        <div className="stats-table-container">
          <table className="stats-table">
            <thead>
              <tr>
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
                {pitcherCategoryCodes.map((code) => (
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
              {sortedData.map((row, index) => (
                <tr key={playerField(row, 'id') ?? index}>
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
                  <td
                    className="stat-cell"
                    style={{ backgroundColor: getTierColor(row.total_tier) }}
                  >
                    {row.total_tier != null ? row.total_tier : '—'}
                  </td>
                  <td
                    className="stat-cell"
                    style={{ backgroundColor: getTierColor(row.total_tier) }}
                  >
                    {row.total_value != null ? Number(row.total_value).toFixed(2) : '—'}
                  </td>
                  {pitcherCategoryCodes.map((code) => {
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
                  <td
                    className="stat-cell"
                    style={{ backgroundColor: getTierColor(null) }}
                  >
                    {row.risk_score != null ? row.risk_score : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderScoringCategoryChart = (data) => {
    if (!data || data.length === 0) {
      return (
        <div className="stats-panel">
          <h3>Team value by scoring category</h3>
          <div className="empty-state">
            <p>No category totals available.</p>
          </div>
        </div>
      );
    }
    const order = [...HITTER_CATEGORIES, ...PITCHER_CATEGORIES];
    const ordered = order.map((code) => data.find((d) => d.category_code === code)).filter(Boolean);
    const teamCount = ordered[0]?.team_count ?? 1;
    const values = ordered.map((d) => ({
      ...d,
      total_value: Number(d.total_value),
      league_avg: Number(d.league_avg),
      diff: Number(d.total_value) - Number(d.league_avg),
    }));
    const maxAbsDiff = Math.max(...values.map((d) => Math.abs(d.diff)), 0.01);
    const barScale = 60 / maxAbsDiff;


    return (
      <div className="stats-panel">
        <h3>Team value by scoring category</h3>
        <div className="value-chart" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '180px' }}>
          {values.map((d) => {
            const color = getRankingColor(d.ranking, teamCount);
            const barHeight = Math.min(Math.abs(d.diff) * barScale, 55);
            const isAbove = d.diff >= 0;
            return (
              <div key={d.category_code} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 1 36px', minWidth: '36px' }}>
                <div style={{ fontSize: '10px', marginBottom: '4px', fontWeight: 600 }}>{d.category_code}</div>
                <div style={{ height: '120px', width: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'stretch' }}>
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    {isAbove && (
                      <div
                        style={{ width: '24px', height: `${barHeight}px`, backgroundColor: color, borderRadius: '3px 3px 0 0' }}
                        title={`${d.total_value.toFixed(2)} (league avg ${d.league_avg.toFixed(2)})`}
                      />
                    )}
                  </div>
                  <div style={{ width: '100%', height: '2px', backgroundColor: '#444', flexShrink: 0 }} title="League avg" />
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                    {!isAbove && (
                      <div
                        style={{ width: '24px', height: `${barHeight}px`, backgroundColor: color, borderRadius: '0 0 3px 3px' }}
                        title={`${d.total_value.toFixed(2)} (league avg ${d.league_avg.toFixed(2)})`}
                      />
                    )}
                  </div>
                </div>
                <div style={{ fontSize: '10px', marginTop: '4px' }}>{d.ranking}{d.ranking === 1 ? 'st' : d.ranking === 2 ? 'nd' : d.ranking === 3 ? 'rd' : 'th'} in league</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: '11px', color: '#666', marginTop: '8px' }}>Baseline = league average. Bar extends above (above avg) or below (below avg).</div>
      </div>
    );
  };

  const renderPositionValueChart = (data) => {
    if (!data || data.length === 0) {
      return (
        <div className="stats-panel">
          <h3>Team value by position</h3>
          <div className="empty-state">
            <p>No position totals available.</p>
          </div>
        </div>
      );
    }
    const sorted = [...data].sort((a, b) => (POSITION_SORT_ORDER[a.slot_code] ?? 99) - (POSITION_SORT_ORDER[b.slot_code] ?? 99));
    const teamCount = sorted[0]?.team_count ?? 1;
    const values = sorted.map((d) => ({
      ...d,
      total_value: Number(d.total_value),
      league_avg: Number(d.league_avg),
      diff: Number(d.total_value) - Number(d.league_avg),
    }));
    const maxAbsDiff = Math.max(...values.map((d) => Math.abs(d.diff)), 0.01);
    const barScale = 60 / maxAbsDiff;

    return (
      <div className="stats-panel">
        <h3>Team value by position</h3>
        <div className="value-chart" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '180px' }}>
          {values.map((d) => {
            const color = getRankingColor(d.ranking, teamCount);
            const barHeight = Math.min(Math.abs(d.diff) * barScale, 55);
            const isAbove = d.diff >= 0;
            const playerCount = d.player_count ?? 0;
            return (
              <div
                key={d.slot_code}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 1 36px', minWidth: '36px' }}
                title={`${d.slot_code}: ${d.total_value.toFixed(2)} (avg ${d.league_avg.toFixed(2)}) · ${playerCount} players`}
              >
                <div style={{ fontSize: '10px', marginBottom: '4px', fontWeight: 600 }}>{d.slot_code}</div>
                <div style={{ height: '120px', width: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'stretch' }}>
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    {isAbove && (
                      <div style={{ width: '24px', height: `${barHeight}px`, backgroundColor: color, borderRadius: '3px 3px 0 0' }} />
                    )}
                  </div>
                  <div style={{ width: '100%', height: '2px', backgroundColor: '#444', flexShrink: 0 }} title="League avg" />
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                    {!isAbove && (
                      <div style={{ width: '24px', height: `${barHeight}px`, backgroundColor: color, borderRadius: '0 0 3px 3px' }} />
                    )}
                  </div>
                </div>
                <div style={{ fontSize: '10px', marginTop: '4px' }}>{d.ranking}{d.ranking === 1 ? 'st' : d.ranking === 2 ? 'nd' : d.ranking === 3 ? 'rd' : 'th'} in league</div>
                <div style={{ fontSize: '9px', color: '#888', marginTop: '2px' }} title={`${playerCount} players`}>{playerCount} players</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: '11px', color: '#666', marginTop: '8px' }}>Baseline = league average. Hover for player count.</div>
      </div>
    );
  };

  const renderPitcherScheduleStrengthTable = (data) => {
    if (!data || data.length === 0) {
      return (
        <div className="stats-panel">
          <h3>Pitcher Schedule Strength</h3>
          <div className="empty-state">
            <p>No pitcher schedule strength data available.</p>
          </div>
        </div>
      );
    }
    
    const sortedData = sortPlayers(data, sortField, sortDirection);

    return (
      <div className="stats-panel">
        <h3>Pitcher Schedule Strength</h3>
        <div className="stats-table-container">
          <table className="stats-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('position')} className="sortable-header">
                  Pos {sortField === 'position' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Pitchers</th>
                <th>Starts</th>
                <th onClick={() => handleSort('pitcher_week_score')} className="sortable-header">
                  Week Score {sortField === 'pitcher_week_score' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('fip_pct')} className="sortable-header">
                  FIP %{sortField === 'fip_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('k_per_9_pct')} className="sortable-header">
                  K/9 %{sortField === 'k_per_9_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('bb_per_9_pct')} className="sortable-header">
                  BB/9 %{sortField === 'bb_per_9_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('qs_pct')} className="sortable-header">
                  QS %{sortField === 'qs_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((player, index) => (
                <tr key={index}>
                  <td>{player.selected_position || 'N/A'}</td>
                  <td className="player-cell">
                    <div className="player-info-cell">
                      {player.headshot_url && (
                        <img src={player.headshot_url} alt={`${player.name} headshot`} className="player-headshot-small" />
                      )}
                      <div>
                        <div className="player-name">{player.name || 'Unknown Player'}</div>
                        <div className="player-details">
                          {player.mlb_team || 'N/A'} - {formatEligiblePositions(player.eligible_positions) || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{player.starts || 0}</td>
                  <td
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.pitcher_week_score, player.reliability_score) }}
                  >
                    {player.pitcher_week_score ? Number.parseFloat(player.pitcher_week_score).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(100 - player.fip_pct, player.reliability_score) }}
                    title={player.fip_pct ? `${100 - player.fip_pct}th %-ile` : 'No data'}
                  >
                    {player.fip_pct ? Number.parseFloat(100 - player.fip_pct).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.k_per_9_pct, player.reliability_score) }}
                    title={player.k_per_9_pct ? `${player.k_per_9_pct}th %-ile` : 'No data'}
                  >
                    {player.k_per_9_pct ? Number.parseFloat(player.k_per_9_pct).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(100 - player.bb_per_9_pct, player.reliability_score) }}
                    title={player.bb_per_9_pct ? `${100 - player.bb_per_9_pct}th %-ile` : 'No data'}
                  >
                    {player.bb_per_9_pct ? Number.parseFloat(100 - player.bb_per_9_pct).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.qs_pct, player.reliability_score) }}
                    title={player.qs_pct ? `${player.qs_pct}th %-ile` : 'No data'}
                  >
                    {player.qs_pct ? Number.parseFloat(player.qs_pct).toFixed(2) : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderBatterScheduleStrengthTable = (data) => {
    if (!data || data.length === 0) {
      return (
        <div className="stats-panel">
          <h3>Batter Schedule Strength</h3>
          <div className="empty-state">
            <p>No batter schedule strength data available.</p>
          </div>
        </div>
      );
    }
    
    const sortedData = sortPlayers(data, sortField, sortDirection);

    return (
      <div className="stats-panel">
        <h3>Batter Schedule Strength</h3>
        <div className="stats-table-container">
          <table className="stats-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('position')} className="sortable-header">
                  Pos {sortField === 'position' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Batters</th>
                <th>Games</th>
                <th onClick={() => handleSort('hitter_week_score')} className="sortable-header">
                  Week Score {sortField === 'hitter_week_score' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('obp_pct')} className="sortable-header">
                  OBP %{sortField === 'obp_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('slg_pct')} className="sortable-header">
                  SLG %{sortField === 'slg_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('ops_pct')} className="sortable-header">
                  OPS %{sortField === 'ops_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('k_rate_pct')} className="sortable-header">
                  K Rate %{sortField === 'k_rate_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('bb_rate_pct')} className="sortable-header">
                  BB Rate %{sortField === 'bb_rate_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('iso_pct')} className="sortable-header">
                  ISO %{sortField === 'iso_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('wraa_pct')} className="sortable-header">
                  WRAA %{sortField === 'wraa_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((player, index) => (
                <tr key={index}>
                  <td>{player.selected_position || 'N/A'}</td>
                  <td className="player-cell">
                    <div className="player-info-cell">
                      {player.headshot_url && (
                        <img src={player.headshot_url} alt={`${player.name} headshot`} className="player-headshot-small" />
                      )}
                      <div>
                        <div className="player-name">{player.name || 'Unknown Player'}</div>
                        <div className="player-details">
                          {player.mlb_team || 'N/A'} - {formatEligiblePositions(player.eligible_positions) || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{player.games || 0}</td>
                  <td
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.hitter_week_score, player.reliability_score) }}
                  >
                    {player.hitter_week_score ? Number.parseFloat(player.hitter_week_score).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.obp_pct, player.reliability_score) }}
                    title={player.obp_pct ? `${player.obp_pct}th %-ile` : 'No data'}
                  >
                    {player.obp_pct ? Number.parseFloat(player.obp_pct).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.slg_pct, player.reliability_score) }}
                    title={player.slg_pct ? `${player.slg_pct}th %-ile` : 'No data'}
                  >
                    {player.slg_pct ? Number.parseFloat(player.slg_pct).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.ops_pct, player.reliability_score) }}
                    title={player.ops_pct ? `${player.ops_pct}th %-ile` : 'No data'}
                  >
                    {player.ops_pct ? Number.parseFloat(player.ops_pct).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(100 - player.k_rate_pct, player.reliability_score) }}
                    title={player.k_rate_pct ? `${100 - player.k_rate_pct}th %-ile` : 'No data'}
                  >
                    {player.k_rate_pct ? Number.parseFloat(100 - player.k_rate_pct).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.bb_rate_pct, player.reliability_score) }}
                    title={player.bb_rate_pct ? `${player.bb_rate_pct}th %-ile` : 'No data'}
                  >
                    {player.bb_rate_pct ? Number.parseFloat(player.bb_rate_pct).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.iso_pct, player.reliability_score) }}
                    title={player.iso_pct ? `${player.iso_pct}th %-ile` : 'No data'}
                  >
                    {player.iso_pct ? Number.parseFloat(player.iso_pct).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.wraa_pct, player.reliability_score) }}
                    title={player.wraa_pct ? `${player.wraa_pct}th %-ile` : 'No data'}
                  >
                    {player.wraa_pct ? Number.parseFloat(player.wraa_pct).toFixed(2) : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderProbablePitchersTable = (data) => {
    if (!data || data.length === 0) {
      return (
        <div className="stats-panel">
          <h3>Probable Pitchers</h3>
          <div className="empty-state">
            <p>No probable pitchers data available.</p>
          </div>
        </div>
      );
    }
    
    const sortedData = sortPlayers(data, sortField, sortDirection);

    return (
      <div className="stats-panel">
        <h3>Probable Pitchers</h3>
        <div className="stats-table-container">
          <table className="stats-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('game_date')} className="sortable-header">
                  Date {sortField === 'game_date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Pitchers</th>
                <th>Team</th>
                <th>Opponent</th>
                <th>Home/Away</th>
                <th onClick={() => handleSort('qs_likelihood_score')} className="sortable-header">
                  QS Score {sortField === 'qs_likelihood_score' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((player, index) => (
                <tr key={index}>
                  <td>{formatDate(player.game_date)}</td>
                  <td className="player-cell">
                    <div className="player-info-cell">
                      {player.headshot_url && (
                        <img src={player.headshot_url} alt={`${player.name} headshot`} className="player-headshot-small" />
                      )}
                      <div>
                        <div className="player-name">{player.name || 'Unknown Player'}</div>
                        <div className="player-details">
                          {player.mlb_team || 'N/A'} - {formatEligiblePositions(player.eligible_positions) || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{player.team || 'N/A'}</td>
                  <td>{player.opponent || 'N/A'}</td>
                  <td>{player.home ? 'Home' : 'Away'}</td>
                  <td
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.qs_likelihood_score, 100) }}
                  >
                    {player.qs_likelihood_score ? Number.parseFloat(player.qs_likelihood_score).toFixed(1) : 'N/A'}
                  </td>
                  <td>{player.accuracy ? `${ucfirst(player.accuracy)}` : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderTwoStartPitchersTable = (data) => {
    if (!data || data.length === 0) {
      return (
        <div className="stats-panel">
          <h3>Two-Start Pitchers</h3>
          <div className="empty-state">
            <p>No two-start pitchers data available.</p>
          </div>
        </div>
      );
    }
    
    const sortedData = sortPlayers(data, sortField, sortDirection);

    return (
      <div className="stats-panel">
        <h3>Two-Start Pitchers</h3>
        <div className="stats-table-container">
          <table className="stats-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('game_date')} className="sortable-header">
                  Date {sortField === 'game_date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Pitchers</th>
                <th>Team</th>
                <th>Opponent</th>
                <th>Home/Away</th>
                <th onClick={() => handleSort('avg_qs_score')} className="sortable-header">
                  Avg QS Score {sortField === 'avg_qs_score' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('qs_likelihood_score')} className="sortable-header">
                  QS Score {sortField === 'qs_likelihood_score' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((player, index) => (
                <tr key={index}>
                  <td>{formatDate(player.game_date)}</td>
                  <td className="player-cell">
                    <div className="player-info-cell">
                      {player.headshot_url && (
                        <img src={player.headshot_url} alt={`${player.name} headshot`} className="player-headshot-small" />
                      )}
                      <div>
                        <div className="player-name">{player.name || 'Unknown Player'}</div>
                        <div className="player-details">
                          {player.mlb_team || 'N/A'} - {formatEligiblePositions(player.eligible_positions) || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{player.team || 'N/A'}</td>
                  <td>{player.opponent || 'N/A'}</td>
                  <td>{player.home ? 'Home' : 'Away'}</td>
                  <td
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.avg_qs_score, 100) }}
                  >
                    {player.avg_qs_score ? Number.parseFloat(player.avg_qs_score).toFixed(1) : 'N/A'}
                  </td>
                  <td
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.qs_likelihood_score, 100) }}
                  >
                    {player.qs_likelihood_score ? Number.parseFloat(player.qs_likelihood_score).toFixed(1) : 'N/A'}
                  </td>
                  <td>{player.accuracy ? `${ucfirst(player.accuracy)}` : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (teamsLoading) return <div className="loading-container">Loading teams...</div>;
  if (error) return <div className="error-container">{error}</div>;

  return (
    <div className="container">
      <div className="header-with-actions">
        <h1>League Teams</h1>
      </div>

      <div className="section">
        <h3>Team Analysis</h3>
        
        <div className="form-container-wide">
          <div className="form-group">
            <label>Select Team:</label>
            <select
              value={selectedTeamId}
              onChange={handleTeamChange}
              className="form-input form-input-select"
            >
              <option value="">Select a team...</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.team_name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Week Start Date (Monday):</label>
            <input
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              className="form-input form-input-date"
            />
          </div>

          <div className="form-group">
            <label>Collected Data Span (Days):</label>
            <select
              value={spanDays}
              onChange={handleSpanDaysChange}
              className="form-input form-input-select"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="value-model-select">Value model (Scoring Value tab):</label>
            <select
              id="value-model-select"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
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
            <button 
              onClick={handleSyncRoster}
              disabled={syncing || !selectedTeamId}
              className={`btn btn-large ${syncing || !selectedTeamId ? 'btn-secondary' : 'btn-success'}`}
            >
              {syncing ? 'Syncing...' : 'Sync Selected Roster'}
            </button>
          </div>

          <div className="form-group">
            <button 
              onClick={handleSyncAllRosters}
              disabled={syncing}
              className={`btn btn-large ${syncing ? 'btn-secondary' : 'btn-success'}`}
            >
              {syncing ? 'Syncing...' : 'Sync All Rosters'}
            </button>
          </div>

        </div>
      </div>

      {selectedTeamId && (
        <div className="tabs-container">
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'summary' ? 'active' : ''}`}
              onClick={() => handleTabChange('summary')}
            >
              Summary
            </button>
            <button
              className={`tab ${activeTab === 'scoring-value' ? 'active' : ''}`}
              onClick={() => handleTabChange('scoring-value')}
            >
              Scoring Value
            </button>
            <button
              className={`tab ${activeTab === 'schedule-strength' ? 'active' : ''}`}
              onClick={() => handleTabChange('schedule-strength')}
            >
              Schedule Strength
            </button>
            <button
              className={`tab ${activeTab === 'probable-pitchers' ? 'active' : ''}`}
              onClick={() => handleTabChange('probable-pitchers')}
            >
              Probable Pitchers
            </button>
          </div>

          <div className="tab-content">
            {loading ? (
              <div className="loading-container">Loading data...</div>
            ) : (
              <>
                {activeTab === 'summary' && (
                  <div className="stats-container">
                    {renderBattersTable(batters, 'Batters')}
                    {renderPitchersTable(pitchers, 'Pitchers')}
                  </div>
                )}

                {activeTab === 'scoring-value' && (
                  <div className="stats-container">
                    {renderScoringValueBattersTable(battingValueStats)}
                    {renderScoringValuePitchersTable(pitchingValueStats)}
                    {renderScoringCategoryChart(teamScoringStats)}
                    {renderPositionValueChart(teamPositionStats)}
                  </div>
                )}

                {activeTab === 'schedule-strength' && (
                  <div className="stats-container">
                    {renderBatterScheduleStrengthTable(batters)}
                    {renderPitcherScheduleStrengthTable(pitchers)}
                  </div>
                )}

                {activeTab === 'probable-pitchers' && (
                  <div className="stats-container">
                    {renderTwoStartPitchersTable(twoStartPitchers)}
                    {renderProbablePitchersTable(probablePitchers)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="text-center mt-20">
        <button 
          onClick={() => window.location.href = '/'}
          className="btn btn-secondary"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

export default LeagueTeams; 