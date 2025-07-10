import React, { useState } from 'react';
import api, { handleApiResponse, handleApiError } from '../utils/api';

function TwoStartPitchers() {
  const [selectedDate, setSelectedDate] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState('');

  // Helper to format AI response with bold tags
  function formatAIResponse(text) {
    if (!text) return '';
    return text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  }

  const handleDateChange = (event) => {
    setSelectedDate(event.target.value);
    setValidationError('');
  };

  const handleAnalyze = async () => {
    if (!selectedDate) {
      setValidationError('Please select a week start date.');
      return;
    }
    try {
      setAnalysing(true);
      setError('');
      setValidationError('');
      setAnalysis('');
      const response = await api.post('/ai/two-start-pitchers', { weekStart: selectedDate });
      const data = handleApiResponse(response);
      setAnalysis(data.result);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setAnalysing(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h1 style={{ marginBottom: '10px' }}>Two-Start Pitchers</h1>
        <h3 style={{ marginTop: 0, color: '#495057', fontWeight: 400 }}>Weekly Two-Start Pitcher Analysis</h3>
        {validationError && (
          <div style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '10px', borderRadius: '4px', marginBottom: '15px', border: '1px solid #f5c6cb' }}>{validationError}</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 180px) auto', gap: '24px', alignItems: 'end', maxWidth: 400 }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Week Start Date (Monday):</label>
            <input
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              style={{
                padding: '8px 12px',
                fontSize: '16px',
                borderRadius: '4px',
                border: '1px solid #ced4da',
                width: '100%',
                maxWidth: '180px',
                minWidth: '140px',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'end', height: '100%' }}>
            <button
              onClick={handleAnalyze}
              disabled={analysing || !selectedDate}
              style={{
                padding: '10px 20px',
                backgroundColor: analysing || !selectedDate ? '#6c757d' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: analysing || !selectedDate ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                width: '100%',
                minWidth: '120px',
                boxSizing: 'border-box',
              }}
            >
              {analysing ? 'Analysing...' : 'Analyse'}
            </button>
          </div>
        </div>
      </div>
      {error && (
        <div style={{ color: 'red', textAlign: 'center', padding: '20px' }}>{error}</div>
      )}
      {analysis && (
        <div style={{
          marginTop: '15px',
          padding: '15px',
          backgroundColor: 'white',
          borderRadius: '6px',
          border: '1px solid #dee2e6',
        }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#495057' }}>AI Analysis</h4>
          <div
            style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '14px' }}
            dangerouslySetInnerHTML={{ __html: formatAIResponse(analysis) }}
          />
        </div>
      )}
      <div style={{ marginTop: '30px', textAlign: 'center' }}>
        <button
          onClick={() => window.location.href = '/'}
          style={{
            padding: '8px 16px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

export default TwoStartPitchers; 