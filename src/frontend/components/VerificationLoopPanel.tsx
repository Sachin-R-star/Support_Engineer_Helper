import React, { useState } from 'react';
import { ApiClient } from '../services/apiClient';

export interface AttemptedAction {
  id: string;
  actionDescription: string;
  resultStatus: 'YES_RESOLVED' | 'NO_FAILED' | 'PARTIALLY_RESOLVED' | 'SOMETHING_CHANGED' | 'PENDING';
  userNotes?: string;
  timestamp: string;
}

export function formatActionLabel(actionText: string): { heroTitle: string; icon: string; steps: string[] } {
  if (!actionText) return { heroTitle: 'Review Diagnostic Guidance', icon: '🛠️', steps: ['Follow the provided diagnostic guidance.'] };

  let icon = '🛠️';
  let title = actionText;

  if (/password|sso|login|credential/i.test(actionText)) {
    icon = '🔑';
  } else if (/dns|network|wifi|wi-fi|router|gateway|ip/i.test(actionText)) {
    icon = '🌐';
  } else if (/outlook|email|mail|sync/i.test(actionText)) {
    icon = '📧';
  } else if (/vpn|tunnel|connect/i.test(actionText)) {
    icon = '🔒';
  } else if (/reboot|restart|power|boot|laptop|device/i.test(actionText)) {
    icon = '💻';
  }

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

  return { heroTitle: title, icon, steps };
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
}

export const VerificationLoopPanel: React.FC<VerificationLoopPanelProps> = ({
  incidentId,
  currentAction,
  fallbackAction,
  reason,
  expectedResult,
  attemptedActions = [],
  onActionVerified,
  isResolved = false
}) => {
  const [selectedStatus, setSelectedStatus] = useState<
    'YES_RESOLVED' | 'NO_FAILED' | 'PARTIALLY_RESOLVED' | 'SOMETHING_CHANGED'
  >('YES_RESOLVED');
  const [userNotes, setUserNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actionInfo = formatActionLabel(currentAction);

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
        return { icon: '✓', label: 'Successful (Resolved)', className: 'status-success' };
      case 'NO_FAILED':
      case 'FAILURE':
        return { icon: '✗', label: 'Failed / Unresolved', className: 'status-failed' };
      case 'PARTIALLY_RESOLVED':
      case 'PARTIAL':
        return { icon: '⚠', label: 'Partially Resolved', className: 'status-partial' };
      case 'SOMETHING_CHANGED':
        return { icon: '⚡', label: 'Something Changed / New Error', className: 'status-changed' };
      default:
        return { icon: '•', label: status, className: 'status-default' };
    }
  };

  return (
    <div className="verification-loop-panel section-card">
      {/* Resolution Success Banner */}
      {isResolved ? (
        <div className="resolution-success-banner">
          <div className="banner-text">
            <h3>Incident Confirmed Resolved</h3>
            <p>User confirmed that the troubleshooting action successfully restored normal functionality.</p>
          </div>
        </div>
      ) : (
        /* Interactive Hero Next Best Action & Verification Form */
        <div className="verification-form-container">
          <div className="hero-action-card mb-6 p-5 rounded-xl border border-zinc-700/80 bg-gradient-to-br from-zinc-900/90 via-black to-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-zinc-800">
              <span className="inline-flex items-center rounded-full bg-zinc-800/90 px-3 py-1 text-xs font-bold text-zinc-100 border border-zinc-600/50 tracking-wider uppercase">
                RECOMMENDED ACTION
              </span>
              {fallbackAction && (
                <span className="inline-flex items-center rounded-full bg-zinc-900 px-2.5 py-0.5 text-[11px] font-medium text-zinc-400 border border-zinc-800" title={`Fallback: ${fallbackAction}`}>
                  FALLBACK AVAILABLE
                </span>
              )}
            </div>

            <div className="my-2">
              <h3 className="text-lg font-bold text-white leading-snug tracking-tight">{actionInfo.heroTitle}</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-3 border-t border-zinc-800/80">
              <div>
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2.5">
                  WHAT TO DO
                </h4>
                <ul className="space-y-2 text-xs text-zinc-200" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {actionInfo.steps.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span className="step-num-badge">
                        {idx + 1}
                      </span>
                      <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {reason && (
                <div>
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2.5">
                    WHY THIS STEP?
                  </h4>
                  <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/80">
                    {reason}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between text-xs text-zinc-400 gap-2">
              <span className="font-semibold text-zinc-200">
                IF THIS DOESN'T WORK:
              </span>
              <span>Report the outcome below to proceed to the next diagnostic step.</span>
            </div>
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
                <span className="btn-icon">✗</span>
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

            <button type="submit" disabled={isSubmitting} className="submit-verification-btn">
              {isSubmitting ? 'Recording Outcome...' : 'Submit Action Outcome & Continue'}
            </button>
          </form>
        </div>
      )}

      {/* Attempted Actions History List */}
      <div className="attempted-actions-section mt-6 border-t border-zinc-800 pt-4">
        <h4 className="panel-title">Troubleshooting History & Attempted Actions</h4>
        {attemptedActions.length === 0 ? (
          <p className="empty-subtext">No troubleshooting steps have been executed for this ticket yet.</p>
        ) : (
          <div className="attempted-list">
            {attemptedActions.map((act, idx) => {
              const badge = getStatusBadge(act.resultStatus);
              return (
                <div key={act.id || idx} className={`attempted-item ${badge.className}`}>
                  <div className="item-header">
                    <span className="badge-icon">{badge.icon}</span>
                    <span className="item-title">{act.actionDescription}</span>
                    <span className={`status-pill ${badge.className}`}>{badge.label}</span>
                  </div>
                  {act.userNotes && (
                    <div className="item-notes">
                      <strong>Feedback:</strong> {act.userNotes}
                    </div>
                  )}
                  <div className="item-time">
                    {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
