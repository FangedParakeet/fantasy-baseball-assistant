import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { handleApiResponse, handleApiError } from '../utils/api';

function Drafts() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState([]);
  const [activeDraftId, setActiveDraftId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startingId, setStartingId] = useState(null);
  const [confirmStart, setConfirmStart] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    fetchDrafts();
    fetchActiveDraft();
  }, []);

  const fetchDrafts = async () => {
    try {
      setError('');
      const response = await api.get('/draft/settings/drafts');
      const data = handleApiResponse(response);
      setDrafts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(handleApiError(err));
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveDraft = async () => {
    try {
      const response = await api.get('/draft/settings/active');
      const data = handleApiResponse(response);
      setActiveDraftId(data?.id ?? null);
    } catch {
      setActiveDraftId(null);
    }
  };

  const refresh = () => {
    fetchDrafts();
    fetchActiveDraft();
  };

  const handleStartDraft = (draft) => {
    if (draft.isActive) return;
    if (activeDraftId != null) {
      setConfirmStart(draft);
      return;
    }
    doStartDraft(draft.id);
  };

  const doStartDraft = async (draftId) => {
    try {
      setStartingId(draftId);
      setError('');
      setConfirmStart(null);
      await api.post(`/draft/settings/active/${draftId}`);
      refresh();
      navigate(`/drafts/${draftId}/live`);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setStartingId(null);
    }
  };

  const handleConfirmStart = () => {
    if (confirmStart) doStartDraft(confirmStart.id);
  };

  const handleCancelConfirm = () => {
    setConfirmStart(null);
  };

  const handleDeleteDraft = (draft) => {
    if (!window.confirm(`Delete draft "${draft.name}"? This cannot be undone.`)) return;
    doDeleteDraft(draft.id);
  };

  const doDeleteDraft = async (draftId) => {
    try {
      setDeletingId(draftId);
      setError('');
      await api.delete(`/draft/settings/draft/${draftId}`);
      refresh();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="container container-wide">
        <p className="loading-text">Loading drafts...</p>
      </div>
    );
  }

  return (
    <div className="container container-wide">
      <div className="header-with-actions">
        <h1>Drafts</h1>
        <Link to="/drafts/new" className="btn btn-primary">
          New Draft
        </Link>
      </div>

      <Link to="/" className="nav-back-btn btn btn-secondary">← Back to Home</Link>

      {error && (
        <div className="form-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {confirmStart && (
        <div className="section" style={{ marginBottom: 20 }}>
          <p><strong>Another draft is already active.</strong> Starting this draft will deactivate it. Continue?</p>
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button onClick={handleConfirmStart} className="btn btn-primary">
              Yes, start this draft
            </button>
            <button onClick={handleCancelConfirm} className="btn btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="section-white">
        {drafts.length === 0 ? (
          <div className="empty-state">
            <h3>No drafts yet</h3>
            <p>Create a draft to get started.</p>
            <Link to="/drafts/new" className="btn btn-primary" style={{ marginTop: 12 }}>
              New Draft
            </Link>
          </div>
        ) : (
          <div className="stats-table-container">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft) => {
                const isActive = draft.isActive ?? draft.is_active;
                return (
                  <tr key={draft.id}>
                    <td>{draft.name}</td>
                    <td>
                      {isActive ? (
                        <span style={{ color: '#28a745', fontWeight: 600 }}>Active</span>
                      ) : (
                        <span style={{ color: '#6c757d' }}>Inactive</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {isActive ? (
                          <Link
                            to={`/drafts/${draft.id}/live`}
                            className="btn btn-success"
                            style={{ textDecoration: 'none' }}
                          >
                            Live Draft
                          </Link>
                        ) : (
                          <button
                            onClick={() => handleStartDraft(draft)}
                            className="btn btn-success"
                            disabled={startingId != null}
                          >
                            {startingId === draft.id ? 'Starting…' : 'Start Draft'}
                          </button>
                        )}
                        <Link
                          to={`/drafts/${draft.id}/keepers`}
                          className="btn btn-primary"
                          style={{ textDecoration: 'none' }}
                        >
                          Set Keepers
                        </Link>
                        <Link
                          to={`/drafts/${draft.id}/edit`}
                          className="btn btn-secondary"
                          style={{ textDecoration: 'none' }}
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ color: '#c00', borderColor: '#c00' }}
                          onClick={() => handleDeleteDraft(draft)}
                          disabled={deletingId != null}
                        >
                          {deletingId === draft.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Drafts;
