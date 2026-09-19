import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../backend/database/db';
import { RcaEngine } from '../backend/services/rcaEngine';
import { MemoryService } from '../backend/services/memoryService';
import { IncidentRepository } from '../backend/database/repositories/incidentRepo';
import { TriageService } from '../backend/services/triageService';
import { PriorityEngine } from '../backend/services/priorityEngine';
import { TaxonomyService } from '../backend/services/taxonomyService';
import { RecommendationService } from '../backend/services/recommendationService';

describe('Final Adversarial Judge & Product Reliability Audit Suite', () => {
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

  // FLOW A — Simple Issue
  it('FLOW A: Simple issue journey (Internet is down)', () => {
    const state = triageService.startSession('usr_eng_02', 'The internet is down.', 'dev_win_02');
    expect(state.sessionId).toBeDefined();
    expect(state.candidateIssues.length).toBeGreaterThan(0);
    expect(state.selectedIssue || state.candidateIssues[0]).toBeDefined();
    const category = state.selectedIssue?.category || state.candidateIssues[0].category;
    expect(category).toBe('NETWORK');
  });

  // FLOW B — Ambiguous Issue
  it('FLOW B: Ambiguous issue journey (Laptop acting weird)', () => {
    const state = triageService.startSession('usr_eng_02', 'My laptop is acting weird.', 'dev_win_02');
    expect(state.candidateIssues.length).toBeGreaterThan(0);
    expect(state.currentStep).toBe('AMBIGUITY_SELECTION');
    expect(state.confidence).toBeLessThan(80);

    // Disambiguate selection
    const nextState = triageService.selectCandidateIssue(state.sessionId, state.candidateIssues[0].issueTypeId);
    expect(nextState.selectedIssue).toBeDefined();
    expect(nextState.currentStep).toBe('PROGRESSIVE_QUESTION');
  });

  // FLOW C — Complex / High-Impact Issue
  it('FLOW C: Complex high-impact issue with urgency detection (Wi-Fi connected but Teams down, client call in 20 mins)', () => {
    const state = triageService.startSession('usr_exec_01', 'Wi-Fi is connected but no websites work, Teams is down, and I have a client call in 20 minutes.', 'dev_mac_01');
    expect(state.candidateIssues.length).toBeGreaterThan(0);
    
    const issueDef = state.selectedIssue || TaxonomyService.findIssueTypeById(state.candidateIssues[0].issueTypeId)!;
    const prio = PriorityEngine.calculatePriority({
      category: issueDef.category,
      issueType: issueDef,
      user: repo.getUserById('usr_exec_01'),
      answers: {},
      initialQuery: state.originalInput
    });

    expect(prio.priority).toBe('P1_CRITICAL');
    expect(prio.reasoning).toContain('Executive');
  });

  // FLOW D — Off-Topic Input
  it('FLOW D: Off-topic input handling (Chocolate cake recipe)', () => {
    const state = triageService.startSession('usr_eng_02', 'How do I make chocolate cake?', 'dev_win_02');
    expect(state.recoveryPayload).toBeDefined();
    expect(state.recoveryPayload?.reasonCode).toBe('UNRELATED_INPUT');
    expect(state.recoveryPayload?.userMessage).toContain('IT Assistant');
  });

  // FLOW E — Typo / Noisy Input
  it('FLOW E: Typo & noisy input handling (interent is dowwn none of websties are loading)', () => {
    const state = triageService.startSession('usr_eng_02', 'interent is dowwn none of websties are loading', 'dev_win_02');
    expect(state.candidateIssues.length).toBeGreaterThan(0);
    const category = state.selectedIssue?.category || state.candidateIssues[0].category;
    expect(category).toBe('NETWORK');
  });

  // FLOW F — Contradictory Information
  it('FLOW F: Contradictory information detection & confidence handling', () => {
    const state1 = triageService.startSession('usr_eng_02', 'VPN connection drops constantly', 'dev_win_02');
    const qId = state1.currentQuestion?.id || 'q_vpn_status';
    const state2 = triageService.processAnswer(state1.sessionId, qId, 'public_ok', false);
    
    expect(state2.confidence).toBeLessThanOrEqual(75);
  });

  // FLOW G — Troubleshooting Failure
  it('FLOW G: Troubleshooting verification failure (NO_FAILED)', () => {
    const inc = memoryService.createIncident({
      id: `inc_flg_${Date.now()}`,
      ticketNumber: 'INC-2026-8801',
      userId: 'usr_eng_02',
      deviceId: 'dev_win_02',
      category: 'NETWORK',
      issueType: 'vpn_gateway_timeout',
      priority: 'P2_HIGH',
      status: 'OPEN',
      summary: 'VPN timeout',
      description: 'VPN timeout on host',
      missingInfo: [],
      recommendedNextStep: 'Flush local DNS cache and restart network adapter.',
      reasoning: 'Standard VPN triage',
      confidenceScore: 85
    });

    const verifRes = triageService.verifyActionResult({
      incidentId: inc.id,
      actionDescription: inc.recommendedNextStep,
      resultStatus: 'NO_FAILED',
      userNotes: 'Restarted adapter but VPN still times out'
    });

    expect(verifRes.isResolved).toBe(false);
    expect(verifRes.attemptedActionsHistory.length).toBeGreaterThan(0);
    
    const rca = RcaEngine.generateRca(inc.id);
    const failEv = rca.possibleRootCauses.flatMap(c => c.contradicting_evidence).find(e => e.source === 'troubleshooting_action');
    expect(failEv).toBeDefined();
  });

  // FLOW H — Partial Resolution
  it('FLOW H: Partial resolution handling (PARTIALLY_RESOLVED)', () => {
    const inc = memoryService.createIncident({
      id: `inc_flh_${Date.now()}`,
      ticketNumber: 'INC-2026-8802',
      userId: 'usr_eng_02',
      deviceId: 'dev_win_02',
      category: 'NETWORK',
      issueType: 'vpn_gateway_timeout',
      priority: 'P2_HIGH',
      status: 'OPEN',
      summary: 'VPN timeout',
      description: 'VPN timeout on host',
      missingInfo: [],
      recommendedNextStep: 'Flush local DNS cache',
      reasoning: 'VPN triage',
      confidenceScore: 85
    });

    const verifRes = triageService.verifyActionResult({
      incidentId: inc.id,
      actionDescription: inc.recommendedNextStep,
      resultStatus: 'PARTIALLY_RESOLVED',
      userNotes: 'Internet works now, but internal portal times out'
    });

    expect(verifRes.isResolved).toBe(false);
    expect(verifRes.updatedIncidentStatus).toBe('IN_PROGRESS');
  });

  // FLOW I — Something Changed
  it('FLOW I: Something changed follow-up incident creation & linking', () => {
    const inc = memoryService.createIncident({
      id: `inc_fli_${Date.now()}`,
      ticketNumber: 'INC-2026-8803',
      userId: 'usr_eng_02',
      deviceId: 'dev_win_02',
      category: 'NETWORK',
      issueType: 'vpn_gateway_timeout',
      priority: 'P2_HIGH',
      status: 'OPEN',
      summary: 'VPN timeout',
      description: 'VPN timeout on host',
      missingInfo: [],
      recommendedNextStep: 'Flush local DNS cache',
      reasoning: 'VPN triage',
      confidenceScore: 85
    });

    const verifRes = triageService.verifyActionResult({
      incidentId: inc.id,
      actionDescription: inc.recommendedNextStep,
      resultStatus: 'SOMETHING_CHANGED',
      userNotes: 'VPN reconnected but Outlook is now asking for password'
    });

    expect(verifRes.followUpIncident).toBeDefined();
    expect(verifRes.followUpIncident?.ticketNumber).toBeDefined();

    const timeline = memoryService.getIncidentTimeline(inc.id);
    expect(timeline.relationships.length).toBeGreaterThan(0);
  });

  // FLOW J — Human RCA Governance
  it('FLOW J: Human RCA governance complete state audit trail', () => {
    const inc = memoryService.createIncident({
      id: `inc_flj_${Date.now()}`,
      ticketNumber: 'INC-2026-8804',
      userId: 'usr_eng_02',
      deviceId: 'dev_win_02',
      category: 'NETWORK',
      issueType: 'vpn_gateway_timeout',
      priority: 'P2_HIGH',
      status: 'OPEN',
      summary: 'VPN timeout',
      description: 'VPN timeout on host',
      missingInfo: [],
      recommendedNextStep: 'Flush DNS',
      reasoning: 'VPN triage',
      confidenceScore: 85
    });

    memoryService.appendAnswer({
      id: `ans_gov_flj`,
      incidentId: inc.id,
      questionId: 'q_vpn_check',
      questionText: 'Is VPN failing?',
      answerValue: 'yes_gateway_timeout'
    });

    const rca1 = RcaEngine.generateRca(inc.id);
    const candId = rca1.possibleRootCauses[0].candidate_id;

    // Confirm candidate
    const rca2 = RcaEngine.recordDecision(inc.id, candId, 'CONFIRMED', 'usr_eng_02', 'Confirmed via host trace');
    expect(rca2.verifiedRootCause?.candidate_id).toBe(candId);
    expect(rca2.verifiedRootCause?.governance_state).toBe('HUMAN_CONFIRMED');

    // Reject candidate with reason
    const rca3 = RcaEngine.recordDecision(inc.id, candId, 'REJECTED', 'usr_agent_01', 'Disproven after firewall audit');
    expect(rca3.rejectedCandidates.some(c => c.candidate_id === candId)).toBe(true);

    // Multi-engineer conflict detection check
    const rejCand = rca3.rejectedCandidates.find(c => c.candidate_id === candId);
    expect(rejCand?.governance_conflict).toBe(true);
  });

  // DATA CONSISTENCY & SECURITY SANITIZATION
  it('Data Consistency: Incident timeline maintains exact answers, actions, events, and relationships', () => {
    const inc = memoryService.createIncident({
      id: `inc_cons_${Date.now()}`,
      ticketNumber: 'INC-2026-8805',
      userId: 'usr_exec_01',
      deviceId: 'dev_mac_01',
      category: 'ACCOUNT',
      issueType: 'account_lockout_sso',
      priority: 'P1_CRITICAL',
      status: 'OPEN',
      summary: 'Account locked out',
      description: 'SSO account locked after password change',
      missingInfo: [],
      recommendedNextStep: 'Unlock account via AD',
      reasoning: 'VIP Account lockout',
      confidenceScore: 90
    });

    memoryService.appendAnswer({
      id: 'ans_c1_judge',
      incidentId: inc.id,
      questionId: 'q_lockout',
      questionText: 'Are you locked out of all SSO apps?',
      answerValue: 'Yes all apps'
    });

    memoryService.appendAction({
      id: 'act_c1_judge',
      incidentId: inc.id,
      actionType: 'MANUAL_ACTION',
      description: 'Triggered AD unlock',
      performer: 'SYSTEM'
    });

    const timeline = memoryService.getIncidentTimeline(inc.id);
    expect(timeline.incident.id).toBe(inc.id);
    expect(timeline.user?.name).toBe('Alex Morgan');
    expect(timeline.device?.name).toBe('Alex-MacBookPro16');
    expect(timeline.answers.length).toBe(1);
    expect(timeline.actions.length).toBe(1);
    expect(timeline.events.length).toBeGreaterThan(0);
  });
});
