import React, { useState, useEffect } from 'react';
import api, { handleApiResponse, handleApiError } from '../utils/api';

function Settings() {
  const [contexts, setContexts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingKey, setEditingKey] = useState(null);

  useEffect(() => {
    fetchContexts();
  }, []);

  const fetchContexts = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/ai/context');
      const data = handleApiResponse(response);
      setContexts(data.contexts || []);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (key, content) => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      
      await api.post('/ai/context', { key, content });
      
      setSuccess(`Context "${key}" updated successfully!`);
      setEditingKey(null);
      
      // Refresh the contexts to show updated data
      await fetchContexts();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (key) => {
    setEditingKey(key);
    setError('');
    setSuccess('');
  };

  const handleCancel = () => {
    setEditingKey(null);
    setError('');
    setSuccess('');
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-text">Loading settings...</div>
        <div className="spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        {error}
        <button 
          onClick={fetchContexts}
          className="btn btn-primary"
          style={{ marginLeft: '10px' }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="container-wide">
      <div className="nav-back">
        <button
          onClick={() => window.location.href = '/'}
          className="btn btn-primary nav-back-btn"
        >
          ← Back to Homepage
        </button>
      </div>
      <h1>AI Context Settings</h1>
      
      {success && (
        <div className="alert alert-success">
          {success}
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      <div className="section">
        <h3>About AI Context</h3>
        <p>
          These settings control the AI prompts used for fantasy baseball analysis. 
          Each context defines how the AI should approach different types of recommendations.
        </p>
      </div>

      <div style={{ display: 'grid', gap: '20px' }}>
        {contexts.map((context) => (
          <div 
            key={context.key_name}
            className="section-white"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 className="section-title">
                {context.key_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </h3>
              {editingKey !== context.key_name && (
                <button 
                  onClick={() => handleEdit(context.key_name)}
                  className="btn btn-primary"
                >
                  Edit
                </button>
              )}
            </div>

            {editingKey === context.key_name ? (
              <ContextEditForm 
                context={context}
                onSave={handleSubmit}
                onCancel={handleCancel}
                saving={saving}
              />
            ) : (
              <div className="context-display">
                {context.content}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ContextEditForm({ context, onSave, onCancel, saving }) {
  const [content, setContent] = useState(context.content);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(context.key_name, content);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="context-edit-form">
        <label>
          Content:
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="form-textarea"
          placeholder="Enter AI context content..."
        />
      </div>
      
      <div className="form-actions">
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
          ) : 'Save Changes'}
        </button>
        
        <button 
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn btn-secondary btn-large"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default Settings; 