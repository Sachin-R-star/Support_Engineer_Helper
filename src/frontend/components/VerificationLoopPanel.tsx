import React, { useState } from 'react';
import { ApiClient } from '../services/apiClient';

export interface AttemptedAction {
  id: string;
  actionDescription: string;
  resultStatus: 'YES_RESOLVED' | 'NO_FAILED' | 'PARTIALLY_RESOLVED' | 'SOMETHING_CHANGED' | 'PENDING';
  userNotes?: string;
  timestamp: string;
}

export function sanitizeReasonText(rawReason?: string): string {
  if (!rawReason) return 'Selected based on your diagnostic symptoms.';
  let text = rawReason;
  text = text.replace(/Matched KB troubleshooting step for .* \([A-Z_]+\/[A-Z_]+\) based on diagnostic evidence\./gi, 
    'Matched from knowledge base based on your reported symptoms.');
  text = text.replace(/\([A-Z_]+\/[A-Z_]+\)/gi, '');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

export function formatActionLabel(actionText: string): { heroTitle: string; icon: string; steps: string[] } {
  if (!actionText) return { heroTitle: 'Review Diagnostic Guidance', icon: '', steps: ['Follow the provided diagnostic guidance.'] };

  let title = actionText;

  // Simplify technical phrasing for non-technical employees without altering underlying semantics:
  title = title
    .replace(/^navigate to /i, 'Open ')
    .replace(/^re-authenticate against the identity provider/i, 'Try signing in again')
    .replace(/^perform /i, 'Run ');

  title = title.charAt(0).toUpperCase() + title.slice(1);

  const steps: string[] = [];
  steps.push(title);
  
  if (/password|sso|login/i.test(actionText)) {
    steps.push('Complete the verification process');
    steps.push('Try signing in again');
  } else if (/dns|network|adapter|wifi/i.test(actionText)) {
    steps.push('Wait 30 seconds for network settings to refresh');
    steps.push('Test connecting to a website or application');
  } else if (/outlook|mail|credential manager/i.test(actionText)) {
    steps.push('Restart the application');
    steps.push('Verify account synchronization');
  } else if (/vpn|gateway/i.test(actionText)) {
    steps.push('Reconnect to the VPN gateway node');
    steps.push('Check connection status');
  } else {
    steps.push('Verify if normal functionality is restored');
  }

  return { heroTitle: title, icon: '', steps };
}

interface VerificationLoopPanelProps {
  incidentId: string;
  currentAction: string;
  fallbackAction?: string;
  reason?: string;
  expectedResult?: string;
  attemptedActions?: AttemptedAction[];
  onActionVerified: (result: any) => void;
  isResolved?: boolean;
  followUpTicket?: { id: string; ticketNumber: string; summary: string } | null;
  onStartNewTriage?: (query?: string) => void;
}

export const VerificationLoopPanel: React.FC<VerificationLoopPanelProps> = ({
  incidentId,
  currentAction,
  fallbackAction,
  reason,
  expectedResult,
  attemptedActions = [],
  onActionVerified,
  isResolved = false,
  followUpTicket = null,
  onStartNewTriage
}) => {
  const [selectedStatus, setSelectedStatus] = useState<
    'YES_RESOLVED' | 'NO_FAILED' | 'PARTIALLY_RESOLVED' | 'SOMETHING_CHANGED'
  >('YES_RESOLVED');
  const [userNotes, setUserNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actionInfo = formatActionLabel(currentAction);
  const cleanReason = sanitizeReasonText(reason);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAction) return;

    try {
      setIsSubmitting(true);
      setError(null);
      const res = await ApiClient.verifyActionResult(
        incidentId,
        currentAction,
        selectedStatus,
        userNotes.trim() || undefined
      );
      setUserNotes('');
      onActionVerified(res);
    } catch (err: any) {
      setError(err.message || 'Failed to submit action outcome');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'YES_RESOLVED':
      case 'SUCCESS':
        return { icon: '✓', label: 'Resolved', className: 'status-success' };
      case 'NO_FAILED':
      case 'FAILURE':
        return { icon: '✕', label: 'Unresolved', className: 'status-failed' };
      case 'PARTIALLY_RESOLVED':
      case 'PARTIAL':
        return { icon: '!', label: 'Partially Resolved', className: 'status-partial' };
      case 'SOMETHING_CHANGED':
        return { icon: '~', label: 'Something Changed', className: 'status-changed' };
      default:
        return { icon: '•', label: status, className: 'status-default' };
    }
  };

  const isHumanFeedback = (notes?: string) => {
    if (!notes) return false;
    const trimmed = notes.trim();
    if (!trimmed) return false;
    if (trimmed.toLowerCase().startsWith('result recorded as')) return false;
    if (/^(YES_RESOLVED|NO_FAILED|PARTIALLY_RESOLVED|SOMETHING_CHANGED)$/i.test(trimmed)) return false;
    return true;
  };

  return (
    <div className="verification-loop-panel section-card">
      {/* Resolution Success Banner */}
      {isResolved ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="resolution-success-banner">
            <div className="banner-text">
              <h3>Incident Confirmed Resolved</h3>
              <p>User confirmed that the troubleshooting action successfully restored normal functionality.</p>
            </div>
          </div>
          {followUpTicket && (
            <div 
              className="followup-rectangular-box" 
              style={{ 
                background: 'rgba(245, 158, 11, 0.12)', 
                border: '1.5px solid #f59e0b', 
                borderRadius: '8px', 
                padding: '0.85rem 1.25rem', 
                display: 'flex', 
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 250px' }}>
                <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>⚡</span> Follow-Up Ticket Generated & Linked: <strong>{followUpTicket.ticketNumber}</strong>
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>
                  {followUpTicket.summary}
                </span>
              </div>
              {onStartNewTriage && (
                <button
                  type="button"
                  onClick={() => onStartNewTriage(followUpTicket.summary.replace(/^New symptom reported:\s*/i, '').replace(/^New symptom after [^:]+:\s*/i, ''))}
                  style={{
                    padding: '0.55rem 1.1rem',
                    backgroundColor: '#f59e0b',
                    color: '#111',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Start AI Triage for New Issue →
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Interactive Hero Next Best Action & Verification Form */
        <div className="verification-form-container">
          <div className="hero-action-card">
            <div className="card-header-bar">
              <span className="badge-recommended">
                RECOMMENDED ACTION
              </span>
              {fallbackAction && (
                <span className="badge-fallback" title={`Fallback: ${fallbackAction}`}>
                  FALLBACK AVAILABLE
                </span>
              )}
            </div>

            <h3 className="action-title">{actionInfo.heroTitle}</h3>

            <div className="action-details-grid">
              <div className="steps-column">
                <h4 className="section-label">
                  WHAT TO DO
                </h4>
                <div className="steps-list">
                  {actionInfo.steps.map((step, idx) => (
                    <div key={idx} className="step-item">
                      <span className="step-number">
                        {idx + 1}
                      </span>
                      <span className="step-text">{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {cleanReason && (
                <div className="rationale-column">
                  <h4 className="section-label">
                    WHY THIS STEP
                  </h4>
                  <div className="rationale-box">
                    <p>{cleanReason}</p>
                  </div>
                </div>
              )}
            </div>

            {fallbackAction && (
              <div className="card-footer-note">
                <span className="footer-note-bold">IF THIS DOESN'T WORK:</span>
                <span className="footer-note-text">{formatActionLabel(fallbackAction).heroTitle}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="verification-form">
            <label className="form-question-label text-sm font-semibold text-zinc-200 mb-2 block">
              Did this action resolve your issue?
            </label>
            <div className="status-radio-grid">
              <button
                type="button"
                className={`choice-btn ${selectedStatus === 'YES_RESOLVED' ? 'selected success' : ''}`}
                onClick={() => setSelectedStatus('YES_RESOLVED')}
              >
                <span className="btn-icon">✓</span>
                <span className="btn-label">Yes, Fully Resolved</span>
              </button>

              <button
                type="button"
                className={`choice-btn ${selectedStatus === 'NO_FAILED' ? 'selected danger' : ''}`}
                onClick={() => setSelectedStatus('NO_FAILED')}
              >
                <span className="btn-icon">✕</span>
                <span className="btn-label">No, Didn't Work</span>
              </button>

              <button
                type="button"
                className={`choice-btn ${selectedStatus === 'PARTIALLY_RESOLVED' ? 'selected warning' : ''}`}
                onClick={() => setSelectedStatus('PARTIALLY_RESOLVED')}
              >
                <span className="btn-icon">!</span>
                <span className="btn-label">Partially Resolved</span>
              </button>

              <button
                type="button"
                className={`choice-btn ${selectedStatus === 'SOMETHING_CHANGED' ? 'selected info' : ''}`}
                onClick={() => setSelectedStatus('SOMETHING_CHANGED')}
              >
                <span className="btn-icon">~</span>
                <span className="btn-label">Something Changed</span>
              </button>
            </div>

            <div className="form-group mt-3">
              <label className="text-xs text-zinc-400 mb-1 block">Additional Details or New Symptoms (Optional):</label>
              <textarea
                rows={2}
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                placeholder="e.g. Wi-Fi connected, but authentication timed out..."
                className="form-textarea"
              />
            </div>

            {error && <div className="form-error-alert">{error}</div>}

            <div className="submit-action-and-followup-row" style={{ display: 'flex', flexDirection: 'row', gap: '1rem', alignItems: 'stretch', marginTop: '1.25rem', flexWrap: 'wrap' }}>
              <button type="submit" disabled={isSubmitting} className="submit-verification-btn" style={{ flex: '1 1 240px', minWidth: '200px', margin: 0 }}>
                {isSubmitting ? 'Recording Outcome...' : 'Submit Action Outcome & Continue'}
              </button>

              {followUpTicket && (
                <div 
                  className="followup-rectangular-box" 
                  style={{ 
                    flex: '1 1 320px', 
                    background: 'rgba(245, 158, 11, 0.12)', 
                    border: '1.5px solid #f59e0b', 
                    borderRadius: '8px', 
                    padding: '0.65rem 1rem', 
                    display: 'flex', 
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: '1 1 180px' }}>
                    <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>⚡</span> Follow-Up Ticket: <strong>{followUpTicket.ticketNumber}</strong>
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.775rem', lineHeight: '1.25' }}>
                      {followUpTicket.summary}
                    </span>
                  </div>
                  {onStartNewTriage && (
                    <button
                      type="button"
                      onClick={() => onStartNewTriage(followUpTicket.summary.replace(/^New symptom reported:\s*/i, '').replace(/^New symptom after [^:]+:\s*/i, ''))}
                      style={{
                        padding: '0.45rem 0.9rem',
                        backgroundColor: '#f59e0b',
                        color: '#111',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Start AI Triage →
                    </button>
                  )}
                </div>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Attempted Actions History List */}
      <div className="attempted-actions-section mt-6 border-t border-zinc-800 pt-4">
        <div className="attempted-header-bar">
          <h4 className="panel-title">Troubleshooting History</h4>
          {attemptedActions.length > 0 && (
            <span className="history-count-badge">{attemptedActions.length} step{attemptedActions.length > 1 ? 's' : ''}</span>
          )}
        </div>
        {attemptedActions.length === 0 ? (
          <p className="empty-subtext">No troubleshooting steps have been executed for this ticket yet.</p>
        ) : (
          <div className="attempted-list">
            {attemptedActions.map((act, idx) => {
              const badge = getStatusBadge(act.resultStatus);
              // Clean description string to remove raw leading X or formatting glitches
              let cleanDesc = act.actionDescription.replace(/^x/i, '').trim();
              cleanDesc = formatActionLabel(cleanDesc).heroTitle;
              
              return (
                <div key={act.id || idx} className={`attempted-item-card ${badge.className}`}>
                  <div className="item-main-row">
                    <div className="item-title-group">
                      <span className={`status-icon-badge ${badge.className}`}>{badge.icon}</span>
                      <span className="item-title">{cleanDesc}</span>
                    </div>
                    <div className="item-meta-group">
                      <span className={`status-pill ${badge.className}`}>{badge.label}</span>
                      <span className="item-time">
                        {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  {isHumanFeedback(act.userNotes) && (
                    <div className="item-notes-box">
                      <span className="notes-label">User Feedback:</span>
                      <span className="notes-text">{act.userNotes}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
