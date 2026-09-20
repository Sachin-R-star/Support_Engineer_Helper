import React, { useState } from 'react';
import { FinalTriageResult } from '../types/triage';
import { VerificationLoopPanel, AttemptedAction } from './VerificationLoopPanel';
import { RcaPanel } from './RcaPanel';

interface ResultScreenProps {
  result: FinalTriageResult;
  onReset: () => void;
  onEscalate?: () => void;
}

function formatCategory(category: string): string {
  if (!category) return 'Other';
  const primary = category.split('/')[0].trim();
  const validCategories = ['Network', 'Account', 'Application', 'Device', 'Other'];
  const matched = validCategories.find(c => c.toLowerCase() === primary.toLowerCase());
  return matched || primary;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({ result, onReset, onEscalate }) => {
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
      if (res.followUpIncident) {
        setFollowUpTicket(res.followUpIncident);
      }
    }
  };

  return (
    <div className="result-screen-container">
      <div className="result-header">
        <div className="badge-group">
          <span className={`priority-badge ${priorityStr}`}>
            ⚡ Priority: {priorityStr.replace('_', ' ')}
          </span>
          <span className="category-badge">{formatCategory(result.category)}</span>
          {isResolved && <span className="status-badge status-resolved font-bold">✓ RESOLVED</span>}
          {rec?.escalation?.recommended && !isResolved && (
            <span className="priority-badge CRITICAL">
              🚨 Escalation Recommended ({rec.escalation.tier})
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
          <h4>💡 Uncertainty Guidance</h4>
          <p>{recovery.userMessage}</p>
        </div>
      )}

      {followUpTicket && (
        <div className="section-card warning-card" style={{ borderColor: 'var(--p2-orange)', background: 'rgba(245, 158, 11, 0.05)' }}>
          <h4>⚡ Follow-Up Ticket Generated</h4>
          <p>
            A follow-up incident <strong>{followUpTicket.ticketNumber}</strong> ({followUpTicket.summary}) has been automatically created and linked to this ticket via POSSIBLY_CAUSED_BY relationship.
          </p>
        </div>
      )}

      <div className="result-body">
        {/* Troubleshooting Verification Loop Panel */}
        <VerificationLoopPanel
          incidentId={result.linkedIncidents?.[0]?.incidentId || 'sess_active'}
          currentAction={currentAction}
          fallbackAction={fallbackAction}
          reason={rec?.reason}
          expectedResult={rec?.expected_result}
          attemptedActions={attemptedActions}
          onActionVerified={handleActionVerified}
          isResolved={isResolved}
        />

        {/* Collapsible Engineer Technical Diagnostics Boundary */}
        <div className="tech-diagnostics-wrapper" style={{ marginTop: '1.5rem' }}>
          <button
            type="button"
            className="toggle-tech-btn"
            onClick={() => setIsTechExpanded(!isTechExpanded)}
          >
            <span>{isTechExpanded ? '▼ Hide Technical Diagnostics & RCA' : '► Show Technical Diagnostics & RCA (For Engineers)'}</span>
          </button>

          {isTechExpanded && (
            <div className="expanded-tech-content" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* System Reasoning Section */}
              <div className="section-card">
                <h4>🧠 System Diagnostic Reasoning</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{result.reasoning}</p>
              </div>

              {/* Missing Information Section */}
              {result.missingInformation && result.missingInformation.length > 0 && (
                <div className="section-card" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                  <h4 style={{ color: 'var(--p2-orange)' }}>⚠️ Missing Information & Unconfirmed Attributes</h4>
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
                  <h4>🔗 Related Historical Incidents & Graph Links</h4>
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
          ↻ Start New Triage Session
        </button>

        {onEscalate && (
          <button onClick={onEscalate} className="escalate-button">
            🚨 Escalate to Human IT Agent
          </button>
        )}
      </div>
    </div>
  );
};


