import React, { useState, useEffect } from 'react';
import api, { handleApiResponse, handleApiError } from '../utils/api';
import { POSITIONS, CATEGORY_CODES, defaultCountsTowardsRemainingRoster } from '../utils/leagueConstants';

const DEFAULT_BUDGET_TOTAL = 260;
const DEFAULT_HITTER_PCT = 65;
const DEFAULT_PITCHER_PCT = 35;

function LeagueSettings() {
  const [leagueId, setLeagueId] = useState(null);
  const [budgetTotal, setBudgetTotal] = useState(DEFAULT_BUDGET_TOTAL);
  const [hitterBudgetPct, setHitterBudgetPct] = useState(DEFAULT_HITTER_PCT);
  const [pitcherBudgetPct, setPitcherBudgetPct] = useState(DEFAULT_PITCHER_PCT);
  const [rosterSlots, setRosterSlots] = useState([
    { position: 'C', count: 1, countsTowardsRemainingRoster: true },
  ]);
  const [scoringCategories, setScoringCategories] = useState(() =>
    CATEGORY_CODES.reduce((acc, code) => ({ ...acc, [code]: false }), {})
  );
  const [scoringWeights, setScoringWeights] = useState(() =>
    CATEGORY_CODES.reduce((acc, code) => ({ ...acc, [code]: 1 }), {})
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/league/settings');
      const data = handleApiResponse(response);
      if (data) {
        setLeagueId(data.id);
        setBudgetTotal(data.budget_total ?? DEFAULT_BUDGET_TOTAL);
        setHitterBudgetPct(data.hitter_budget_pct ?? DEFAULT_HITTER_PCT);
        setPitcherBudgetPct(data.pitcher_budget_pct ?? DEFAULT_PITCHER_PCT);
        if (data.roster_slots && data.roster_slots.length > 0) {
          setRosterSlots(
            data.roster_slots.map((slot) => ({
              position: slot.slot_code,
              count: slot.slot_count,
              countsTowardsRemainingRoster: slot.counts_toward_remaining_roster ?? defaultCountsTowardsRemainingRoster(slot.slot_code),
            }))
          );
        }
        if (data.scoring_categories && data.scoring_categories.length > 0) {
          const enabled = {};
          const weights = {};
          data.scoring_categories.forEach((cat) => {
            const code = cat.category_code;
            enabled[code] = cat.is_enabled !== false;
            weights[code] = cat.weight ?? 1;
          });
          CATEGORY_CODES.forEach((code) => {
            if (enabled[code] === undefined) enabled[code] = false;
            if (weights[code] === undefined) weights[code] = 1;
          });
          setScoringCategories(enabled);
          setScoringWeights(weights);
        }
      }
    } catch (err) {
      const msg = handleApiError(err);
      setError(msg);
      setLeagueId(null);
      setBudgetTotal(DEFAULT_BUDGET_TOTAL);
      setHitterBudgetPct(DEFAULT_HITTER_PCT);
      setPitcherBudgetPct(DEFAULT_PITCHER_PCT);
      setRosterSlots([{ position: 'C', count: 1, countsTowardsRemainingRoster: true }]);
      setScoringCategories(CATEGORY_CODES.reduce((acc, code) => ({ ...acc, [code]: false }), {}));
      setScoringWeights(CATEGORY_CODES.reduce((acc, code) => ({ ...acc, [code]: 1 }), {}));
    } finally {
      setLoading(false);
    }
  };

  const addRosterSlot = () => {
    setRosterSlots((prev) => [
      ...prev,
      { position: 'C', count: 1, countsTowardsRemainingRoster: true },
    ]);
  };

  const updateRosterSlot = (index, field, value) => {
    setRosterSlots((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'position') {
        next[index].countsTowardsRemainingRoster = defaultCountsTowardsRemainingRoster(value);
      }
      return next;
    });
  };

  const removeRosterSlot = (index) => {
    if (rosterSlots.length <= 1) return;
    setRosterSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const setCategoryEnabled = (code, enabled) => {
    setScoringCategories((prev) => ({ ...prev, [code]: enabled }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      setSaving(true);
      const payload = {
        id: leagueId,
        budgetTotal: Number(budgetTotal) || DEFAULT_BUDGET_TOTAL,
        hitterBudgetPct: Number(hitterBudgetPct) ?? DEFAULT_HITTER_PCT,
        pitcherBudgetPct: Number(pitcherBudgetPct) ?? DEFAULT_PITCHER_PCT,
        rosterSlots: rosterSlots.map((slot) => ({
          position: slot.position,
          count: Number(slot.count) || 1,
          countsTowardsRemainingRoster: Boolean(slot.countsTowardsRemainingRoster),
        })),
        scoringCategories: CATEGORY_CODES.filter((code) => scoringCategories[code]).map((code) => ({
          code,
          weight: Number(scoringWeights[code]) || 1,
          isEnabled: true,
        })),
      };
      await api.post('/league/upsert', payload);
      setSuccess('League settings saved successfully.');
      const response = await api.get('/league/settings');
      const data = handleApiResponse(response);
      if (data?.id) setLeagueId(data.id);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleHardReset = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to hard reset all teams in this league? This will refresh roster data for every team and cannot be undone.'
    );
    if (!confirmed) return;
    setError('');
    setSuccess('');
    try {
      setResetting(true);
      const response = await api.post('/league/reset');
      const message = response?.data?.message || 'All teams have been reset successfully.';
      setSuccess(message);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-text">Loading league settings...</div>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="container-wide">
      <div className="nav-back">
        <button
          onClick={() => (window.location.href = '/')}
          className="btn btn-primary nav-back-btn"
        >
          ← Back to Homepage
        </button>
      </div>
      <h1>League Settings</h1>

      {success && <div className="alert alert-success">{success}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        {leagueId != null && <input type="hidden" name="id" value={leagueId} />}

        <div className="section-white mb-20">
          <h3 className="section-title">Budget</h3>
          <div className="form-container-wide" style={{ marginBottom: 0 }}>
            <div className="form-group">
              <label htmlFor="budgetTotal">Total budget</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>$</span>
                <input
                  id="budgetTotal"
                  type="number"
                  min="1"
                  className="form-input"
                  value={budgetTotal}
                  onChange={(e) => setBudgetTotal(e.target.value)}
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="hitterBudgetPct">Hitter budget %</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  id="hitterBudgetPct"
                  type="number"
                  min="0"
                  max="100"
                  className="form-input"
                  value={hitterBudgetPct}
                  onChange={(e) => setHitterBudgetPct(e.target.value)}
                />
                <span>%</span>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="pitcherBudgetPct">Pitcher budget %</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  id="pitcherBudgetPct"
                  type="number"
                  min="0"
                  max="100"
                  className="form-input"
                  value={pitcherBudgetPct}
                  onChange={(e) => setPitcherBudgetPct(e.target.value)}
                />
                <span>%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="section-white mb-20">
          <h3 className="section-title">Roster slots</h3>
          <p className="section-subtitle" style={{ marginBottom: '15px' }}>
            Define each position and how many players you can roster.
          </p>
          {rosterSlots.map((slot, index) => (
            <div
              key={index}
              className="form-container-wide"
              style={{ marginBottom: '12px' }}
            >
              <div className="form-group">
                <label>Position</label>
                <select
                  className="form-input form-input-select"
                  value={slot.position}
                  onChange={(e) => updateRosterSlot(index, 'position', e.target.value)}
                >
                  {POSITIONS.map((pos) => (
                    <option key={pos} value={pos}>
                      {pos}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Count</label>
                <input
                  type="number"
                  min="1"
                  className="form-input"
                  value={slot.count}
                  onChange={(e) => updateRosterSlot(index, 'count', parseInt(e.target.value, 10) || 1)}
                />
              </div>
              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', paddingTop: '22px' }}>
                <input
                  type="checkbox"
                  id={`counts-${index}`}
                  checked={slot.countsTowardsRemainingRoster}
                  onChange={(e) => updateRosterSlot(index, 'countsTowardsRemainingRoster', e.target.checked)}
                />
                <label htmlFor={`counts-${index}`} style={{ marginBottom: 0, marginLeft: '8px', fontWeight: 'normal' }}>
                  Counts toward remaining roster
                </label>
              </div>
              {rosterSlots.length > 1 && (
                <div className="form-group" style={{ paddingTop: '22px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => removeRosterSlot(index)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-primary" onClick={addRosterSlot}>
            Add roster slot
          </button>
        </div>

        <div className="section-white mb-20">
          <h3 className="section-title">Scoring categories</h3>
          <p className="section-subtitle" style={{ marginBottom: '15px' }}>
            Select which categories your league uses.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 24px' }}>
            {CATEGORY_CODES.map((code) => (
              <label key={code} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={scoringCategories[code] || false}
                  onChange={(e) => setCategoryEnabled(code, e.target.checked)}
                />
                <span>{code}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-actions" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            type="submit"
            disabled={saving}
            className={`btn btn-large ${saving ? 'btn-secondary' : 'btn-success'}`}
          >
            {saving ? (
              <span>
                <span className="spinner spinner-small" style={{ marginRight: '8px' }}></span>
                Saving...
              </span>
            ) : (
              'Save league settings'
            )}
          </button>
          <button
            type="button"
            disabled={resetting}
            className="btn btn-large"
            style={{
              backgroundColor: '#c53030',
              color: 'white',
              border: 'none',
            }}
            onClick={handleHardReset}
          >
            {resetting ? (
              <span>
                <span className="spinner spinner-small" style={{ marginRight: '8px' }}></span>
                Resetting...
              </span>
            ) : (
              'Hard reset all teams'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default LeagueSettings;
