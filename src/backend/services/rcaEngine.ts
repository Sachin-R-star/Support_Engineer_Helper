import { IncidentRepository } from '../database/repositories/incidentRepo';
import { MemoryService } from './memoryService';
import { TaxonomyService } from './taxonomyService';
import { 
  RcaCandidate, 
  RcaPayload, 
  RcaEvidenceItem, 
  RcaHumanDecisionType, 
  RcaGovernanceState,
  RcaVerificationOutcome,
  RcaVerificationRecord,
  RcaDecisionAuditEntry
} from '../models';

export class RcaEngine {
  private static repo = new IncidentRepository();
  private static memoryService = new MemoryService();

  /**
   * Generates Explainable Root Cause Analysis (RCA) payload.
   * Grounded strictly in stored answers, actions, evidence, relationships, and Knowledge Base.
   */
  public static generateRca(incidentId: string): RcaPayload {
    const incident = this.repo.getIncidentById(incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found`);

    const answers = this.repo.getAnswersForIncident(incidentId);
    const actions = this.repo.getActionsForIncident(incidentId);
    const evidence = this.repo.getEvidenceForIncident(incidentId);
    const relationships = this.repo.getRelationshipsForIncident(incidentId);
    const humanDecisions = this.repo.getRcaHumanDecisions(incidentId);
    const verifications = this.repo.getRcaVerifications(incidentId);

    const issueType = TaxonomyService.findIssueTypeById(incident.issueType) || TaxonomyService.getFallbackIssueType();
    const refinedDisplayName = TaxonomyService.getRefinedIssueDisplayName(
      issueType,
      incident.description,
      answers
    );

    // Group decisions and verifications by candidate ID
    const decisionsByCandidate = new Map<string, typeof humanDecisions>();
    humanDecisions.forEach(d => {
      const list = decisionsByCandidate.get(d.candidateId) || [];
      list.push(d);
      decisionsByCandidate.set(d.candidateId, list);
    });

    const verificationsByCandidate = new Map<string, typeof verifications>();
    verifications.forEach(v => {
      const list = verificationsByCandidate.get(v.candidateId) || [];
      list.push(v);
      verificationsByCandidate.set(v.candidateId, list);
    });

    // Retrieve compact relevant historical context (same user/device/category)
    const memoryContext = this.memoryService.getRelevantMemoryContext(
      incident.userId,
      incident.category,
      incident.issueType,
      incident.deviceId,
      incident.description
    );

    const candidates: RcaCandidate[] = [];

    // 1. Primary Knowledge Base Grounded Cause Candidate
    const kbCandidateId = `rca_kb_${issueType.id}`;
    const kbSupportingEv: RcaEvidenceItem[] = [
      {
        id: `ev_kb_def_${issueType.id}`,
        statement: `Knowledge Base Playbook '${issueType.display_name}' matches category ${issueType.category} (${issueType.subdomain})`,
        source: 'knowledge_base',
        isHistorical: false
      }
    ];

    answers.forEach(ans => {
      if (!ans.answerValue.includes('UNSURE')) {
        kbSupportingEv.push({
          id: `ev_ans_${ans.questionId}`,
          statement: `User confirmed: ${ans.questionText} = "${ans.answerValue}"`,
          source: 'current_incident_evidence',
          isHistorical: false,
          factKey: ans.questionId
        });
      }
    });

    const kbContradictingEv: RcaEvidenceItem[] = [];
    actions.forEach(act => {
      if (act.resultStatus && /FAILURE|NO_FAILED|NO|FAILED/i.test(act.resultStatus)) {
        kbContradictingEv.push({
          id: `ev_act_fail_${act.id}`,
          statement: `Troubleshooting action failed: "${act.description}" (${act.resultDetails || 'No improvement'})`,
          source: 'troubleshooting_action',
          isHistorical: false,
          traceableEventId: act.id
        });
      }
    });

    // Handle Relationship Evidence
    relationships.forEach(rel => {
      const targetId = rel.sourceIncidentId === incidentId ? rel.targetIncidentId : rel.sourceIncidentId;
      if (rel.status === 'CONFIRMED') {
        kbSupportingEv.push({
          id: `ev_rel_conf_${rel.id}`,
          statement: `Confirmed issue relationship (${rel.relationshipType.replace(/_/g, ' ')}) with linked ticket ${targetId}`,
          source: 'relationship_context',
          isHistorical: true,
          ticketNumber: targetId
        });
      } else if (rel.status === 'REJECTED') {
        kbContradictingEv.push({
          id: `ev_rel_rej_${rel.id}`,
          statement: `Explicitly rejected relationship with ticket ${targetId}`,
          source: 'relationship_context',
          isHistorical: true,
          ticketNumber: targetId
        });
      } else if (rel.status === 'PROPOSED') {
        kbSupportingEv.push({
          id: `ev_rel_prop_${rel.id}`,
          statement: `Proposed relationship (${rel.relationshipType.replace(/_/g, ' ')}) with ticket ${targetId}`,
          source: 'relationship_context',
          isHistorical: true,
          ticketNumber: targetId
        });
      }
    });

    let kbConfidence = Math.max(30, Math.min(95, incident.confidenceScore - (kbContradictingEv.length * 15)));

    candidates.push({
      candidate_id: kbCandidateId,
      title: `${issueType.display_name} Root Cause Path`,
      description: issueType.description,
      confidence: kbConfidence,
      supporting_evidence: kbSupportingEv,
      contradicting_evidence: kbContradictingEv,
      missing_evidence: incident.missingInfo || issueType.required_information,
      verification_question: issueType.diagnostic_questions[0]?.question_text || 'Is this issue recurring across other systems?',
      verification_action: issueType.troubleshooting_steps[0] || 'Verify system network and hardware configuration.',
      source: 'knowledge_base',
      governance_state: 'AI_HYPOTHESIS',
      human_decision: 'NONE'
    });

    // 2. Subdomain Specific Cause Candidates
    if (issueType.category === 'NETWORK' || issueType.subdomain === 'VPN' || issueType.subdomain === 'NETWORK') {
      candidates.push({
        candidate_id: `rca_sub_dns_${issueType.id}`,
        title: 'DNS Resolution or Regional Gateway Failure',
        description: 'Local host DNS cache failure or regional IPSec gateway handshake timeout.',
        confidence: Math.max(25, kbConfidence - 10),
        supporting_evidence: kbSupportingEv.filter(e => e.source !== 'relationship_context'),
        contradicting_evidence: kbContradictingEv,
        missing_evidence: ['Local DNS lookup ping test result'],
        verification_question: 'Can you resolve internal hostnames or open websites via IP address?',
        verification_action: 'Flush local DNS cache via ipconfig /flushdns or reconnect VPN gateway.',
        source: 'knowledge_base',
        governance_state: 'AI_HYPOTHESIS',
        human_decision: 'NONE'
      });
    }

    if (issueType.category === 'ACCOUNT' || issueType.subdomain === 'SECURITY' || issueType.subdomain === 'EMAIL') {
      candidates.push({
        candidate_id: `rca_sub_sso_${issueType.id}`,
        title: 'Active Directory / SSO Credential Token Mismatch',
        description: 'Windows Credential Manager cached stale token following account password update.',
        confidence: Math.max(25, kbConfidence - 5),
        supporting_evidence: kbSupportingEv,
        contradicting_evidence: kbContradictingEv,
        missing_evidence: ['Webmail (OWA) authentication status'],
        verification_question: 'Does logging into Outlook Web Access (OWA) work with your new password?',
        verification_action: 'Clear generic credentials from Windows Credential Manager and re-authenticate.',
        source: 'knowledge_base',
        governance_state: 'AI_HYPOTHESIS',
        human_decision: 'NONE'
      });
    }

    // 3. Historical Causal Action Candidate
    if (memoryContext.hasPrecedingCausalAction && memoryContext.recentExecutedActions.length > 0) {
      const precedingAct = memoryContext.recentExecutedActions[0];
      candidates.push({
        candidate_id: `rca_hist_act_${precedingAct.incidentTicket}`,
        title: `Preceding Action Influence: ${precedingAct.description}`,
        description: `Troubleshooting action '${precedingAct.description}' on ${precedingAct.incidentTicket} is a possible contributing factor because this issue occurred shortly after.`,
        confidence: 70,
        supporting_evidence: [
          {
            id: `ev_hist_act_${precedingAct.incidentTicket}`,
            statement: `Historical action '${precedingAct.description}' recorded on ticket ${precedingAct.incidentTicket} (${precedingAct.resultStatus})`,
            source: 'historical_incident_evidence',
            isHistorical: true,
            ticketNumber: precedingAct.incidentTicket
          }
        ],
        contradicting_evidence: [],
        missing_evidence: ['System interface restart confirmation'],
        verification_question: `Did this symptom begin immediately following '${precedingAct.description}'?`,
        verification_action: 'Re-bind virtual network adapter and verify routing configuration.',
        source: 'troubleshooting_action',
        governance_state: 'AI_HYPOTHESIS',
        human_decision: 'NONE'
      });
    }

    // 4. Attach Verification Results & Decision Audit History
    const latestFactTimestamp = Math.max(
      ...answers.map(a => new Date(a.createdAt).getTime()),
      ...actions.map(a => new Date(a.createdAt).getTime()),
      0
    );

    const possibleRootCauses: RcaCandidate[] = [];
    const rejectedCandidates: RcaCandidate[] = [];
    let verifiedRootCause: RcaCandidate | undefined = undefined;

    candidates.forEach(cand => {
      // Process Verification History
      const candVerifs = verificationsByCandidate.get(cand.candidate_id) || [];
      if (candVerifs.length > 0) {
        cand.verification_history = candVerifs.map(v => ({
          id: v.id,
          incidentId: v.incidentId,
          candidateId: v.candidateId,
          verificationTarget: v.verificationTarget,
          result: v.result,
          notes: v.notes,
          actorId: v.actorId,
          createdAt: v.createdAt
        }));
        cand.latest_verification = cand.verification_history[cand.verification_history.length - 1];

        // Verification outcome effects
        if (cand.latest_verification.result === 'CONFIRMED') {
          cand.supporting_evidence.push({
            id: `ev_verif_conf_${cand.latest_verification.id}`,
            statement: `Hypothesis verified by engineer: ${cand.latest_verification.verificationTarget}`,
            source: 'troubleshooting_action',
            isHistorical: false,
            traceableEventId: cand.latest_verification.id
          });
        } else if (cand.latest_verification.result === 'DISPROVED') {
          cand.contradicting_evidence.push({
            id: `ev_verif_disp_${cand.latest_verification.id}`,
            statement: `Hypothesis disproven by engineer: ${cand.latest_verification.verificationTarget}`,
            source: 'troubleshooting_action',
            isHistorical: false,
            traceableEventId: cand.latest_verification.id
          });
        }
      }

      // Process Decision History
      const candDecisions = decisionsByCandidate.get(cand.candidate_id) || [];
      if (candDecisions.length > 0) {
        cand.decision_history = candDecisions.map(d => ({
          id: d.id,
          incidentId: d.incidentId,
          candidateId: d.candidateId,
          decision: d.decision,
          actorId: d.actorId,
          notes: d.notes,
          aiConfidenceAtDecision: d.aiConfidenceAtDecision,
          evidenceSnapshot: d.evidenceSnapshot,
          createdAt: d.createdAt
        }));

        const latestDec = candDecisions[candDecisions.length - 1];
        cand.human_decision = latestDec.decision;
        cand.human_decision_actor = latestDec.actorId;
        cand.human_decision_timestamp = latestDec.createdAt;
        cand.human_decision_notes = latestDec.notes;
        cand.ai_confidence_at_decision = latestDec.aiConfidenceAtDecision;
        cand.evidence_snapshot = latestDec.evidenceSnapshot;

        // Multi-engineer Conflict Policy: Check for differing decisions from different actors
        const distinctActorDecisions = new Map<string, RcaHumanDecisionType>();
        candDecisions.forEach(d => distinctActorDecisions.set(d.actorId, d.decision));
        if (distinctActorDecisions.size > 1) {
          const uniqueDecisions = new Set(Array.from(distinctActorDecisions.values()));
          if (uniqueDecisions.size > 1) {
            cand.governance_conflict = true;
          }
        }
      }

      // Compute Governance State
      if (cand.latest_verification?.result === 'CONFIRMED') {
        cand.governance_state = 'VERIFIED_BY_EVIDENCE';
      } else if (cand.human_decision === 'CONFIRMED') {
        cand.governance_state = 'HUMAN_CONFIRMED';
      } else if (cand.human_decision === 'REJECTED') {
        cand.governance_state = 'HUMAN_REJECTED';
      } else if (cand.human_decision === 'UNCERTAIN') {
        cand.governance_state = 'HUMAN_UNCERTAIN';
      } else {
        cand.governance_state = 'AI_HYPOTHESIS';
      }

      // Check Rejection Resurrection Policy
      if (cand.human_decision === 'REJECTED' && cand.human_decision_timestamp) {
        const decisionTime = new Date(cand.human_decision_timestamp).getTime();
        if (latestFactTimestamp > decisionTime) {
          cand.previously_rejected_new_evidence = true;
        }
      }

      // Determine active list & VERIFIED ROOT CAUSE
      if (cand.governance_state === 'VERIFIED_BY_EVIDENCE' || (cand.governance_state === 'HUMAN_CONFIRMED' && (cand.supporting_evidence.length > 0 || !!cand.human_decision_notes))) {
        verifiedRootCause = cand;
        possibleRootCauses.push(cand);
      } else if (cand.governance_state === 'HUMAN_REJECTED') {
        rejectedCandidates.push(cand);
      } else {
        possibleRootCauses.push(cand);
      }
    });

    // Sort active candidates by confidence descending
    possibleRootCauses.sort((a, b) => b.confidence - a.confidence);

    let uncertaintyWarning: string | undefined = undefined;
    if (possibleRootCauses.length === 0 || (possibleRootCauses[0] && possibleRootCauses[0].confidence < 50)) {
      uncertaintyWarning = 'Insufficient evidence to definitively confirm candidate. Targeted verification question or action recommended.';
    } else if (possibleRootCauses[0]?.contradicting_evidence.length > 0) {
      uncertaintyWarning = 'Contradicting troubleshooting evidence detected. Perform verification action to narrow root cause.';
    }

    return {
      incidentId,
      currentDiagnosis: `Current Triage Diagnosis: ${refinedDisplayName} (${issueType.category}/${issueType.subdomain})`,
      confidenceScore: incident.confidenceScore,
      possibleRootCauses,
      verifiedRootCause,
      rejectedCandidates,
      uncertaintyWarning,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Persists human decision (CONFIRMED / REJECTED / UNCERTAIN) for a specific RCA candidate.
   * Enforces security, trust boundaries, evidence rules, and rejection note requirements.
   */
  public static recordDecision(
    incidentId: string,
    candidateId: string,
    decision: RcaHumanDecisionType,
    actorId = 'USER',
    notes?: string,
    overrideReason?: string
  ): RcaPayload {
    const initialRca = this.generateRca(incidentId);
    const cand = [...initialRca.possibleRootCauses, ...initialRca.rejectedCandidates].find(c => c.candidate_id === candidateId);

    if (!cand) {
      throw new Error(`Invalid candidateId '${candidateId}' for incident ${incidentId}`);
    }

    // 1. Evidence Requirement for Confirmation
    if (decision === 'CONFIRMED') {
      const meaningfulEv = cand.supporting_evidence.filter(e => e.source !== 'knowledge_base' || e.factKey || e.traceableEventId);
      const hasSupportingEv = meaningfulEv.length > 0;
      const hasOverride = (overrideReason && overrideReason.trim().length >= 5) || (notes && notes.trim().length >= 5);
      if (!hasSupportingEv && !hasOverride) {
        throw new Error('Cannot confirm root cause candidate with zero supporting evidence without an explicit override reason.');
      }
    }

    // 2. Reason Requirement for Rejection
    if (decision === 'REJECTED') {
      const reasonText = notes || overrideReason;
      if (!reasonText || reasonText.trim().length < 3) {
        throw new Error('Rejection reason/notes required when rejecting a root cause hypothesis.');
      }
    }

    const aiConfidenceAtDecision = cand.confidence;
    const evidenceSnapshot = [...cand.supporting_evidence, ...cand.contradicting_evidence];

    this.repo.recordRcaHumanDecision(
      incidentId,
      candidateId,
      decision,
      actorId,
      notes || overrideReason,
      aiConfidenceAtDecision,
      evidenceSnapshot
    );

    return this.generateRca(incidentId);
  }

  /**
   * Records explicit hypothesis verification outcome (CONFIRMED / DISPROVED / INCONCLUSIVE).
   */
  public static recordVerification(
    incidentId: string,
    candidateId: string,
    result: RcaVerificationOutcome,
    notes?: string,
    actorId = 'USER'
  ): RcaPayload {
    const initialRca = this.generateRca(incidentId);
    const cand = [...initialRca.possibleRootCauses, ...initialRca.rejectedCandidates].find(c => c.candidate_id === candidateId);

    if (!cand) {
      throw new Error(`Invalid candidateId '${candidateId}' for incident ${incidentId}`);
    }

    if (!['CONFIRMED', 'DISPROVED', 'INCONCLUSIVE'].includes(result)) {
      throw new Error(`Invalid verification result '${result}'`);
    }

    const verificationTarget = cand.verification_action || cand.verification_question || cand.title;

    this.repo.recordRcaVerification(
      incidentId,
      candidateId,
      verificationTarget,
      result,
      notes,
      actorId
    );

    return this.generateRca(incidentId);
  }
}
