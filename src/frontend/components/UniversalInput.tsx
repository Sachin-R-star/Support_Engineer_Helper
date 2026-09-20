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

  const categories: { category: IncidentCategory; label: string; desc: string; icon: string }[] = [
    { category: 'NETWORK', label: 'Network & VPN', desc: 'Wi-Fi, VPN disconnects, internet speed & gateway issues', icon: '📶' },
    { category: 'ACCOUNT', label: 'Account & Password', desc: 'Password reset, SSO lockout, MFA & identity access', icon: '🔐' },
    { category: 'APPLICATION', label: 'Apps & Software', desc: 'Outlook, Teams, crash logs & software licenses', icon: '💻' },
    { category: 'DEVICE', label: 'Hardware & OS', desc: 'BSOD, battery, docking station & display adapters', icon: '🖥️' },
    { category: 'OTHER', label: 'General IT Request', desc: 'Peripherals, workspace access & unlisted tech support', icon: '🛠️' }
  ];

  return (
    <div className="universal-input-container">
      <div className="hero-header">
        <div className="hero-badge">
          <span className="pulse-dot"></span>
          <span>AI-Guided ITSM Engine</span>
        </div>
        <h2>Describe your IT Issue or Symptom</h2>
        <p className="subtitle">
          Describe what you're experiencing in plain language. Our adaptive triage engine will ask targeted follow-up questions to isolate the root cause.
        </p>
      </div>

      {precedingCausalAction && (
        <div className="memory-context-banner">
          <div className="info">
            <span className="badge">Context Memory</span>
            <span>Preceding troubleshooting action detected: <strong>{precedingCausalAction}</strong></span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="input-form">
        <div className="textarea-wrapper">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Wi-Fi is connected but I cannot access internal portals or internet..."
            rows={3}
            disabled={isLoading}
            autoFocus
          />
        </div>
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
        <span className="sample-title">⚡ Common Support Scenarios:</span>
        <div className="chips">
          {sampleQueries.map((sample, idx) => (
            <button key={idx} type="button" className="chip" onClick={() => setQuery(sample)}>
              <span className="chip-icon">💬</span>
              <span>{sample}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="category-selection-section">
        <span className="category-section-title">
          Or select a primary issue domain:
        </span>
        <div className="broader-categories-grid">
          {categories.map((cat) => (
            <div 
              key={cat.category}
              className="category-choice-card"
              onClick={() => onSelectCategory && onSelectCategory(cat.category)}
            >
              <div className="category-card-header">
                <span className="cat-icon">{cat.icon}</span>
                <h5>{cat.label}</h5>
              </div>
              <p>{cat.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

