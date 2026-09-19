import React, { useState, useEffect } from 'react';
import { IncidentCategory } from '../types/triage';

interface UniversalInputProps {
  onSubmitQuery: (query: string) => void;
  onSelectCategory?: (category: IncidentCategory) => void;
  isLoading?: boolean;
  precedingCausalAction?: string;
}

export const UniversalInput: React.FC<UniversalInputProps> = ({ 
  onSubmitQuery, 
  onSelectCategory,
  isLoading,
  precedingCausalAction 
}) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (query.trim() && !isLoading) {
      onSubmitQuery(query.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const sampleQueries = [
    'Can\'t login to my account, password locked',
    'VPN gateway timeout on GlobalProtect',
    'Blue screen crash on boot',
    'Clicked a suspicious phishing email link',
    'Outlook crashes when opening attachments'
  ];

  const categories: { category: IncidentCategory; label: string; desc: string }[] = [
    { category: 'NETWORK', label: 'Network & VPN', desc: 'Wi-Fi, VPN disconnects, internet speed' },
    { category: 'ACCOUNT', label: 'Account & Password', desc: 'Password reset, lockout, MFA, SSO' },
    { category: 'APPLICATION', label: 'Apps & Email', desc: 'Outlook, Teams, app crashes, licenses' },
    { category: 'DEVICE', label: 'Hardware & OS', desc: 'BSOD, battery drain, monitor dock' },
    { category: 'OTHER', label: 'General / Other', desc: 'Peripherals, unlisted tech requests' }
  ];

  return (
    <div className="universal-input-container">
      <h2>Describe your IT Issue or Symptom</h2>
      <p className="subtitle">
        Enter any problem description. The AI-powered engine will guide you through a one-question-at-a-time triage.
      </p>

      {precedingCausalAction && (
        <div className="memory-context-banner">
          <div className="info">
            <span className="badge">Context Memory</span>
            <span>Preceding troubleshooting action detected: <strong>{precedingCausalAction}</strong></span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="input-form">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. My laptop displays a blue screen with CRITICAL_PROCESS_DIED whenever I plug in the USB-C dock..."
          rows={3}
          disabled={isLoading}
          autoFocus
        />
        <div className="form-actions">
          <span className="subtitle" style={{ margin: 0 }}>
            Press <kbd>Enter</kbd> to submit
          </span>
          <button type="submit" className="submit-btn" disabled={!query.trim() || isLoading}>
            {isLoading ? 'Analyzing Symptom...' : 'Start Triage →'}
          </button>
        </div>
      </form>

      <div className="sample-queries">
        <span>Quick Example Symptoms:</span>
        <div className="chips">
          {sampleQueries.map((sample, idx) => (
            <button key={idx} type="button" className="chip" onClick={() => setQuery(sample)}>
              {sample}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <span className="subtitle" style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600 }}>
          Or choose a primary category directly:
        </span>
        <div className="broader-categories-grid">
          {categories.map((cat) => (
            <div 
              key={cat.category}
              className="category-choice-card"
              onClick={() => onSelectCategory && onSelectCategory(cat.category)}
            >
              <h5>{cat.label}</h5>
              <p>{cat.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

