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
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <div style={{ fontSize: '18px', marginBottom: '20px' }}>Loading settings...</div>
        <div style={{ 
          display: 'inline-block',
          width: '40px',
          height: '40px',
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #3498db',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: 'red', textAlign: 'center', padding: '20px' }}>
        {error}
        <button 
          onClick={fetchContexts}
          style={{ 
            marginLeft: '10px',
            padding: '5px 10px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={() => window.location.href = '/'}
          style={{
            padding: '8px 16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            marginBottom: '10px'
          }}
        >
          ← Back to Homepage
        </button>
      </div>
      <h1>AI Context Settings</h1>
      
      {success && (
        <div style={{ 
          backgroundColor: '#d4edda', 
          color: '#155724', 
          padding: '15px', 
          borderRadius: '4px', 
          marginBottom: '20px',
          border: '1px solid #c3e6cb'
        }}>
          {success}
        </div>
      )}

      {error && (
        <div style={{ 
          backgroundColor: '#f8d7da', 
          color: '#721c24', 
          padding: '15px', 
          borderRadius: '4px', 
          marginBottom: '20px',
          border: '1px solid #f5c6cb'
        }}>
          {error}
        </div>
      )}

      <div style={{ 
        backgroundColor: '#f8f9fa', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '20px' 
      }}>
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
            style={{ 
              backgroundColor: 'white', 
              padding: '20px', 
              borderRadius: '8px', 
              border: '1px solid #dee2e6',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, color: '#495057' }}>
                {context.key_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </h3>
              {editingKey !== context.key_name && (
                <button 
                  onClick={() => handleEdit(context.key_name)}
                  style={{ 
                    padding: '8px 16px', 
                    backgroundColor: '#007bff', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
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
              <div style={{ 
                backgroundColor: '#f8f9fa', 
                padding: '15px', 
                borderRadius: '4px',
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                fontSize: '14px',
                lineHeight: '1.5',
                maxHeight: '300px',
                overflow: 'auto'
              }}>
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
      <div style={{ marginBottom: '15px' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '5px', 
          fontWeight: 'bold',
          color: '#495057'
        }}>
          Content:
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{
            width: '100%',
            minHeight: '200px',
            padding: '10px',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '14px',
            lineHeight: '1.5',
            resize: 'vertical'
          }}
          placeholder="Enter AI context content..."
        />
      </div>
      
      <div style={{ display: 'flex', gap: '10px' }}>
        <button 
          type="submit"
          disabled={saving}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: saving ? '#6c757d' : '#28a745', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: saving ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? (
            <span>
              <span style={{ 
                display: 'inline-block',
                width: '16px',
                height: '16px',
                border: '2px solid #ffffff',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginRight: '8px'
              }}></span>
              Saving...
            </span>
          ) : 'Save Changes'}
        </button>
        
        <button 
          type="button"
          onClick={onCancel}
          disabled={saving}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#6c757d', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: saving ? 'not-allowed' : 'pointer'
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default Settings; 