import React, { useState, useEffect } from 'react';
import api, { handleApiResponse, handleApiError } from '../utils/api';
import { ucfirst, formatIP, sortPlayers, getPercentileColor, formatDate, formatEligiblePositions } from '../utils/functions';

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


  useEffect(() => {
    fetchTeams();
    // Set default date to current Monday
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);
    setSelectedDate(monday.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    if (selectedTeamId && selectedDate) {
      fetchTeamData();
    }
  }, [selectedTeamId, selectedDate, spanDays, activeTab]);

  const fetchTeams = async () => {
    try {
      setTeamsLoading(true);
      const response = await api.get('/league-teams');
      const data = handleApiResponse(response);
      setTeams(data.teams || []);
      if (data.teams && data.teams.length > 0) {
        setSelectedTeamId(data.teams[0].id);
      }
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setTeamsLoading(false);
    }
  };

  const fetchTeamData = async () => {
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
      }
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
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
                <th onClick={() => handleSort('fantasy_score')} className="sortable-header">
                  Fantasy Score {sortField === 'fantasy_score' && (sortDirection === 'asc' ? '↑' : '↓')}
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
                  <td
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.fantasy_score, player.reliability_score) }}
                  >
                    {player.fantasy_score ? Number.parseFloat(player.fantasy_score).toFixed(2) : 'N/A'}
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
                <th onClick={() => handleSort('fantasy_score')} className="sortable-header">
                  Fantasy Score {sortField === 'fantasy_score' && (sortDirection === 'asc' ? '↑' : '↓')}
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
                    style={{ backgroundColor: getPercentileColor(player.strikeouts_pct, player.reliability_score) }}
                    title={player.strikeouts_pct ? `${player.strikeouts_pct}th %-ile` : 'No data'}
                  >
                    {player.strikeouts || 0}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.era_pct, player.reliability_score) }}
                    title={player.era_pct ? `${player.era_pct}th %-ile` : 'No data'}
                  >
                    {player.era ? Number.parseFloat(player.era).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.whip_pct, player.reliability_score) }}
                    title={player.whip_pct ? `${player.whip_pct}th %-ile` : 'No data'}
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
                  <td
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.fantasy_score, player.reliability_score) }}
                  >
                    {player.fantasy_score ? Number.parseFloat(player.fantasy_score).toFixed(2) : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                <th onClick={() => handleSort('pitcher_week_score')} className="sortable-header">
                  Week Schedule Score {sortField === 'pitcher_week_score' && (sortDirection === 'asc' ? '↑' : '↓')}
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
                    style={{ backgroundColor: getPercentileColor(player.fip_pct, player.reliability_score) }}
                    title={player.fip_pct ? `${player.fip_pct}th %-ile` : 'No data'}
                  >
                    {player.fip_pct ? Number.parseFloat(player.fip_pct).toFixed(2) : 'N/A'}
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
                    style={{ backgroundColor: getPercentileColor(player.bb_per_9_pct, player.reliability_score) }}
                    title={player.bb_per_9_pct ? `${player.bb_per_9_pct}th %-ile` : 'No data'}
                  >
                    {player.bb_per_9_pct ? Number.parseFloat(player.bb_per_9_pct).toFixed(2) : 'N/A'}
                  </td>
                  <td 
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.qs_pct, player.reliability_score) }}
                    title={player.qs_pct ? `${player.qs_pct}th %-ile` : 'No data'}
                  >
                    {player.qs_pct ? Number.parseFloat(player.qs_pct).toFixed(2) : 'N/A'}
                  </td>
                  <td
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.pitcher_week_score, player.reliability_score) }}
                  >
                    {player.pitcher_week_score ? Number.parseFloat(player.pitcher_week_score).toFixed(2) : 'N/A'}
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
                <th onClick={() => handleSort('hitter_week_score')} className="sortable-header">
                  Week Schedule Score {sortField === 'hitter_week_score' && (sortDirection === 'asc' ? '↑' : '↓')}
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
                    style={{ backgroundColor: getPercentileColor(player.k_rate_pct, player.reliability_score) }}
                    title={player.k_rate_pct ? `${player.k_rate_pct}th %-ile` : 'No data'}
                  >
                    {player.k_rate_pct ? Number.parseFloat(player.k_rate_pct).toFixed(2) : 'N/A'}
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
                  <td
                    className="stat-cell"
                    style={{ backgroundColor: getPercentileColor(player.hitter_week_score, player.reliability_score) }}
                  >
                    {player.hitter_week_score ? Number.parseFloat(player.hitter_week_score).toFixed(2) : 'N/A'}
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
            <label>Span Days:</label>
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