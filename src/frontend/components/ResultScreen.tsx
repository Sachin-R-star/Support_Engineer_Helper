import React, { useState, useEffect } from 'react';
import { FinalTriageResult } from '../types/triage';
import { VerificationLoopPanel, AttemptedAction } from './VerificationLoopPanel';
import { RcaPanel } from './RcaPanel';

interface ResultScreenProps {
  result: FinalTriageResult;
  onReset: () => void;
  onEscalate?: () => void;
  onStartNewTriage?: (query?: string) => void;
}

function formatCategory(category: string): string {
  if (!category) return 'Other';
  const primary = category.split('/')[0].trim();
  const validCategories = ['Network', 'Account', 'Application', 'Device', 'Other'];
  const matched = validCategories.find(c => c.toLowerCase() === primary.toLowerCase());
  return matched || primary;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({ result, onReset, onEscalate, onStartNewTriage }) => {
  const priorityStr = (result.priority || 'P3_MEDIUM').toString();
  
  const rec = result.recommendation;
  const recovery = result.recoveryPayload;

  const [currentAction, setCurrentAction] = useState<string>(rec ? rec.action : result.recommendedNextStep);
  const [fallbackAction, setFallbackAction] = useState<string | undefined>(rec?.fallback_action);
  const [confidence, setConfidence] = useState<number>(result.confidence);
  const [attemptedActions, setAttemptedActions] = useState<AttemptedAction[]>([]);
  const [isResolved, setIsResolved] = useState<boolean>(false);
  const [followUpTicket, setFollowUpTicket] = useState<{ id: string; ticketNumber: string; summary: string } | null>(null);

  const [isTechExpanded, setIsTechExpanded] = useState<boolean>(false);

  // Automatically scroll to the top of the page when the solution screen mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleActionVerified = (res: any) => {
    if (res.attemptedActionsHistory) {
      setAttemptedActions(res.attemptedActionsHistory);
    } else {
      setAttemptedActions(prev => [
        ...prev,
        {
          id: `act_${Date.now()}`,
          actionDescription: res.actionDescription,
          resultStatus: res.resultStatus,
          userNotes: res.userNotes,
          timestamp: new Date().toISOString()
        }
      ]);
    }

    if (res.followUpIncident) {
      setFollowUpTicket(res.followUpIncident);
    }

    if (res.isResolved) {
      setIsResolved(true);
    } else {
      if (res.nextRecommendedAction) {
        setCurrentAction(res.nextRecommendedAction);
      }
      if (res.nextFallbackAction) {
        setFallbackAction(res.nextFallbackAction);
      }
      if (typeof res.updatedConfidence === 'number') {
        setConfidence(res.updatedConfidence);
      }
    }
  };

  return (
    <div className="result-screen-container">
      <div className="result-header">
        <div className="badge-group">
          <span className={`priority-badge ${priorityStr}`}>
            Priority: {priorityStr.replace('_', ' ')}
          </span>
          <span className="category-badge">{formatCategory(result.category)}</span>
          {isResolved && <span className="status-badge status-resolved font-bold">RESOLVED</span>}
          {rec?.escalation?.recommended && !isResolved && (
            <span className="priority-badge CRITICAL">
              Escalation Recommended ({rec.escalation.tier})
            </span>
          )}
        </div>

        <h2>{result.issueType}</h2>
        <div className="confidence-indicator">
          <span>Diagnostic Confidence: <strong>{confidence}%</strong></span>
        </div>
      </div>

      {recovery && recovery.isRecoveryActive && (
        <div className="recovery-banner">
          <h4>Uncertainty Guidance</h4>
          <p>{recovery.userMessage}</p>
        </div>
      )}

      {/* Prominent Required Information & Missing Diagnostic Attributes Card */}
      {result.missingInformation && result.missingInformation.length > 0 && (
        <div className="section-card" style={{ borderColor: 'rgba(99, 102, 241, 0.4)', background: 'rgba(99, 102, 241, 0.06)', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h4 style={{ color: '#818cf8', margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>📋</span> Required Parameters for AI & Support Engineer Resolution
            </h4>
            <span style={{ fontSize: '0.75rem', background: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc', padding: '2px 8px', borderRadius: '4px' }}>
              {result.missingInformation.length} Attribute{result.missingInformation.length !== 1 ? 's' : ''} Required
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem', marginBottom: '0.75rem' }}>
            The following specific diagnostic information is needed by AI models and Tier 2 Support Engineers to complete root cause isolation:
          </p>
          <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-primary)', fontSize: '0.875rem' }}>
            {result.missingInformation.map((item, idx) => (
              <li key={idx} style={{ marginBottom: '0.35rem' }}>
                <strong>{item}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="result-body">
        {/* Troubleshooting Verification Loop Panel */}
        <VerificationLoopPanel
          incidentId={result.incidentId || result.linkedIncidents?.[0]?.incidentId || 'sess_active'}
          currentAction={currentAction}
          fallbackAction={fallbackAction}
          reason={rec?.reason}
          expectedResult={rec?.expected_result}
          attemptedActions={attemptedActions}
          onActionVerified={handleActionVerified}
          isResolved={isResolved}
          followUpTicket={followUpTicket}
          onStartNewTriage={onStartNewTriage}
        />

        {/* Collapsible Engineer Technical Diagnostics Boundary */}
        <div className="tech-diagnostics-wrapper" style={{ marginTop: '1.5rem' }}>
          <button
            type="button"
            className="toggle-tech-btn"
            onClick={() => setIsTechExpanded(!isTechExpanded)}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>{isTechExpanded ? 'Hide Technical Diagnostics & RCA' : 'Technical Diagnostics & RCA (For Engineers)'}</span>
          </button>

          {isTechExpanded && (
            <div className="expanded-tech-content" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* System Reasoning Section */}
              <div className="section-card">
                <h4>System Diagnostic Reasoning</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{result.reasoning}</p>
              </div>

              {/* Missing Information Section */}
              {result.missingInformation && result.missingInformation.length > 0 && (
                <div className="section-card" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                  <h4 style={{ color: 'var(--p2-orange)' }}>Missing Information & Unconfirmed Attributes</h4>
                  <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    {result.missingInformation.map((item, idx) => (
                      <li key={idx} style={{ marginBottom: '0.25rem' }}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Linked Incidents & Graph Linkage */}
              {result.linkedIncidents && result.linkedIncidents.length > 0 && (
                <div className="section-card">
                  <h4>Related Historical Incidents & Graph Links</h4>
                  <div className="linked-list">
                    {result.linkedIncidents.map((link, idx) => (
                      <div key={idx} className="linked-item">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span className="ticket-num">{link.ticketNumber}</span>
                          <span className="category-badge">{link.relationshipType}</span>
                        </div>
                        <span className="confidence-meter">Similarity Match: <strong>{Math.round(link.similarityScore * 100)}%</strong></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Explainable Root Cause Analysis (RCA) Section */}
              {result.linkedIncidents && result.linkedIncidents[0]?.incidentId && (
                <RcaPanel incidentId={result.linkedIncidents[0].incidentId} />
              )}
            </div>
          )}
        </div>
      </div>

      <div className="result-footer">
        <button onClick={onReset} className="reset-button">
          Start New Triage Session
        </button>

        {onEscalate && (
          <button onClick={onEscalate} className="escalate-button">
            Escalate to Human IT Agent
          </button>
        )}
      </div>
    </div>
  );
};


