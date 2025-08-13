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
    <div className="container">
      <div className="section">
        <h1 className="page-title">Two-Start Pitchers</h1>
        <h3 className="section-subtitle">Weekly Two-Start Pitcher Analysis</h3>
        {validationError && (
          <div className="form-error">{validationError}</div>
        )}
        <div className="form-container">
          <div className="form-group">
            <label>Week Start Date (Monday):</label>
            <input
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              className="form-input form-input-date"
            />
          </div>
          <div className="form-actions">
            <button
              onClick={handleAnalyze}
              disabled={analysing || !selectedDate}
              className={`btn btn-large ${analysing || !selectedDate ? 'btn-secondary' : 'btn-primary'}`}
              style={{ width: '100%', minWidth: '120px' }}
            >
              {analysing ? 'Analysing...' : 'Analyse'}
            </button>
          </div>
        </div>
      </div>
      {error && (
        <div className="error-container">{error}</div>
      )}
      {analysis && (
        <div className="analysis-section">
          <h4 className="section-title">AI Analysis</h4>
          <div
            className="analysis-content"
            dangerouslySetInnerHTML={{ __html: formatAIResponse(analysis) }}
          />
        </div>
      )}
      <div className="text-center mt-30">
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

export default TwoStartPitchers; 