import React, { useEffect } from 'react';
import { CandidateIssue, NoDeadEndRecoveryPayload } from '../types/triage';

interface IssueSelectionProps {
  candidates: CandidateIssue[];
  initialQuery: string;
  onSelectCandidate: (issueTypeId: string) => void;
  recoveryPayload?: NoDeadEndRecoveryPayload;
  isLoading?: boolean;
}

export const IssueSelection: React.FC<IssueSelectionProps> = ({
  candidates,
  initialQuery,
  onSelectCandidate,
  recoveryPayload,
  isLoading
}) => {
  // Keyboard navigation for picking candidate (Keys 1-9)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLoading) return;
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= candidates.length) {
        onSelectCandidate(candidates[num - 1].issueTypeId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [candidates, isLoading, onSelectCandidate]);

  return (
    <div className="issue-selection-container">
      <div className="header">
        <span className="subtitle" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--accent-light)' }}>
          Step 2: Issue Disambiguation
        </span>
        <h3 style={{ fontSize: '1.5rem', marginTop: '0.25rem', marginBottom: '0.5rem' }}>
          Select matching problem definition
        </h3>
        <p className="subtitle">
          Based on your input: <em>"{initialQuery}"</em>
        </p>
      </div>

      {recoveryPayload && (
        <div className="recovery-banner">
          <h4>
            <span>💡</span> {recoveryPayload.userMessage}
          </h4>
          <p>Please select the closest issue candidate below, or choose "Something else" to route your request.</p>
        </div>
      )}

      <div className="candidate-list">
        {candidates.map((candidate, idx) => (
          <div 
            key={candidate.issueTypeId} 
            className="candidate-card"
            onClick={() => !isLoading && onSelectCandidate(candidate.issueTypeId)}
          >
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <kbd>{idx + 1}</kbd>
                <h4>{candidate.issueTypeName}</h4>
              </div>
              <span className="category-badge">{candidate.category}</span>
            </div>
            <p className="match-reason">{candidate.matchReason}</p>
            <div className="card-footer">
              <span className="confidence-meter">
                Likelihood Match: <strong>{candidate.confidence}%</strong>
              </span>
              <button className="chip" style={{ background: 'var(--bg-card-hover)', color: 'var(--text-primary)' }} disabled={isLoading}>
                Select Candidate →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

