import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../backend/database/db';
import { RcaEngine } from '../backend/services/rcaEngine';
import { MemoryService } from '../backend/services/memoryService';
import { IncidentRepository } from '../backend/database/repositories/incidentRepo';
import { TriageService } from '../backend/services/triageService';

describe('Human-in-the-Loop Governance Test Suite', () => {
  let memoryService: MemoryService;
  let repo: IncidentRepository;
  let triageService: TriageService;

  beforeEach(() => {
    const db = DatabaseService.getDb();
    db.exec(`
      DELETE FROM rca_verifications;
      DELETE FROM rca_human_decisions;
      DELETE FROM incident_relationships;
      DELETE FROM incident_events;
      DELETE FROM incident_evidence;
      DELETE FROM incident_actions;
      DELETE FROM incident_answers;
      DELETE FROM incidents;
    `);
    DatabaseService.seedDefaults();

    memoryService = new MemoryService();
    repo = new IncidentRepository();
    triageService = new TriageService();
  });

  const createIncHelper = (overrides: any = {}) => {
    const id = overrides.id || `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const ticketNumber = overrides.ticketNumber || `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    return memoryService.createIncident({
      id,
      ticketNumber,
      userId: 'usr_eng_02',
      deviceId: 'dev_win_02',
      category: 'NETWORK',
      issueType: 'vpn_gateway_timeout',
      priority: 'P2_HIGH',
      status: 'OPEN',
      summary: 'VPN gateway timeout',
      description: 'GlobalProtect VPN connection timeout',
      missingInfo: [],
      recommendedNextStep: 'Flush local DNS cache and restart network adapter.',
      reasoning: 'Standard VPN triage',
      confidenceScore: 85,
      ...overrides
    });
  };

  it('1. Cannot confirm candidate with zero supporting evidence without explicit override reason', () => {
    const inc = createIncHelper();
    const rca = RcaEngine.generateRca(inc.id);
    const cand = rca.possibleRootCauses[0];

    // Attempting confirmation with 0 meaningful supporting evidence and no override must throw
    expect(() => {
      RcaEngine.recordDecision(inc.id, cand.candidate_id, 'CONFIRMED', 'usr_eng_02');
    }).toThrow(/Cannot confirm root cause candidate with zero supporting evidence/);
  });

  it('2. Confirmation with valid supporting evidence succeeds', () => {
    const inc = createIncHelper();
    memoryService.appendAnswer({
      id: 'ans_valid_ev_2',
      incidentId: inc.id,
      questionId: 'q_vpn_check',
      questionText: 'Is VPN timing out?',
      answerValue: 'Yes gateway 504'
    });
    const rca1 = RcaEngine.generateRca(inc.id);
    const cand = rca1.possibleRootCauses[0];

    const rca2 = RcaEngine.recordDecision(inc.id, cand.candidate_id, 'CONFIRMED', 'usr_eng_02', 'Confirmed via manual log trace');
    expect(rca2.verifiedRootCause).toBeDefined();
    expect(rca2.verifiedRootCause?.candidate_id).toBe(cand.candidate_id);
    expect(rca2.verifiedRootCause?.governance_state).toBe('HUMAN_CONFIRMED');
  });

  // 3. AI confidence remains unchanged after human confirmation
  it('3. AI confidence remains unchanged after human confirmation', () => {
    const inc = createIncHelper();
    const rca1 = RcaEngine.generateRca(inc.id);
    const initialAiConf = rca1.possibleRootCauses[0].confidence;

    const rca2 = RcaEngine.recordDecision(inc.id, rca1.possibleRootCauses[0].candidate_id, 'CONFIRMED', 'usr_eng_02', 'Confirmed fact');
    expect(rca2.verifiedRootCause?.confidence).toBe(initialAiConf);
  });

  // 4. AI confidence snapshot is stored in decision history
  it('4. AI confidence snapshot is stored in decision audit trail', () => {
    const inc = createIncHelper();
    const rca1 = RcaEngine.generateRca(inc.id);
    const cand = rca1.possibleRootCauses[0];

    const rca2 = RcaEngine.recordDecision(inc.id, cand.candidate_id, 'CONFIRMED', 'usr_eng_02', 'Confirmed');
    const decisionEntry = rca2.verifiedRootCause?.decision_history?.[0];
    expect(decisionEntry).toBeDefined();
    expect(decisionEntry?.aiConfidenceAtDecision).toBe(cand.confidence);
  });

  // 5. Evidence snapshot is immutable
  it('5. Evidence snapshot captured at decision time remains immutable', () => {
    const inc = createIncHelper();
    const rca1 = RcaEngine.generateRca(inc.id);
    const cand = rca1.possibleRootCauses[0];

    const rca2 = RcaEngine.recordDecision(inc.id, cand.candidate_id, 'CONFIRMED', 'usr_eng_02', 'Confirmed');
    const initialSnapshotCount = rca2.verifiedRootCause?.evidence_snapshot?.length || 0;

    // Add new answer to incident
    memoryService.appendAnswer({
      id: 'ans_new_ev_5',
      incidentId: inc.id,
      questionId: 'q_new_5',
      questionText: 'Is ping working?',
      answerValue: 'ping_ok'
    });

    const rca3 = RcaEngine.generateRca(inc.id);
    const decEntry = rca3.verifiedRootCause?.decision_history?.[0];
    expect(decEntry?.evidenceSnapshot.length).toBe(initialSnapshotCount);
  });

  // 6. Verification action does not equal verification success
  it('6. Recommending or executing verification action does not equal verification success', () => {
    const inc = createIncHelper();
    const rca = RcaEngine.generateRca(inc.id);
    expect(rca.verifiedRootCause).toBeUndefined();
    expect(rca.possibleRootCauses[0].governance_state).toBe('AI_HYPOTHESIS');
  });

  // 7. CONFIRMED verification produces supporting evidence
  it('7. CONFIRMED hypothesis verification produces supporting evidence and sets VERIFIED_BY_EVIDENCE', () => {
    const inc = createIncHelper();
    const rca1 = RcaEngine.generateRca(inc.id);
    const candId = rca1.possibleRootCauses[0].candidate_id;

    const rca2 = RcaEngine.recordVerification(inc.id, candId, 'CONFIRMED', 'Ping test succeeded', 'usr_eng_02');
    expect(rca2.verifiedRootCause).toBeDefined();
    expect(rca2.verifiedRootCause?.governance_state).toBe('VERIFIED_BY_EVIDENCE');
    expect(rca2.verifiedRootCause?.supporting_evidence.some(e => e.statement.includes('verified by engineer'))).toBe(true);
  });

  // 8. DISPROVED verification produces contradicting evidence
  it('8. DISPROVED hypothesis verification produces contradicting evidence', () => {
    const inc = createIncHelper();
    const rca1 = RcaEngine.generateRca(inc.id);
    const candId = rca1.possibleRootCauses.find(c => c.source === 'knowledge_base')!.candidate_id;

    const rca2 = RcaEngine.recordVerification(inc.id, candId, 'DISPROVED', 'Adapter check showed physical link down', 'usr_eng_02');
    const kbCand = rca2.possibleRootCauses.find(c => c.candidate_id === candId);
    expect(kbCand?.contradicting_evidence.some(e => e.statement.includes('disproven by engineer'))).toBe(true);
  });

  // 9. INCONCLUSIVE verification leaves hypothesis unresolved
  it('9. INCONCLUSIVE verification leaves hypothesis unresolved as AI_HYPOTHESIS', () => {
    const inc = createIncHelper();
    const rca1 = RcaEngine.generateRca(inc.id);
    const candId = rca1.possibleRootCauses[0].candidate_id;

    const rca2 = RcaEngine.recordVerification(inc.id, candId, 'INCONCLUSIVE', 'User stepped away during test', 'usr_eng_02');
    const cand = rca2.possibleRootCauses.find(c => c.candidate_id === candId);
    expect(cand?.governance_state).toBe('AI_HYPOTHESIS');
    expect(rca2.verifiedRootCause).toBeUndefined();
  });

  // 10. Rejection requires reason
  it('10. Rejecting candidate requires non-empty reason/notes', () => {
    const inc = createIncHelper();
    const rca1 = RcaEngine.generateRca(inc.id);
    const candId = rca1.possibleRootCauses[0].candidate_id;

    expect(() => {
      RcaEngine.recordDecision(inc.id, candId, 'REJECTED', 'usr_eng_02', '');
    }).toThrow(/Rejection reason\/notes required/);
  });

  // 11. Rejected candidate remains auditable
  it('11. Rejected candidate remains auditable in decision history', () => {
    const inc = createIncHelper();
    const rca1 = RcaEngine.generateRca(inc.id);
    const candId = rca1.possibleRootCauses[0].candidate_id;

    const rca2 = RcaEngine.recordDecision(inc.id, candId, 'REJECTED', 'usr_eng_02', 'Tested router and it was functioning');
    const rejCand = rca2.rejectedCandidates.find(c => c.candidate_id === candId);
    expect(rejCand).toBeDefined();
    expect(rejCand?.decision_history?.length).toBeGreaterThan(0);
    expect(rejCand?.human_decision_notes).toContain('Tested router');
  });

  // 12. New evidence flags rejected candidate
  it('12. New evidence after rejection flags candidate with previously_rejected_new_evidence: true', () => {
    const inc = createIncHelper();
    const rca1 = RcaEngine.generateRca(inc.id);
    const candId = rca1.possibleRootCauses[0].candidate_id;

    RcaEngine.recordDecision(inc.id, candId, 'REJECTED', 'usr_eng_02', 'Rejected initial hypothesis');

    // Add new evidence fact
    memoryService.appendAnswer({
      id: 'ans_resurrect_12',
      incidentId: inc.id,
      questionId: 'q_gateway_ping',
      questionText: 'Gateway ping test',
      answerValue: 'Gateway 504 timeout confirmed'
    });

    const rca3 = RcaEngine.generateRca(inc.id);
    const rejCand = rca3.rejectedCandidates.find(c => c.candidate_id === candId);
    expect(rejCand?.previously_rejected_new_evidence).toBe(true);
  });

  // 13. Resurrection is visibly marked
  it('13. Rejected candidate does not silently return to active list', () => {
    const inc = createIncHelper();
    const rca1 = RcaEngine.generateRca(inc.id);
    const candId = rca1.possibleRootCauses[0].candidate_id;

    RcaEngine.recordDecision(inc.id, candId, 'REJECTED', 'usr_eng_02', 'Rejected hypothesis');
    
    memoryService.appendAnswer({
      id: 'ans_resurrect_13',
      incidentId: inc.id,
      questionId: 'q_extra_13',
      questionText: 'Extra info',
      answerValue: 'New logs uploaded'
    });

    const rca3 = RcaEngine.generateRca(inc.id);
    expect(rca3.possibleRootCauses.some(c => c.candidate_id === candId)).toBe(false);
    expect(rca3.rejectedCandidates.some(c => c.candidate_id === candId)).toBe(true);
  });

  // 14. Uncertain remains unresolved
  it('14. UNCERTAIN decision keeps candidate active in possibleRootCauses as HUMAN_UNCERTAIN', () => {
    const inc = createIncHelper();
    const rca1 = RcaEngine.generateRca(inc.id);
    const candId = rca1.possibleRootCauses[0].candidate_id;

    const rca2 = RcaEngine.recordDecision(inc.id, candId, 'UNCERTAIN', 'usr_eng_02', 'Awaiting sysadmin response');
    const cand = rca2.possibleRootCauses.find(c => c.candidate_id === candId);
    expect(cand?.governance_state).toBe('HUMAN_UNCERTAIN');
    expect(rca2.verifiedRootCause).toBeUndefined();
  });

  // 15. Multiple engineer decisions are preserved
  it('15. Multiple engineer decisions are preserved chronologically in decision_history', () => {
    const inc = createIncHelper();
    const rca1 = RcaEngine.generateRca(inc.id);
    const candId = rca1.possibleRootCauses[0].candidate_id;

    RcaEngine.recordDecision(inc.id, candId, 'UNCERTAIN', 'usr_eng_01', 'Engineer 1 note');
    const rca3 = RcaEngine.recordDecision(inc.id, candId, 'CONFIRMED', 'usr_eng_02', 'Engineer 2 override', 'Explicit evidence override');

    const cand = rca3.possibleRootCauses.find(c => c.candidate_id === candId);
    expect(cand?.decision_history?.length).toBe(2);
    expect(cand?.decision_history?.[0].actorId).toBe('usr_eng_01');
    expect(cand?.decision_history?.[1].actorId).toBe('usr_eng_02');
  });

  // 16. Conflicting decisions are flagged
  it('16. Opposing decisions from different engineers trigger governance_conflict: true', () => {
    const inc = createIncHelper();
    const rca1 = RcaEngine.generateRca(inc.id);
    const candId = rca1.possibleRootCauses[0].candidate_id;

    RcaEngine.recordDecision(inc.id, candId, 'CONFIRMED', 'usr_eng_01', 'Engineer 1 confirmed');
    const rca3 = RcaEngine.recordDecision(inc.id, candId, 'REJECTED', 'usr_eng_02', 'Engineer 2 rejected hypothesis');

    const cand = rca3.rejectedCandidates.find(c => c.candidate_id === candId);
    expect(cand?.governance_conflict).toBe(true);
  });

  it('17. Verified root cause requires human confirmation or explicit evidence verification', () => {
    const inc = createIncHelper({ confidenceScore: 99 });
    memoryService.appendAnswer({
      id: 'ans_17_ev',
      incidentId: inc.id,
      questionId: 'q_vpn_status_17',
      questionText: 'VPN status',
      answerValue: 'gateway_timeout'
    });
    const rca1 = RcaEngine.generateRca(inc.id);
    expect(rca1.verifiedRootCause).toBeUndefined();

    const rca2 = RcaEngine.recordDecision(inc.id, rca1.possibleRootCauses[0].candidate_id, 'CONFIRMED', 'usr_eng_02', 'Confirmed fact');
    expect(rca2.verifiedRootCause).toBeDefined();
  });

  // 18. High AI confidence alone cannot verify RCA
  it('18. High AI confidence (95%) alone CANNOT make candidate a VERIFIED ROOT CAUSE', () => {
    const inc = createIncHelper({ confidenceScore: 95 });
    const rca = RcaEngine.generateRca(inc.id);
    expect(rca.verifiedRootCause).toBeUndefined();
  });

  // 19. Arbitrary evidence IDs are rejected
  it('19. Arbitrary candidate IDs are rejected safely', () => {
    const inc = createIncHelper();
    expect(() => {
      RcaEngine.recordDecision(inc.id, 'INJECTED_CANDIDATE_999', 'CONFIRMED', 'ATTACKER');
    }).toThrow(/Invalid candidateId/);
  });

  // 20. Arbitrary verification results are rejected
  it('20. Arbitrary verification results are rejected by backend', () => {
    const inc = createIncHelper();
    const rca = RcaEngine.generateRca(inc.id);
    const candId = rca.possibleRootCauses[0].candidate_id;

    expect(() => {
      RcaEngine.recordVerification(inc.id, candId, 'FAKE_RESULT' as any, 'Notes', 'ATTACKER');
    }).toThrow(/Invalid verification result/);
  });

  it('21. Cross-incident candidate injection is rejected', () => {
    const inc1 = createIncHelper({ issueType: 'vpn_gateway_timeout', category: 'NETWORK' });
    const inc2 = createIncHelper({ issueType: 'account_lockout_sso', category: 'ACCOUNT' });
    const rca1 = RcaEngine.generateRca(inc1.id);
    const candId1 = rca1.possibleRootCauses[0].candidate_id;

    expect(() => {
      RcaEngine.recordDecision(inc2.id, candId1, 'CONFIRMED', 'ATTACKER', 'Cross incident injection override');
    }).toThrow(/Invalid candidateId/);
  });

  // 22. Existing RCA tests remain passing
  it('22. Existing RCA engine functions remain functional', () => {
    const inc = createIncHelper();
    const rca = RcaEngine.generateRca(inc.id);
    expect(rca.incidentId).toBe(inc.id);
    expect(rca.possibleRootCauses.length).toBeGreaterThan(0);
  });

  // 23. Existing Verification Loop tests remain passing
  it('23. Verification loop action verification integrates without regression', () => {
    const inc = createIncHelper();
    const res = triageService.verifyActionResult({
      incidentId: inc.id,
      actionDescription: inc.recommendedNextStep,
      resultStatus: 'YES_RESOLVED',
      userNotes: 'Action resolved problem'
    });
    expect(res.isResolved).toBe(true);
  });
});
