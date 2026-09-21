import React, { useState, useEffect } from 'react';
import { RcaPayload, RcaCandidate, RcaHumanDecisionType, RcaVerificationOutcome, RcaEvidenceItem, RcaDecisionAuditEntry } from '../types/triage';
import { ApiClient } from '../services/apiClient';

interface RcaPanelProps {
  incidentId: string;
}

export const RcaPanel: React.FC<RcaPanelProps> = ({ incidentId }) => {
  const [rca, setRca] = useState<RcaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notesInput, setNotesInput] = useState<Record<string, string>>({});
  const [overrideInput, setOverrideInput] = useState<Record<string, string>>({});
  const [showOverrideDialog, setShowOverrideDialog] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [activeVerificationCand, setActiveVerificationCand] = useState<string | null>(null);
  const [verifNotes, setVerifNotes] = useState('');

  useEffect(() => {
    loadRca();
  }, [incidentId]);

  const loadRca = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ApiClient.fetchRca(incidentId);
      if (data && data.incidentId && data.incidentId !== incidentId) {
        setError(`Cross-incident security invariant check failed: requested ${incidentId}, received ${data.incidentId}`);
        setRca(null);
        return;
      }
      setRca(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load RCA');
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (candidateId: string, decision: RcaHumanDecisionType, overrideReason?: string) => {
    try {
      const notes = notesInput[candidateId]?.trim() || undefined;

      // Front-end Pre-validation for Rejection Notes
      if (decision === 'REJECTED' && !notes && !overrideReason) {
        const reason = prompt('Please enter a mandatory rejection reason/note:');
        if (!reason || reason.trim().length < 3) {
          alert('Rejection canceled: A rejection reason is mandatory.');
          return;
        }
        const updated = await ApiClient.recordRcaDecision(incidentId, candidateId, decision, reason, undefined);
        setRca(updated);
        return;
      }

      const updated = await ApiClient.recordRcaDecision(incidentId, candidateId, decision, notes, overrideReason);
      setRca(updated);
      setNotesInput(prev => ({ ...prev, [candidateId]: '' }));
      setShowOverrideDialog(null);
    } catch (err: any) {
      if (err.message.includes('zero supporting evidence')) {
        setShowOverrideDialog(candidateId);
      } else {
        alert(`RCA Governance action failed: ${err.message}`);
      }
    }
  };

  const handleVerifyHypothesis = async (candidateId: string, result: RcaVerificationOutcome) => {
    try {
      const updated = await ApiClient.verifyRcaHypothesis(incidentId, candidateId, result, verifNotes);
      setRca(updated);
      setActiveVerificationCand(null);
      setVerifNotes('');
    } catch (err: any) {
      alert(`Verification failed: ${err.message}`);
    }
  };

  if (loading) return <div className="rca-loading">Analyzing Root Cause Candidates & Grounded Evidence...</div>;
  if (error || !rca) return <div className="rca-error">RCA Analysis Unavailable: {error}</div>;

  const getGovernanceBadge = (cand: RcaCandidate) => {
    if (cand.governance_state === 'VERIFIED_BY_EVIDENCE') {
      return { label: '🔬 Verified by Evidence', className: 'decision-confirmed' };
    }
    switch (cand.human_decision) {
      case 'CONFIRMED':
        return { label: '👤 Human Confirmed Fact', className: 'decision-confirmed' };
      case 'REJECTED':
        return { label: '❌ Human Rejected Hypothesis', className: 'decision-rejected' };
      case 'UNCERTAIN':
        return { label: '❓ Marked Uncertain by Human', className: 'decision-uncertain' };
      default:
        return { label: '🤖 AI Grounded Hypothesis', className: 'decision-ai' };
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'knowledge_base': return 'Knowledge Base';
      case 'current_incident_evidence': return 'Current Evidence';
      case 'historical_incident_evidence': return 'Historical Context';
      case 'troubleshooting_action': return 'Troubleshooting Action';
      case 'relationship_context': return 'Graph Relationship';
      default: return source;
    }
  };

  return (
    <div className="rca-panel-container section-card">
      <div className="rca-header-block">
        <div className="title-row">
          <h3>🧠 Governance-Hardened Root Cause Analysis (RCA)</h3>
          <span className="rca-diag-pill">{rca.currentDiagnosis}</span>
        </div>
        <p className="rca-subtext">
          Auditable hypothesis evaluation separating AI confidence from human confirmation, evidence snapshots, and multi-engineer governance audit trails.
        </p>
      </div>

      {rca.uncertaintyWarning && (
        <div className="section-card warning-card mb-4" style={{ borderColor: 'var(--p2-orange)', background: 'rgba(245, 158, 11, 0.05)' }}>
          <h4>⚠️ Diagnostic Uncertainty Notice</h4>
          <p>{rca.uncertaintyWarning}</p>
        </div>
      )}

      {/* VERIFIED ROOT CAUSE BANNER */}
      {rca.verifiedRootCause && (
        <div className="section-card verified-rca-card mb-4">
          <div className="verified-header">
            <span className="verified-badge">✓ VERIFIED ROOT CAUSE</span>
            <span className="source-pill">{getSourceLabel(rca.verifiedRootCause.source)}</span>
          </div>
          <h4>{rca.verifiedRootCause.title}</h4>
          <p>{rca.verifiedRootCause.description}</p>
          {rca.verifiedRootCause.human_decision_notes && (
            <div className="decision-notes-box">
              <strong>Human Verification Notes:</strong> {rca.verifiedRootCause.human_decision_notes}
            </div>
          )}
          {rca.verifiedRootCause.ai_confidence_at_decision !== undefined && (
            <div className="text-xs text-muted mt-1 font-mono">
              AI Confidence at Decision Time: {rca.verifiedRootCause.ai_confidence_at_decision}% | Current AI Confidence: {rca.verifiedRootCause.confidence}%
            </div>
          )}
        </div>
      )}

      {/* POSSIBLE ROOT CAUSES LIST */}
      <div className="possible-candidates-section">
        <h4 className="section-subtitle">🎯 Possible Root Cause Candidates ({rca.possibleRootCauses.length})</h4>
        {rca.possibleRootCauses.length === 0 ? (
          <p className="empty-subtext">No active root cause hypotheses match current evidence.</p>
        ) : (
          <div className="candidates-list">
            {rca.possibleRootCauses.map((cand: RcaCandidate) => {
              const badge = getGovernanceBadge(cand);
              const isConfirmed = cand.human_decision === 'CONFIRMED' || cand.governance_state === 'VERIFIED_BY_EVIDENCE';
              const isRejected = cand.human_decision === 'REJECTED';

              return (
                <div key={cand.candidate_id} className={`rca-candidate-card ${isConfirmed ? 'confirmed' : isRejected ? 'rejected' : ''}`}>
                  <div className="cand-header">
                    <div className="cand-title-block">
                      <h5>{cand.title}</h5>
                      <div className="cand-pills-row">
                        <span className="confidence-pill font-mono">{cand.confidence}% AI Confidence</span>
                        <span className="source-pill">{getSourceLabel(cand.source)}</span>
                        <span className={`decision-pill ${badge.className}`}>{badge.label}</span>
                        {cand.governance_conflict && (
                          <span className="decision-pill warning-card" style={{ background: '#7f1d1d', color: '#fca5a5' }}>
                            ⚠️ Governance Conflict
                          </span>
                        )}
                        {cand.previously_rejected_new_evidence && (
                          <span className="decision-pill" style={{ background: '#78350f', color: '#fde68a' }}>
                            Previously rejected — new evidence detected
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="cand-desc">{cand.description}</p>

                  <div className="evidence-grid">
                    {/* Supporting Evidence */}
                    <div className="evidence-box supporting">
                      <h6>🟢 Supporting Evidence ({cand.supporting_evidence.length})</h6>
                      {cand.supporting_evidence.length === 0 ? (
                        <span className="text-muted">No explicit supporting evidence</span>
                      ) : (
                        <ul>
                          {cand.supporting_evidence.map((item: RcaEvidenceItem) => (
                            <li key={item.id}>
                              <span>{item.statement}</span>
                              {item.isHistorical && <span className="fact-pill historical-fact font-mono">📜 Historical ({item.ticketNumber || 'Past'})</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Contradicting Evidence */}
                    <div className="evidence-box contradicting">
                      <h6>❌ Contradicting Evidence ({cand.contradicting_evidence.length})</h6>
                      {cand.contradicting_evidence.length === 0 ? (
                        <span className="text-muted">No contradicting evidence</span>
                      ) : (
                        <ul>
                          {cand.contradicting_evidence.map((item: RcaEvidenceItem) => (
                            <li key={item.id}>
                              <span>{item.statement}</span>
                              {item.isHistorical && <span className="fact-pill historical-fact font-mono">📜 Historical</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Missing Evidence */}
                  {cand.missing_evidence && cand.missing_evidence.length > 0 && (
                    <div className="missing-evidence-box">
                      <h6>❓ Missing Evidence Needed to Confirm:</h6>
                      <span>{cand.missing_evidence.join(', ')}</span>
                    </div>
                  )}

                  {/* Verification Question & Action */}
                  {(cand.verification_question || cand.verification_action) && (
                    <div className="verification-path-box mt-3 p-3 bg-opacity-20 rounded border border-cyan-500/30">
                      <h6>🔬 Hypothesis Verification Path:</h6>
                      {cand.verification_question && (
                        <div className="mb-1"><strong>Verification Question:</strong> {cand.verification_question}</div>
                      )}
                      {cand.verification_action && (
                        <div className="mb-2"><strong>Verification Action:</strong> {cand.verification_action}</div>
                      )}

                      {/* Interactive Verification Buttons */}
                      {activeVerificationCand === cand.candidate_id ? (
                        <div className="verif-execution-panel mt-2 p-2 rounded bg-black/40 border border-slate-700">
                          <input
                            type="text"
                            placeholder="Add verification notes (optional)..."
                            value={verifNotes}
                            onChange={(e) => setVerifNotes(e.target.value)}
                            className="notes-input mb-2 text-xs"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleVerifyHypothesis(cand.candidate_id, 'CONFIRMED')}
                              className="btn-decision btn-confirm text-xs"
                            >
                              ✓ Record: CONFIRMED
                            </button>
                            <button
                              onClick={() => handleVerifyHypothesis(cand.candidate_id, 'DISPROVED')}
                              className="btn-decision btn-reject text-xs"
                            >
                              ✕ Record: DISPROVED
                            </button>
                            <button
                              onClick={() => handleVerifyHypothesis(cand.candidate_id, 'INCONCLUSIVE')}
                              className="btn-decision btn-uncertain text-xs"
                            >
                              ? Record: INCONCLUSIVE
                            </button>
                            <button
                              onClick={() => setActiveVerificationCand(null)}
                              className="btn-undo-rejection text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setActiveVerificationCand(cand.candidate_id)}
                          className="btn-decision btn-confirm text-xs mt-1"
                        >
                          🔬 Execute Hypothesis Verification
                        </button>
                      )}
                    </div>
                  )}

                  {/* Evidence Zero Confirmation Override Dialog */}
                  {showOverrideDialog === cand.candidate_id && (
                    <div className="override-dialog p-3 mt-2 rounded border border-amber-500 bg-amber-950/40">
                      <p className="text-xs text-amber-200 font-bold">
                        ⚠️ Confirmation Blocked: Candidate has 0 supporting evidence items.
                      </p>
                      <p className="text-xs text-amber-300">
                        To confirm without evidence, an explicit engineering override reason is mandatory:
                      </p>
                      <input
                        type="text"
                        placeholder="Enter explicit override reason (min 5 chars)..."
                        value={overrideInput[cand.candidate_id] || ''}
                        onChange={(e) => setOverrideInput(prev => ({ ...prev, [cand.candidate_id]: e.target.value }))}
                        className="notes-input my-2 text-xs"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDecision(cand.candidate_id, 'CONFIRMED', overrideInput[cand.candidate_id])}
                          className="btn-decision btn-confirm text-xs"
                        >
                          Submit Override Confirmation
                        </button>
                        <button
                          onClick={() => setShowOverrideDialog(null)}
                          className="btn-undo-rejection text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Decision Audit Trail History */}
                  {cand.decision_history && cand.decision_history.length > 0 && (
                    <div className="decision-history-audit p-2 mt-2 rounded bg-slate-900/60 border border-slate-800 text-xs">
                      <strong className="text-slate-400">📜 Governance Audit Log ({cand.decision_history.length} events):</strong>
                      <ul className="mt-1 space-y-1">
                        {cand.decision_history.map((d: RcaDecisionAuditEntry) => (
                          <li key={d.id} className="text-slate-300 font-mono">
                            [{new Date(d.createdAt).toLocaleTimeString()}] {d.actorId} marked {d.decision} (AI Conf at time: {d.aiConfidenceAtDecision}%) {d.notes ? `| Note: "${d.notes}"` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Human-in-the-Loop Feedback Controls */}
                  <div className="human-feedback-bar mt-3">
                    <div className="notes-inline-input">
                      <input
                        type="text"
                        placeholder="Add engineering notes / rejection reason..."
                        value={notesInput[cand.candidate_id] || ''}
                        onChange={(e) => setNotesInput(prev => ({ ...prev, [cand.candidate_id]: e.target.value }))}
                        className="notes-input"
                      />
                    </div>
                    <div className="feedback-btn-group">
                      <button
                        onClick={() => handleDecision(cand.candidate_id, 'CONFIRMED')}
                        className={`btn-decision btn-confirm ${cand.human_decision === 'CONFIRMED' ? 'active' : ''}`}
                      >
                        ✓ Confirm Hypothesis
                      </button>

                      <button
                        onClick={() => handleDecision(cand.candidate_id, 'REJECTED')}
                        className={`btn-decision btn-reject ${cand.human_decision === 'REJECTED' ? 'active' : ''}`}
                      >
                        ✕ Reject Hypothesis
                      </button>

                      <button
                        onClick={() => handleDecision(cand.candidate_id, 'UNCERTAIN')}
                        className={`btn-decision btn-uncertain ${cand.human_decision === 'UNCERTAIN' ? 'active' : ''}`}
                      >
                        ❓ Mark Uncertain
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* REJECTED CANDIDATES COLLAPSIBLE SECTION */}
      {rca.rejectedCandidates.length > 0 && (
        <div className="rejected-candidates-section mt-4">
          <button onClick={() => setShowRejected(!showRejected)} className="btn-toggle-rejected">
            {showRejected ? '▼ Hide Rejected Hypotheses' : `▶ View Rejected Hypotheses (${rca.rejectedCandidates.length})`}
          </button>

          {showRejected && (
            <div className="rejected-list mt-3">
              {rca.rejectedCandidates.map((cand: RcaCandidate) => (
                <div key={cand.candidate_id} className="rca-candidate-card rejected">
                  <div className="cand-header">
                    <h5>{cand.title}</h5>
                    <div className="flex gap-2">
                      <span className="decision-pill decision-rejected">❌ Explicitly Rejected</span>
                      {cand.previously_rejected_new_evidence && (
                        <span className="decision-pill" style={{ background: '#78350f', color: '#fde68a' }}>
                          Previously rejected — new evidence detected
                        </span>
                      )}
                    </div>
                  </div>
                  <p>{cand.description}</p>
                  {cand.human_decision_notes && (
                    <div className="decision-notes-box">
                      <strong>Rejection Reason:</strong> {cand.human_decision_notes}
                    </div>
                  )}
                  <button
                    onClick={() => handleDecision(cand.candidate_id, 'NONE')}
                    className="btn-undo-rejection mt-2"
                  >
                    ↻ Reset Hypothesis State
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
