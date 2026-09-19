import React, { useState, useEffect } from 'react';
import {
  IncidentRecord,
  IncidentDetailResponse,
  IncidentActionRecord,
  IncidentAnswerRecord,
  IncidentRelationshipRecord
} from '../types/triage';
import { ApiClient } from '../services/apiClient';

interface EngineerIncidentInspectorProps {
  incidentId: string;
  onClose: () => void;
  onSelectIncident: (incidentId: string) => void;
  onRefreshStats: () => void;
}

export const EngineerIncidentInspector: React.FC<EngineerIncidentInspectorProps> = ({
  incidentId,
  onClose,
  onSelectIncident,
  onRefreshStats
}) => {
  const [data, setData] = useState<IncidentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states for engineer quick actions
  const [resolveText, setResolveText] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [actionDesc, setActionDesc] = useState('');
  const [actionPerformer, setActionPerformer] = useState<'AGENT' | 'USER' | 'SYSTEM'>('AGENT');
  const [isAppendingAction, setIsAppendingAction] = useState(false);

  useEffect(() => {
    loadDetails();
  }, [incidentId]);

  const loadDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const detailRes = await ApiClient.fetchIncidentDetails(incidentId);
      setData(detailRes);
    } catch (err: any) {
      setError(err.message || 'Failed to load ticket details');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveText.trim()) return;
    try {
      await ApiClient.resolveIncident(incidentId, resolveText);
      setResolveText('');
      setIsResolving(false);
      await loadDetails();
      onRefreshStats();
    } catch (err: any) {
      alert(`Resolve failed: ${err.message}`);
    }
  };

  const handleAppendAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionDesc.trim()) return;
    try {
      await ApiClient.appendAction(incidentId, 'TROUBLESHOOTING_STEP', actionDesc, actionPerformer);
      setActionDesc('');
      setIsAppendingAction(false);
      await loadDetails();
    } catch (err: any) {
      alert(`Action append failed: ${err.message}`);
    }
  };

  const handleConfirmRel = async (relId: string) => {
    try {
      await ApiClient.confirmRelationship(relId, 'TIER_1_AGENT');
      await loadDetails();
      onRefreshStats();
    } catch (err: any) {
      alert(`Confirm failed: ${err.message}`);
    }
  };

  const handleRejectRel = async (relId: string) => {
    try {
      await ApiClient.rejectRelationship(relId, 'TIER_1_AGENT');
      await loadDetails();
      onRefreshStats();
    } catch (err: any) {
      alert(`Reject failed: ${err.message}`);
    }
  };

  if (loading) return <div className="inspector-loading">Loading Engineer Incident Inspector...</div>;
  if (error || !data) return <div className="inspector-error">Error: {error || 'Incident not found'}</div>;

  const { incident, user, device, answers, actions, relationships } = data;

  const getPriorityClass = (priority: string) => {
    const p = priority.toUpperCase();
    if (p.includes('CRITICAL') || p.includes('P1')) return 'priority-p1';
    if (p.includes('HIGH') || p.includes('P2')) return 'priority-p2';
    if (p.includes('MEDIUM') || p.includes('P3')) return 'priority-p3';
    return 'priority-p4';
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'status-open';
      case 'IN_PROGRESS':
        return 'status-progress';
      case 'RESOLVED':
        return 'status-resolved';
      case 'REOPENED':
        return 'status-reopened';
      case 'ESCALATED':
        return 'status-escalated';
      default:
        return 'status-default';
    }
  };

  return (
    <div className="engineer-inspector-backdrop">
      <div className="engineer-inspector-panel">
        {/* Top Header */}
        <div className="inspector-header">
          <div className="header-left">
            <span className="font-mono ticket-tag">{incident.ticketNumber}</span>
            <span className={`status-badge ${getStatusClass(incident.status)}`}>{incident.status}</span>
            <span className={`priority-badge ${getPriorityClass(incident.priority)}`}>
              {incident.priority.replace('_', ' ')}
            </span>
            <span className="category-pill">{incident.category}</span>
          </div>

          <button onClick={onClose} className="btn-close-inspector" title="Close inspector">
            ✕ Close
          </button>
        </div>

        {/* 9-Point Prioritized Inspection Stream */}
        <div className="inspection-stream">
          {/* 1. CURRENT PROBLEM */}
          <div className="stream-section priority-1">
            <div className="section-label-bar">
              <span className="step-num">1</span>
              <h4>CURRENT PROBLEM</h4>
              <span className="fact-pill current-fact">🟢 Current Fact</span>
            </div>
            <div className="section-body">
              <h3 className="problem-summary">{incident.summary}</h3>
              <p className="problem-desc">{incident.description}</p>

              <div className="asset-meta-row">
                <div className="asset-chip">
                  <span className="chip-label">User:</span>
                  <span className="chip-val">{user ? `${user.name} (${user.department})` : incident.userId}</span>
                  {user?.isVip && <span className="vip-star">⭐ VIP</span>}
                </div>
                <div className="asset-chip font-mono">
                  <span className="chip-label">Device:</span>
                  <span className="chip-val">{device ? `${device.name} (${device.os})` : incident.deviceId || 'N/A'}</span>
                </div>
                <div className="asset-chip">
                  <span className="chip-label">Category:</span>
                  <span className="chip-val">{incident.category}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. PRIORITY */}
          <div className="stream-section priority-2">
            <div className="section-label-bar">
              <span className="step-num">2</span>
              <h4>PRIORITY & SCORING FACTORS</h4>
              <span className="fact-pill user-confirmed">👤 Verified Signals</span>
            </div>
            <div className="section-body">
              <div className="priority-overview-box">
                <div className="pri-pill-large">
                  <span className={`priority-badge ${getPriorityClass(incident.priority)}`}>
                    {incident.priority.replace('_', ' ')}
                  </span>
                </div>
                <div className="pri-score font-mono">
                  Confidence Score: {Math.round((incident.confidenceScore || 0) * 100)}%
                </div>
              </div>
            </div>
          </div>

          {/* 3. EVIDENCE */}
          <div className="stream-section priority-3">
            <div className="section-label-bar">
              <span className="step-num">3</span>
              <h4>COLLECTED TRIAGE EVIDENCE ({answers.length})</h4>
              <span className="fact-pill current-fact">🟢 Current Facts</span>
            </div>
            <div className="section-body">
              {answers.length === 0 ? (
                <p className="empty-state-text">No structured diagnostic evidence collected yet.</p>
              ) : (
                <div className="evidence-grid">
                  {answers.map((ans) => (
                    <div key={ans.id} className="evidence-card">
                      <div className="ev-question font-mono">{ans.questionId}</div>
                      <div className="ev-text">{ans.questionText}</div>
                      <div className="ev-answer">
                        Answer: <strong>{ans.answerValue}</strong>
                        {ans.isUnsure && <span className="unsure-badge">⚠️ Unsure</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 4. RELEVANT HISTORY */}
          <div className="stream-section priority-4">
            <div className="section-label-bar">
              <span className="step-num">4</span>
              <h4>RELEVANT HISTORY & TIMELINE CONTEXT</h4>
              <span className="fact-pill historical-fact">📜 Historical Fact</span>
            </div>
            <div className="section-body">
              <p className="history-text">
                Ticket created on <span className="font-mono">{new Date(incident.createdAt).toLocaleString()}</span>.
              </p>
            </div>
          </div>

          {/* 5. ACTIONS ALREADY ATTEMPTED */}
          <div className="stream-section priority-5">
            <div className="section-label-bar">
              <span className="step-num">5</span>
              <h4>ACTIONS ALREADY ATTEMPTED ({actions.length})</h4>
              <span className="fact-pill current-fact">🟢 Current Facts</span>
            </div>
            <div className="section-body">
              {actions.length === 0 ? (
                <p className="empty-state-text">No troubleshooting actions executed prior to inspection.</p>
              ) : (
                <div className="actions-stream">
                  {actions.map((act) => (
                    <div key={act.id} className="action-stream-card">
                      <div className="act-top font-mono">
                        <span className="act-type">{act.actionType}</span>
                        <span className="act-perf">By {act.performer}</span>
                        {act.resultStatus && (
                          <span className={`result-status-pill ${act.resultStatus.toLowerCase()}`}>
                            {act.resultStatus}
                          </span>
                        )}
                      </div>
                      <div className="act-desc">{act.description}</div>
                      {act.resultDetails && <div className="act-res font-mono">{act.resultDetails}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Append Action Button */}
              {!isAppendingAction ? (
                <button onClick={() => setIsAppendingAction(true)} className="btn-secondary btn-sm mt-2">
                  + Record Attempted Action
                </button>
              ) : (
                <form onSubmit={handleAppendAction} className="inline-action-form mt-2">
                  <div className="form-group">
                    <label>Action Description:</label>
                    <input
                      type="text"
                      value={actionDesc}
                      onChange={(e) => setActionDesc(e.target.value)}
                      placeholder="e.g. Cleared browser DNS cache and flushed sockets."
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Performer:</label>
                    <select
                      value={actionPerformer}
                      onChange={(e) => setActionPerformer(e.target.value as any)}
                    >
                      <option value="AGENT">AGENT (Support Engineer)</option>
                      <option value="USER">USER (End User)</option>
                      <option value="SYSTEM">SYSTEM (Automated Script)</option>
                    </select>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn-primary btn-sm">Save Action</button>
                    <button type="button" onClick={() => setIsAppendingAction(false)} className="btn-secondary btn-sm">Cancel</button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* 6. RECOMMENDED NEXT ACTION */}
          <div className="stream-section priority-6 highlight-section">
            <div className="section-label-bar">
              <span className="step-num">6</span>
              <h4>RECOMMENDED NEXT ACTION</h4>
              <span className="fact-pill ai-suggestion">🤖 AI Suggestion</span>
            </div>
            <div className="section-body">
              <div className="rec-action-banner">
                <div className="rec-action-title">{incident.recommendedNextStep}</div>
              </div>
            </div>
          </div>

          {/* 7. WHY */}
          <div className="stream-section priority-7">
            <div className="section-label-bar">
              <span className="step-num">7</span>
              <h4>WHY (REASONING & JUSTIFICATION)</h4>
              <span className="fact-pill ai-suggestion">🤖 AI Explanation</span>
            </div>
            <div className="section-body">
              <p className="reasoning-paragraph">{incident.reasoning}</p>
            </div>
          </div>

          {/* 8. RELATED INCIDENTS */}
          <div className="stream-section priority-8">
            <div className="section-label-bar">
              <span className="step-num">8</span>
              <h4>RELATED INCIDENTS & CAUSAL LINKS ({relationships.length})</h4>
            </div>
            <div className="section-body">
              {relationships.length === 0 ? (
                <p className="empty-state-text">No related tickets or causal chains linked.</p>
              ) : (
                <div className="relationships-stream">
                  {relationships.map((rel) => {
                    const targetId = rel.sourceIncidentId === incident.id ? rel.targetIncidentId : rel.sourceIncidentId;
                    const isProposed = rel.status === 'PROPOSED';

                    return (
                      <div key={rel.id} className="rel-stream-card">
                        <div className="rel-header font-mono">
                          <span className="rel-type">{rel.relationshipType.replace(/_/g, ' ')}</span>
                          <span className={`rel-status ${rel.status.toLowerCase()}`}>{rel.status}</span>
                          <button onClick={() => onSelectIncident(targetId)} className="btn-link-target">
                            Inspect {targetId} →
                          </button>
                        </div>
                        {rel.explanation && <p className="rel-explanation">{rel.explanation}</p>}

                        {isProposed && (
                          <div className="rel-actions">
                            <button onClick={() => handleConfirmRel(rel.id)} className="btn-confirm-sm">✓ Confirm</button>
                            <button onClick={() => handleRejectRel(rel.id)} className="btn-reject-sm">✕ Reject</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 9. ESCALATION */}
          <div className="stream-section priority-9">
            <div className="section-label-bar">
              <span className="step-num">9</span>
              <h4>ESCALATION STATUS & PROTOCOL</h4>
            </div>
            <div className="section-body">
              <div className="escalation-box">
                <div>Escalation Tier: <strong>{incident.escalationTier || 'NONE'}</strong></div>
                {incident.status === 'RESOLVED' ? (
                  <p className="resolved-notice">✓ Ticket resolved.</p>
                ) : !isResolving ? (
                  <div className="escalation-actions">
                    <button onClick={() => setIsResolving(true)} className="btn-resolve">✓ Mark as Resolved</button>
                  </div>
                ) : (
                  <form onSubmit={handleResolve} className="resolve-inline-form">
                    <div className="form-group">
                      <label>Resolution Summary:</label>
                      <textarea
                        rows={2}
                        value={resolveText}
                        onChange={(e) => setResolveText(e.target.value)}
                        placeholder="Detail how the issue was fixed..."
                        required
                      />
                    </div>
                    <div className="form-actions">
                      <button type="submit" className="btn-primary btn-sm">Submit Resolution</button>
                      <button type="button" onClick={() => setIsResolving(false)} className="btn-secondary btn-sm">Cancel</button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
