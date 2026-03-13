import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { handleApiResponse, handleApiError } from '../utils/api';

function DraftForm() {
  const { draftId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(draftId);

  const [name, setName] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEdit) {
      fetchDraft();
    }
  }, [draftId, isEdit]);

  const fetchDraft = async () => {
    try {
      setError('');
      const response = await api.get(`/draft/settings/draft/${draftId}`);
      const data = handleApiResponse(response);
      setName(data?.name ?? '');
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const body = isEdit ? { id: parseInt(draftId, 10), name: name.trim() } : { name: name.trim() };
      await api.post('/draft/settings/draft', body);
      navigate('/drafts');
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <p className="loading-text">Loading draft...</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: '500px' }}>
      <h1>{isEdit ? 'Edit Draft' : 'New Draft'}</h1>
      <Link to="/drafts" className="nav-back-btn btn btn-secondary" style={{ display: 'inline-block', marginBottom: 20 }}>
        ← Back to Drafts
      </Link>

      {error && (
        <div className="form-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-container">
        <div className="form-group">
          <label htmlFor="draft-name">Name</label>
          <input
            id="draft-name"
            type="text"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 2025 Main Draft"
            autoFocus={!isEdit}
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save' : 'Create Draft')}
          </button>
          <Link to="/drafts" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

export default DraftForm;
