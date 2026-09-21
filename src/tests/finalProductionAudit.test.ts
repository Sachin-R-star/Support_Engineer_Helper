import { describe, it, expect, beforeEach } from 'vitest';
import { TriageService } from '../backend/services/triageService';
import { RcaEngine } from '../backend/services/rcaEngine';
import { IncidentRepository } from '../backend/database/repositories/incidentRepo';
import { DatabaseService } from '../backend/database/db';
import { TaxonomyService } from '../backend/services/taxonomyService';

describe('Final Production End-to-End Audit & Verification Suite', () => {
  let triageService: TriageService;
  let repo: IncidentRepository;

  beforeEach(() => {
    // Ensure test database is initialized & seeded
    DatabaseService.getDb();
    DatabaseService.seedDefaults();
    repo = new IncidentRepository();
    triageService = new TriageService();
  });

  it('1. Mandatory End-to-End Test: Laptop Slowdown & Freezing Scenario', () => {
    const inputQuery =
      "My laptop is extremely slow since this morning. It becomes almost unusable when I open Chrome and Teams together, and sometimes the screen freezes for a few seconds. I have an important meeting in 20 minutes.";

    // Step A: Start Triage Session
    const session = triageService.startSession('usr_exec_01', inputQuery, 'dev_mac_01');
    expect(session.sessionId).toBeDefined();

    // Step B: Question Selection Check
    expect(session.currentQuestion).toBeDefined();
    expect(session.currentQuestion?.id).toBe('q_freeze_symptom');
    expect(session.currentQuestion?.question_text).toContain('Is the entire laptop frozen');

    // Step C: Answer progressive question (Screen/app is frozen, cursor still moves)
    let activeSession = triageService.processAnswer(
      session.sessionId,
      'q_freeze_symptom',
      'partial_cursor_moves'
    );

    // If another question is presented, complete it to finalize session
    if (activeSession.currentStep === 'PROGRESSIVE_QUESTION' && activeSession.currentQuestion) {
      activeSession = triageService.processAnswer(
        activeSession.sessionId,
        activeSession.currentQuestion.id,
        'load_crash'
      );
    }

    // Step D: Verify Finalized Triage Payload
    const finalResult = activeSession.finalTriageResult;
    expect(finalResult).toBeDefined();
    expect(finalResult?.incidentId).toBeDefined();
    const parentIncidentId = finalResult!.incidentId!;

    // 1. Classification & Diagnosis check: Must NOT claim BSOD without evidence
    expect(finalResult?.issueType).not.toContain('BSOD');
    expect(finalResult?.issueType).toContain('System Freeze');

    // 2. Grounded Recommendation & Explanation Context
    expect(finalResult?.recommendation).toBeDefined();
    expect(finalResult?.recommendation?.action).toBeDefined();
    expect(finalResult?.recommendation?.reason).toContain('troubleshooting step');
    expect(finalResult?.recommendation?.reason).not.toContain('VPN');
    expect(finalResult?.recommendation?.action).not.toContain('VPN');

    // 3. Priority & Confidence Separation
    expect(finalResult?.priority).toBeDefined();
    expect(['P1_CRITICAL', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW', 'HIGH', 'MEDIUM', 'CRITICAL']).toContain(finalResult?.priority);
    expect(finalResult?.confidence).toBeGreaterThanOrEqual(0);
    expect(finalResult?.confidence).toBeLessThanOrEqual(100);

    // Verify Priority factors don't include bogus "Critical Infrastructure Affected"
    const parentIncRecord = repo.getIncidentById(parentIncidentId)!;
    expect(parentIncRecord.reasoning).not.toContain('Critical Infrastructure Affected');
    expect(parentIncRecord.reasoning).toContain('Urgent Meeting');

    // Step E: Verification Loop - Action execution & failure handling
    const verifFailure = triageService.verifyActionResult({
      incidentId: parentIncidentId,
      actionDescription: parentIncRecord.recommendedNextStep,
      resultStatus: 'NO_FAILED',
      userNotes: 'Hard power reset did not help'
    });

    expect(verifFailure.updatedIncidentStatus).toBe('IN_PROGRESS');
    expect(verifFailure.isResolved).toBe(false);

    // Step F: Verification Loop - SOMETHING_CHANGED / New Symptom Follow-Up Creation
    const verifChanged = triageService.verifyActionResult({
      incidentId: parentIncidentId,
      actionDescription: verifFailure.nextRecommendedAction || 'Memory Diagnostic',
      resultStatus: 'SOMETHING_CHANGED',
      userNotes: 'VPN connection keeps timing out when attempting remote gateway auth'
    });

    expect(verifChanged.updatedIncidentStatus).toBe('IN_PROGRESS');
    expect(verifChanged.followUpIncident).toBeDefined();

    const followUpId = verifChanged.followUpIncident!.id;
    expect(followUpId).toBeDefined();

    // Step G: Verify Parent vs Follow-Up Isolation
    const parentAfterFollowUp = repo.getIncidentById(parentIncidentId)!;
    const followUpRecord = repo.getIncidentById(followUpId)!;

    // Parent diagnosis remains intact
    expect(parentAfterFollowUp.issueType).toContain('System Freeze');
    expect(parentAfterFollowUp.status).toBe('IN_PROGRESS');

    // Follow-up gets independent diagnosis (VPN)
    expect(followUpRecord.issueType).toContain('vpn');
    expect(followUpRecord.category).toBe('NETWORK');

    // Step H: Repeated Inspection Switching (Parent <-> Follow-Up)
    const parentDetails1 = repo.getIncidentById(parentIncidentId)!;
    const followUpDetails1 = repo.getIncidentById(followUpId)!;
    const parentDetails2 = repo.getIncidentById(parentIncidentId)!;

    expect(parentDetails1.id).toBe(parentIncidentId);
    expect(followUpDetails1.id).toBe(followUpId);
    expect(parentDetails2.id).toBe(parentIncidentId);
    expect(parentDetails1.issueType).not.toEqual(followUpDetails1.issueType);

    // Step I: RCA Inspection Scoping
    const parentRca = RcaEngine.generateRca(parentIncidentId);
    const followUpRca = RcaEngine.generateRca(followUpId);

    expect(parentRca.incidentId).toBe(parentIncidentId);
    expect(followUpRca.incidentId).toBe(followUpId);
    expect(parentRca.currentDiagnosis).toContain('System Freeze');
    expect(followUpRca.currentDiagnosis).toContain('VPN');

    // Step J: Successful Verification Resolves ONLY That Incident
    const resolveRes = triageService.verifyActionResult({
      incidentId: parentIncidentId,
      actionDescription: 'Run Windows Memory Diagnostic tool',
      resultStatus: 'YES_RESOLVED',
      userNotes: 'RAM module seated properly'
    });

    expect(resolveRes.updatedIncidentStatus).toBe('RESOLVED');
    expect(resolveRes.isResolved).toBe(true);

    const parentFinal = repo.getIncidentById(parentIncidentId)!;
    const followUpFinal = repo.getIncidentById(followUpId)!;

    expect(parentFinal.status).toBe('RESOLVED');
    expect(followUpFinal.status).toBe('OPEN'); // Follow-up remains OPEN until resolved independently!
  });

  it('2. Adversarial Test: Consecutive Incidents with Completely Different Categories', () => {
    // Incident A: Account Lockout
    const sessionA = triageService.startSession('usr_exec_01', 'I forgot my Okta password and my account is locked');
    let actA = sessionA;
    if (actA.currentStep === 'AMBIGUITY_SELECTION' && actA.candidateIssues.length > 0) {
      actA = triageService.selectCandidateIssue(actA.sessionId, actA.candidateIssues[0].issueTypeId);
    }
    while (actA.currentStep === 'PROGRESSIVE_QUESTION' && actA.currentQuestion) {
      const q = actA.currentQuestion;
      const optVal = q.id === 'q_historical_causal_check' ? 'no_prior_issue' : (q.options?.[0]?.value || 'sso_domain');
      actA = triageService.processAnswer(actA.sessionId, q.id, optVal);
    }
    const resA = actA.finalTriageResult!;

    // Incident B: Printer Jam
    const sessionB = triageService.startSession('usr_eng_02', 'Document stuck in printer queue and printer spooler says offline');
    let actB = sessionB;
    if (actB.currentStep === 'AMBIGUITY_SELECTION' && actB.candidateIssues.length > 0) {
      const printerCand = actB.candidateIssues.find(c => c.issueTypeId.includes('print') || c.issueTypeName.toLowerCase().includes('printer')) || actB.candidateIssues[0];
      actB = triageService.selectCandidateIssue(actB.sessionId, printerCand.issueTypeId);
    }
    while (actB.currentStep === 'PROGRESSIVE_QUESTION' && actB.currentQuestion) {
      const q = actB.currentQuestion;
      const optVal = q.id === 'q_historical_causal_check' ? 'no_prior_issue' : (q.options?.[0]?.value || 'single_pc_print');
      actB = triageService.processAnswer(actB.sessionId, q.id, optVal);
    }
    const resB = actB.finalTriageResult!;

    expect(resA.category).toBe('ACCOUNT');
    expect(resB.category).toBe('DEVICE');

    const rcaA = RcaEngine.generateRca(resA.incidentId!);
    const rcaB = RcaEngine.generateRca(resB.incidentId!);

    expect(rcaA.currentDiagnosis).toContain('Account Lockout');
    expect(rcaB.currentDiagnosis).toContain('Printer');
  });

  it('3. Adversarial Test: Grounding Defense Rejects Unrelated KB Action', () => {
    const session = triageService.startSession('usr_eng_02', 'Outlook email sync stuck in outbox');
    let act = triageService.processAnswer(session.sessionId, 'q_email_web', 'webmail_ok');
    if (act.currentStep === 'PROGRESSIVE_QUESTION' && act.currentQuestion) {
      act = triageService.processAnswer(act.sessionId, act.currentQuestion.id, 'webmail_ok');
    }
    const finalRes = act.finalTriageResult!;

    expect(finalRes.category).toBe('APPLICATION');
    expect(finalRes.recommendation?.action).not.toContain('VPN');
    expect(finalRes.recommendation?.action).not.toContain('battery');
  });

  it('4. Adversarial Test: Rapid Switch Between Incidents in Inspection Engine', () => {
    const incA = repo.createIncident({
      id: 'inc_test_A_101',
      ticketNumber: 'INC-2026-1001',
      userId: 'usr_exec_01',
      category: 'NETWORK',
      issueType: 'vpn_gateway_timeout',
      priority: 'P2_HIGH',
      status: 'OPEN',
      summary: 'VPN timeout',
      description: 'VPN disconnects every 5 mins',
      missingInfo: [],
      recommendedNextStep: 'Flush DNS',
      reasoning: 'Grounded VPN step',
      confidenceScore: 75
    });

    const incB = repo.createIncident({
      id: 'inc_test_B_102',
      ticketNumber: 'INC-2026-1002',
      userId: 'usr_eng_02',
      category: 'ACCOUNT',
      issueType: 'account_lockout_sso',
      priority: 'P3_MEDIUM',
      status: 'OPEN',
      summary: 'Password locked',
      description: 'Account locked out',
      missingInfo: [],
      recommendedNextStep: 'Reset password portal',
      reasoning: 'Grounded SSO step',
      confidenceScore: 80
    });

    // Fetch details for A, B, A, B, A
    const detailA1 = repo.getIncidentById(incA.id)!;
    const detailB1 = repo.getIncidentById(incB.id)!;
    const detailA2 = repo.getIncidentById(incA.id)!;
    const detailB2 = repo.getIncidentById(incB.id)!;

    expect(detailA1.id).toBe(incA.id);
    expect(detailB1.id).toBe(incB.id);
    expect(detailA2.id).toBe(incA.id);
    expect(detailB2.id).toBe(incB.id);
    expect(detailA1.category).toBe('NETWORK');
    expect(detailB1.category).toBe('ACCOUNT');
  });
});
