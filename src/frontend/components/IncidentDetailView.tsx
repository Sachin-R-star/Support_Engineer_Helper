import React, { useState, useEffect } from 'react';
import {
  IncidentRecord,
  TimelineEvent,
  IncidentActionRecord,
  IncidentAnswerRecord,
  IncidentRelationshipRecord,
  IncidentGraphPayload,
  IncidentDetailResponse,
  formatConfidence
} from '../types/triage';
import { ApiClient } from '../services/apiClient';
import { IncidentGraphView } from './IncidentGraphView';
import { RcaPanel } from './RcaPanel';

interface IncidentDetailViewProps {
  incidentId: string;
  onNavigateToIncident: (targetIncidentId: string) => void;
  onBackToList: () => void;
  onStartFollowUpTriage?: (incident: IncidentRecord) => void;
  navigationHistory: string[];
}

export const IncidentDetailView: React.FC<IncidentDetailViewProps> = ({
  incidentId,
  onNavigateToIncident,
  onBackToList,
  onStartFollowUpTriage,
  navigationHistory
}) => {
  const [data, setData] = useState<IncidentDetailResponse | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [graph, setGraph] = useState<IncidentGraphPayload | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'timeline' | 'actions' | 'answers' | 'resolution' | 'relationships'
  >('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline Form States
  const [resolveText, setResolveText] = useState('');
  const [reopenText, setReopenText] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);

  // Manual Link Form State
  const [linkTargetTicket, setLinkTargetTicket] = useState('');
  const [linkType, setLinkType] = useState('RELATED_TO');
  const [linkExplanation, setLinkExplanation] = useState('');

  // Action Result Record Form State
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<'SUCCESS' | 'FAILURE' | 'PARTIAL'>('SUCCESS');
  const [actionDetails, setActionDetails] = useState('');

  useEffect(() => {
    loadAllDetails();
  }, [incidentId]);

  const loadAllDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const [detailRes, timelineRes, graphRes] = await Promise.all([
        ApiClient.fetchIncidentDetails(incidentId),
        ApiClient.fetchIncidentTimeline(incidentId).catch(() => []),
        ApiClient.fetchIncidentGraph(incidentId).catch(() => ({ nodes: [], edges: [] }))
      ]);

      setData(detailRes);
      setTimeline(timelineRes);
      setGraph(graphRes);
    } catch (err: any) {
      setError(err.message || 'Failed to load incident details');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveText.trim()) return;
    try {
      await ApiClient.resolveIncident(incidentId, resolveText);
      setShowResolveModal(false);
      setResolveText('');
      await loadAllDetails();
    } catch (err: any) {
      alert(`Resolution failed: ${err.message}`);
    }
  };

  const handleReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenText.trim()) return;
    try {
      await ApiClient.reopenIncident(incidentId, reopenText);
      setShowReopenModal(false);
      setReopenText('');
      await loadAllDetails();
    } catch (err: any) {
      alert(`Reopen failed: ${err.message}`);
    }
  };

  const handleConfirmRel = async (relId: string) => {
    try {
      await ApiClient.confirmRelationship(relId);
      await loadAllDetails();
    } catch (err: any) {
      alert(`Confirm failed: ${err.message}`);
    }
  };

  const handleRejectRel = async (relId: string) => {
    try {
      await ApiClient.rejectRelationship(relId);
      await loadAllDetails();
    } catch (err: any) {
      alert(`Reject failed: ${err.message}`);
    }
  };

  const handleManualLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkTargetTicket.trim()) return;
    try {
      await ApiClient.linkIncidents(incidentId, linkTargetTicket, linkType, linkExplanation);
      setShowLinkModal(false);
      setLinkTargetTicket('');
      setLinkExplanation('');
      await loadAllDetails();
    } catch (err: any) {
      alert(`Linking failed: ${err.message}`);
    }
  };

  const handleRecordActionResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedActionId || !actionDetails.trim()) return;
    try {
      await ApiClient.recordActionResult(incidentId, selectedActionId, actionStatus, actionDetails);
      setSelectedActionId(null);
      setActionDetails('');
      await loadAllDetails();
    } catch (err: any) {
      alert(`Recording action result failed: ${err.message}`);
    }
  };

  if (loading) return <div className="workbench-loading">Loading IT Support Ticket Workbench...</div>;
  if (error || !data) return <div className="workbench-error">Error: {error || 'Ticket not found'}</div>;

  const { incident, user, device, answers, actions, relationships } = data;

  const getPriorityBadge = (priority: string) => {
    const p = priority.toUpperCase();
    if (p.includes('CRITICAL') || p.includes('P1')) return 'priority-p1';
    if (p.includes('HIGH') || p.includes('P2')) return 'priority-p2';
    if (p.includes('MEDIUM') || p.includes('P3')) return 'priority-p3';
    return 'priority-p4';
  };

  const getStatusBadge = (status: string) => {
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
    <div className="incident-detail-workbench">
      {/* Navigation Stack Breadcrumbs */}
      <div className="workbench-nav-bar">
        <button onClick={onBackToList} className="btn-back-link">
          ← Back to Incident List
        </button>

        {navigationHistory.length > 1 && (
          <div className="history-breadcrumbs">
            <span className="crumb-label">Navigation Stack:</span>
            {navigationHistory.map((histId, idx) => {
              const isCurrent = histId === incidentId;
              return (
                <React.Fragment key={`${histId}-${idx}`}>
                  {idx > 0 && <span className="crumb-sep">→</span>}
                  <button
                    onClick={() => !isCurrent && onNavigateToIncident(histId)}
                    className={`crumb-item ${isCurrent ? 'active' : ''}`}
                  >
                    {histId === incidentId ? incident.ticketNumber : histId}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Ticket Master Header */}
      <div className="workbench-header-card">
        <div className="header-main-row">
          <div className="ticket-title-block">
            <div className="ticket-number-tag">
              <span className="font-mono">{incident.ticketNumber}</span>
              <span className={`status-badge ${getStatusBadge(incident.status)}`}>
                {incident.status}
              </span>
              <span className={`priority-badge ${getPriorityBadge(incident.priority)}`}>
                {incident.priority.replace('_', ' ')}
              </span>
              <span className="category-pill">{incident.category}</span>
            </div>
            <h2>{incident.summary}</h2>
          </div>

          <div className="header-actions">
            {incident.status !== 'RESOLVED' && (
              <button onClick={() => setShowResolveModal(true)} className="btn-resolve">
                ✓ Resolve Ticket
              </button>
            )}
            {incident.status === 'RESOLVED' && (
              <button onClick={() => setShowReopenModal(true)} className="btn-reopen">
                ↺ Reopen Ticket
              </button>
            )}
            {onStartFollowUpTriage && (
              <button
                onClick={() => onStartFollowUpTriage(incident)}
                className="btn-followup"
              >
                + Start Follow-up Triage
              </button>
            )}
          </div>
        </div>

        {/* User & Device Metadata Summary Bar */}
        <div className="meta-info-grid">
          <div className="meta-box">
            <span className="meta-label">User Profile</span>
            <span className="meta-val">
              {user ? `${user.name} (${user.department})` : incident.userId}
              {user?.isVip && <span className="vip-tag">⭐ VIP</span>}
            </span>
          </div>

          <div className="meta-box">
            <span className="meta-label">Device Asset</span>
            <span className="meta-val font-mono">
              {device ? `${device.name} (${device.os})` : incident.deviceId || 'N/A'}
            </span>
          </div>

          <div className="meta-box">
            <span className="meta-label">Issue Taxonomy</span>
            <span className="meta-val">{incident.issueType.replace(/_/g, ' ')}</span>
          </div>

          <div className="meta-box">
            <span className="meta-label">Created Date</span>
            <span className="meta-val font-mono">
              {new Date(incident.createdAt).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Fact Distinction Legend Bar */}
        <div className="fact-distinction-bar">
          <span className="distinction-heading">Fact Types:</span>
          <span className="fact-pill current-fact">🟢 Current Fact</span>
          <span className="fact-pill historical-fact">📜 Historical Fact</span>
          <span className="fact-pill ai-suggestion">🤖 AI Suggestion</span>
          <span className="fact-pill user-confirmed">👤 User-Confirmed</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <nav className="workbench-tabs">
        <button
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          Diagnosis Overview
        </button>
        <button
          className={activeTab === 'timeline' ? 'active' : ''}
          onClick={() => setActiveTab('timeline')}
        >
          Timeline ({timeline.length})
        </button>
        <button
          className={activeTab === 'actions' ? 'active' : ''}
          onClick={() => setActiveTab('actions')}
        >
          Actions ({actions.length})
        </button>
        <button
          className={activeTab === 'answers' ? 'active' : ''}
          onClick={() => setActiveTab('answers')}
        >
          Answers ({answers.length})
        </button>
        <button
          className={activeTab === 'resolution' ? 'active' : ''}
          onClick={() => setActiveTab('resolution')}
        >
          Resolution / Reopen
        </button>
        <button
          className={activeTab === 'relationships' ? 'active' : ''}
          onClick={() => setActiveTab('relationships')}
        >
          Graph & Related ({relationships.length})
        </button>
      </nav>

      {/* Tab Content Panels */}
      <div className="workbench-content-panel">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="overview-tab-content">
            <div className="overview-grid">
              <div className="detail-card">
                <div className="card-header-with-badge">
                  <h3>Issue Description</h3>
                  <span className="fact-pill current-fact">🟢 Current Fact</span>
                </div>
                <p className="description-text">{incident.description}</p>
              </div>

              <div className="detail-card">
                <div className="card-header-with-badge">
                  <h3>Recommended Next Troubleshooting Step</h3>
                  <span className="fact-pill ai-suggestion">🤖 AI Suggestion</span>
                </div>
                <div className="step-box">
                  <div className="step-title">{incident.recommendedNextStep}</div>
                  <p className="step-reasoning">{incident.reasoning}</p>
                  <div className="confidence-meter">
                    <span>Diagnostic Confidence:</span>
                    <div className="meter-bar">
                      <div
                        className="fill"
                        style={{ width: `${formatConfidence(incident.confidenceScore)}%` }}
                      />
                    </div>
                    <span className="font-mono">{formatConfidence(incident.confidenceScore)}%</span>
                  </div>
                </div>
              </div>

              {incident.missingInfo && incident.missingInfo.length > 0 && (
                <div className="detail-card warning-card">
                  <h3>Missing Information Needed</h3>
                  <ul className="missing-list">
                    {incident.missingInfo.map((info, i) => (
                      <li key={i}>{info}</li>
                    ))}
                  </ul>
                </div>
              )}

              {incident.escalationTier && incident.escalationTier !== 'NONE' && (
                <div className="detail-card escalation-card">
                  <h3>Escalation Status</h3>
                  <p>
                    Target Tier: <strong>{incident.escalationTier}</strong>
                  </p>
                </div>
              )}
            </div>

            {/* Explainable Root Cause Analysis Panel */}
            <div className="mt-4">
              <RcaPanel incidentId={incident.id} />
            </div>
          </div>
        )}

        {/* TIMELINE TAB */}
        {activeTab === 'timeline' && (
          <div className="timeline-tab-content">
            <h3 className="section-title">Audit Trail & Incident Timeline</h3>
            {timeline.length === 0 ? (
              <p className="empty-msg">No event logs recorded for this ticket.</p>
            ) : (
              <div className="timeline-feed">
                {timeline.map((evt) => (
                  <div key={evt.id} className="timeline-item">
                    <div className="timeline-node-icon" />
                    <div className="timeline-content">
                      <div className="timeline-header-line">
                        <span className="event-type">{evt.eventType.replace(/_/g, ' ')}</span>
                        <span className="event-actor">By: {evt.actor}</span>
                        <span className="event-time font-mono">
                          {new Date(evt.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="event-description">{evt.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ACTIONS TAB */}
        {activeTab === 'actions' && (
          <div className="actions-tab-content">
            <div className="section-header-flex">
              <h3>Troubleshooting Actions Performed</h3>
            </div>

            {actions.length === 0 ? (
              <p className="empty-msg">No troubleshooting actions executed yet.</p>
            ) : (
              <div className="actions-list">
                {actions.map((act) => (
                  <div key={act.id} className="action-card">
                    <div className="action-top">
                      <span className="action-type-pill">{act.actionType}</span>
                      <span className="performer-pill">Performer: {act.performer}</span>
                      {act.resultStatus && (
                        <span className={`result-status-pill ${act.resultStatus.toLowerCase()}`}>
                          {act.resultStatus}
                        </span>
                      )}
                      <span className="fact-pill current-fact">🟢 Current Fact</span>
                    </div>

                    <div className="action-desc">{act.description}</div>

                    {act.resultDetails && (
                      <div className="action-result-box">
                        <strong>Result Details:</strong> {act.resultDetails}
                      </div>
                    )}

                    {!act.resultStatus || act.resultStatus === 'PENDING' ? (
                      <button
                        onClick={() => setSelectedActionId(act.id)}
                        className="btn-link-action"
                      >
                        + Record Action Outcome
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {/* Form to record action result */}
            {selectedActionId && (
              <div className="record-result-inline-form">
                <h4>Record Outcome for Action</h4>
                <form onSubmit={handleRecordActionResult}>
                  <div className="form-group">
                    <label>Result Status:</label>
                    <select
                      value={actionStatus}
                      onChange={(e) => setActionStatus(e.target.value as any)}
                    >
                      <option value="SUCCESS">SUCCESS</option>
                      <option value="FAILURE">FAILURE</option>
                      <option value="PARTIAL">PARTIAL</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Outcome Details:</label>
                    <textarea
                      rows={2}
                      value={actionDetails}
                      onChange={(e) => setActionDetails(e.target.value)}
                      placeholder="e.g. Network adapter restarted, connection restored."
                      required
                    />
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn-primary">
                      Save Action Result
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedActionId(null)}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ANSWERS TAB */}
        {activeTab === 'answers' && (
          <div className="answers-tab-content">
            <h3>Triage Questions & User Answers</h3>
            {answers.length === 0 ? (
              <p className="empty-msg">No triage answers logged for this ticket.</p>
            ) : (
              <div className="answers-list">
                {answers.map((ans) => (
                  <div key={ans.id} className="answer-card">
                    <div className="answer-top">
                      <span className="question-id-tag font-mono">{ans.questionId}</span>
                      {ans.isUnsure ? (
                        <span className="fact-pill historical-fact">⚠️ Unsure / Don't Know</span>
                      ) : (
                        <span className="fact-pill user-confirmed">👤 User-Confirmed</span>
                      )}
                      <span className="answer-time font-mono">
                        {new Date(ans.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="question-text">{ans.questionText}</div>
                    <div className="answer-value">
                      Answer: <strong>{ans.answerValue}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* RESOLUTION / REOPEN TAB */}
        {activeTab === 'resolution' && (
          <div className="resolution-tab-content">
            <h3>Resolution & Reopen History</h3>
            <div className="resolution-card">
              <div className="card-header-with-badge">
                <h4>Current Resolution Status</h4>
                <span className={`status-badge ${getStatusBadge(incident.status)}`}>
                  {incident.status}
                </span>
              </div>

              {incident.resolution ? (
                <div className="resolution-notes-box">
                  <div className="box-title">Resolution Notes:</div>
                  <p>{incident.resolution}</p>
                </div>
              ) : (
                <p className="empty-msg">Ticket is currently active and not resolved.</p>
              )}

              <div className="tab-actions-bar">
                {incident.status !== 'RESOLVED' ? (
                  <button onClick={() => setShowResolveModal(true)} className="btn-primary">
                    ✓ Resolve This Incident
                  </button>
                ) : (
                  <button onClick={() => setShowReopenModal(true)} className="btn-secondary">
                    ↺ Reopen Ticket
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* RELATIONSHIPS & GRAPH TAB */}
        {activeTab === 'relationships' && (
          <div className="relationships-tab-content">
            <div className="section-header-flex">
              <h3>Incident Graph & Linked Tickets</h3>
              <button onClick={() => setShowLinkModal(true)} className="btn-secondary">
                + Link Another Ticket
              </button>
            </div>

            {graph && (
              <IncidentGraphView
                graph={graph}
                currentIncidentId={incident.id}
                onSelectIncident={(targetId) => onNavigateToIncident(targetId)}
              />
            )}

            <div className="relationships-list-section">
              <h4>Relationship Records</h4>
              {relationships.length === 0 ? (
                <p className="empty-msg">No linked tickets or causal relationships found.</p>
              ) : (
                <div className="relationships-grid">
                  {relationships.map((rel) => {
                    const isProposed = rel.status === 'PROPOSED';
                    const targetId =
                      rel.sourceIncidentId === incident.id ? rel.targetIncidentId : rel.sourceIncidentId;

                    return (
                      <div key={rel.id} className="relationship-card">
                        <div className="rel-card-top">
                          <span className="rel-type-tag">{rel.relationshipType.replace(/_/g, ' ')}</span>
                          <span
                            className={`rel-status-badge ${
                              rel.status === 'CONFIRMED'
                                ? 'status-confirmed'
                                : rel.status === 'PROPOSED'
                                ? 'status-proposed'
                                : 'status-rejected'
                            }`}
                          >
                            {rel.status}
                          </span>
                          {isProposed ? (
                            <span className="fact-pill ai-suggestion">🤖 AI Suggestion</span>
                          ) : (
                            <span className="fact-pill user-confirmed">👤 User-Confirmed</span>
                          )}
                        </div>

                        <div className="rel-target-row">
                          <span>Target Ticket ID:</span>
                          <button
                            onClick={() => onNavigateToIncident(targetId)}
                            className="btn-target-ticket font-mono"
                          >
                            {targetId} →
                          </button>
                        </div>

                        {rel.explanation && <p className="rel-explanation">{rel.explanation}</p>}

                        {isProposed && (
                          <div className="rel-confirm-bar">
                            <button
                              onClick={() => handleConfirmRel(rel.id)}
                              className="btn-confirm-sm"
                            >
                              ✓ Confirm Relationship
                            </button>
                            <button
                              onClick={() => handleRejectRel(rel.id)}
                              className="btn-reject-sm"
                            >
                              ✕ Reject
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* RESOLVE MODAL */}
      {showResolveModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h3>Resolve Incident</h3>
            <form onSubmit={handleResolve}>
              <div className="form-group">
                <label>Resolution Summary / Notes:</label>
                <textarea
                  rows={4}
                  value={resolveText}
                  onChange={(e) => setResolveText(e.target.value)}
                  placeholder="Describe how the issue was resolved..."
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary">
                  Submit Resolution
                </button>
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REOPEN MODAL */}
      {showReopenModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h3>Reopen Incident</h3>
            <form onSubmit={handleReopen}>
              <div className="form-group">
                <label>Reason for Reopening:</label>
                <textarea
                  rows={4}
                  value={reopenText}
                  onChange={(e) => setReopenText(e.target.value)}
                  placeholder="Explain why this issue has reoccurred or needs to be reopened..."
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary">
                  Reopen Ticket
                </button>
                <button
                  type="button"
                  onClick={() => setShowReopenModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LINK TICKET MODAL */}
      {showLinkModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h3>Link Related Ticket</h3>
            <form onSubmit={handleManualLink}>
              <div className="form-group">
                <label>Target Ticket ID (or DB ID):</label>
                <input
                  type="text"
                  value={linkTargetTicket}
                  onChange={(e) => setLinkTargetTicket(e.target.value)}
                  placeholder="e.g. inc_1726000000000"
                  required
                />
              </div>

              <div className="form-group">
                <label>Relationship Type:</label>
                <select value={linkType} onChange={(e) => setLinkType(e.target.value)}>
                  <option value="RELATED_TO">RELATED TO</option>
                  <option value="POSSIBLY_CAUSED_BY">POSSIBLY CAUSED BY</option>
                  <option value="FOLLOW_UP_TO">FOLLOW UP TO</option>
                  <option value="REOPENED_FROM">REOPENED FROM</option>
                  <option value="DUPLICATE">DUPLICATE</option>
                </select>
              </div>

              <div className="form-group">
                <label>Explanation / Context:</label>
                <textarea
                  rows={3}
                  value={linkExplanation}
                  onChange={(e) => setLinkExplanation(e.target.value)}
                  placeholder="Why are these two tickets linked?"
                />
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn-primary">
                  Create Link
                </button>
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
