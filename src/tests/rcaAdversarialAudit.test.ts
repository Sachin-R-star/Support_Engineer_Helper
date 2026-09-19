import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../backend/database/db';
import { RcaEngine } from '../backend/services/rcaEngine';
import { MemoryService } from '../backend/services/memoryService';
import { IncidentRepository } from '../backend/database/repositories/incidentRepo';
import { TriageService } from '../backend/services/triageService';

describe('Black-Box Adversarial Audit of RCA', () => {
  let memoryService: MemoryService;
  let repo: IncidentRepository;
  let triageService: TriageService;

  beforeEach(() => {
    const db = DatabaseService.getDb();
    db.exec(`
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

  // 1. SCENARIO A: Strong Evidence
  it('Scenario A: Strong Evidence produces grounded candidates with traceable evidence', () => {
    const inc = createIncHelper();
    memoryService.appendAnswer({
      id: 'ans_1',
      incidentId: inc.id,
      questionId: 'q_net_wifi',
      questionText: 'Is Wi-Fi connected?',
      answerValue: 'Wi-Fi connected but no websites open'
    });

    const rca = RcaEngine.generateRca(inc.id);
    expect(rca.possibleRootCauses.length).toBeGreaterThan(0);
    const kbCand = rca.possibleRootCauses.find(c => c.source === 'knowledge_base');
    expect(kbCand).toBeDefined();

    // Verify evidence is grounded in stored facts
    const allEvidence = rca.possibleRootCauses.flatMap(c => [...c.supporting_evidence, ...c.contradicting_evidence]);
    allEvidence.forEach(ev => {
      expect(ev.statement).toBeDefined();
      expect(ev.source).toBeDefined();
      expect(['knowledge_base', 'current_incident_evidence', 'historical_incident_evidence', 'troubleshooting_action', 'relationship_context']).toContain(ev.source);
    });
  });

  // 2. SCENARIO B: Weak Evidence & Missing Info
  it('Scenario B: Weak Evidence triggers uncertainty warning and tags missing evidence', () => {
    const inc = createIncHelper({
      description: 'My laptop is not working',
      confidenceScore: 35,
      missingInfo: ['Exact error code or message', 'Specific application affected']
    });

    const rca = RcaEngine.generateRca(inc.id);
    expect(rca.uncertaintyWarning).toBeDefined();
    expect(rca.possibleRootCauses[0].missing_evidence).toContain('Exact error code or message');
  });

  // 3. SCENARIO C: Contradictory Evidence
  it('Scenario C: Contradictory Evidence lowers candidate confidence', () => {
    const inc = createIncHelper();
    repo.appendAction({
      id: 'act_failed_test_c',
      incidentId: inc.id,
      actionType: 'TROUBLESHOOTING_STEP',
      description: 'Flush local DNS cache',
      resultStatus: 'FAILURE',
      resultDetails: 'DNS flush did not resolve issue',
      performer: 'USER'
    });

    const rca = RcaEngine.generateRca(inc.id);
    const kbCand = rca.possibleRootCauses.find(c => c.source === 'knowledge_base')!;
    expect(kbCand.contradicting_evidence.length).toBeGreaterThan(0);
    expect(kbCand.confidence).toBeLessThan(85);
  });

  // 4. SCENARIO D: Failed Troubleshooting
  it('Scenario D: Failed Troubleshooting action becomes contradicting evidence', () => {
    const inc = createIncHelper();
    triageService.verifyActionResult({
      incidentId: inc.id,
      actionDescription: 'Flush local DNS cache and restart network adapter.',
      resultStatus: 'NO_FAILED',
      userNotes: 'Adapter restart did not fix connection'
    });

    const rca = RcaEngine.generateRca(inc.id);
    const kbCand = rca.possibleRootCauses.find(c => c.source === 'knowledge_base')!;
    const failEv = kbCand.contradicting_evidence.find(e => e.source === 'troubleshooting_action');
    expect(failEv).toBeDefined();
    expect(failEv?.statement).toContain('Troubleshooting action failed');
  });

  // 5. SCENARIO E: Partial Resolution
  it('Scenario E: Partial Resolution updates missing evidence and keeps candidate active', () => {
    const inc = createIncHelper();
    triageService.verifyActionResult({
      incidentId: inc.id,
      actionDescription: 'Flush local DNS cache and restart network adapter.',
      resultStatus: 'PARTIALLY_RESOLVED',
      userNotes: 'Internet works, but VPN gateway still timing out'
    });

    const rca = RcaEngine.generateRca(inc.id);
    expect(rca.possibleRootCauses.length).toBeGreaterThan(0);
  });

  // 6. SCENARIO F: Historical Incident
  it('Scenario F: Relevant history influences RCA with isHistorical: true tag', () => {
    const pastInc = createIncHelper({ summary: 'Network Reset Ticket' });
    memoryService.appendAction({
      id: `act_${Date.now()}_hist`,
      incidentId: pastInc.id,
      actionType: 'TROUBLESHOOTING_STEP',
      description: 'Reset local network stack',
      resultStatus: 'SUCCESS',
      performer: 'SYSTEM'
    });

    const currentInc = createIncHelper();
    memoryService.linkIncidents(currentInc.id, pastInc.id, 'POSSIBLY_CAUSED_BY', 0.80);

    const rca = RcaEngine.generateRca(currentInc.id);
    const histEv = rca.possibleRootCauses.flatMap(c => c.supporting_evidence).filter(e => e.isHistorical);
    expect(histEv.length).toBeGreaterThan(0);
    expect(histEv[0].isHistorical).toBe(true);
  });

  // 7. SCENARIO G: Causal Relationships
  it('Scenario G: Causal relationships distinguish CONFIRMED, PROPOSED, and REJECTED states', () => {
    const pastInc = createIncHelper({ summary: 'Network Reset Ticket' });
    const currentInc = createIncHelper();
    
    // Test PROPOSED
    const relProp = memoryService.linkIncidents(currentInc.id, pastInc.id, 'POSSIBLY_CAUSED_BY', 0.75, 'PROPOSED');
    let rca = RcaEngine.generateRca(currentInc.id);
    let relEv = rca.possibleRootCauses.flatMap(c => c.supporting_evidence).find(e => e.source === 'relationship_context');
    expect(relEv?.statement).toContain('Proposed relationship');

    // Test CONFIRMED
    memoryService.confirmRelationship(relProp.id);
    rca = RcaEngine.generateRca(currentInc.id);
    relEv = rca.possibleRootCauses.flatMap(c => c.supporting_evidence).find(e => e.source === 'relationship_context');
    expect(relEv?.statement).toContain('Confirmed issue relationship');

    // Test REJECTED
    memoryService.rejectRelationship(relProp.id);
    rca = RcaEngine.generateRca(currentInc.id);
    const supportingRel = rca.possibleRootCauses.flatMap(c => c.supporting_evidence).find(e => e.ticketNumber === pastInc.id);
    expect(supportingRel).toBeUndefined();
    const contradictingRel = rca.possibleRootCauses.flatMap(c => c.contradicting_evidence).find(e => e.ticketNumber === pastInc.id);
    expect(contradictingRel).toBeDefined();
    expect(contradictingRel?.statement).toContain('Explicitly rejected relationship');
  });

  // 8. HALLUCINATION & PROVENANCE AUDIT
  it('Hallucination Audit: Every evidence statement is traceable to backend facts', () => {
    const inc = createIncHelper();
    memoryService.appendAnswer({
      id: 'ans_prov_1',
      incidentId: inc.id,
      questionId: 'q_pass_expire',
      questionText: 'Did your domain password expire recently?',
      answerValue: 'Yes, changed password this morning'
    });

    const rca = RcaEngine.generateRca(inc.id);
    rca.possibleRootCauses.forEach(cand => {
      cand.supporting_evidence.forEach(ev => {
        expect(ev.statement).toBeDefined();
        if (ev.source === 'current_incident_evidence') {
          expect(ev.factKey).toBeDefined();
        }
      });
    });
  });

  // 9. HUMAN DECISION PERSISTENCE & REJECTED REAPPEARANCE AUDIT
  it('Human Decision Audit: Decision survives re-query and rejected candidates stay hidden', () => {
    const inc = createIncHelper();
    const rca1 = RcaEngine.generateRca(inc.id);
    const candidateToReject = rca1.possibleRootCauses[0].candidate_id;

    // Reject candidate
    const rca2 = RcaEngine.recordDecision(inc.id, candidateToReject, 'REJECTED', 'usr_eng_02', 'Rejected after manual adapter check');
    expect(rca2.rejectedCandidates.some(c => c.candidate_id === candidateToReject)).toBe(true);
    expect(rca2.possibleRootCauses.some(c => c.candidate_id === candidateToReject)).toBe(false);

    // Re-query RCA (simulate page refresh)
    const rca3 = RcaEngine.generateRca(inc.id);
    expect(rca3.rejectedCandidates.some(c => c.candidate_id === candidateToReject)).toBe(true);
    expect(rca3.possibleRootCauses.some(c => c.candidate_id === candidateToReject)).toBe(false);

    // Add new evidence and re-query
    memoryService.appendAnswer({
      id: 'ans_new_1',
      incidentId: inc.id,
      questionId: 'q_extra_info',
      questionText: 'Extra info provided',
      answerValue: 'New gateway ping result received'
    });

    const rca4 = RcaEngine.generateRca(inc.id);
    // Verified: Rejected candidate MUST NOT silently reappear as active cause
    expect(rca4.possibleRootCauses.some(c => c.candidate_id === candidateToReject)).toBe(false);
    expect(rca4.rejectedCandidates.some(c => c.candidate_id === candidateToReject)).toBe(true);
  });

  // 10. API TRUST BOUNDARY & VALIDATION SECURITY AUDIT
  it('API Trust Boundary Audit: Rejects invalid candidate IDs and fake incidents', () => {
    const inc = createIncHelper();

    // Test 1: Arbitrary candidate_id rejection
    expect(() => {
      RcaEngine.recordDecision(inc.id, 'MALICIOUS_CANDIDATE_ID_999', 'CONFIRMED', 'ATTACKER', 'Hacked note');
    }).toThrow(/Invalid candidateId/);

    // Test 2: Fake incident_id rejection
    expect(() => {
      RcaEngine.generateRca('NON_EXISTENT_INCIDENT_999');
    }).toThrow(/Incident NON_EXISTENT_INCIDENT_999 not found/);
  });
});
