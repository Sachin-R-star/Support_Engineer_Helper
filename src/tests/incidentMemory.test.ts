import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryService } from '../backend/services/memoryService';
import { IncidentRepository } from '../backend/database/repositories/incidentRepo';
import { DatabaseService } from '../backend/database/db';

describe('Incident Memory Engine Test Suite', () => {
  let memoryService: MemoryService;
  let repo: IncidentRepository;

  beforeEach(() => {
    // Ensure database is initialized with default users & devices
    DatabaseService.getDb();
    DatabaseService.seedDefaults();
    memoryService = new MemoryService();
    repo = new IncidentRepository();
  });

  it('1. Persists structured incident with all metadata fields and generates CREATED event', () => {
    const incidentId = `inc_test_${Date.now()}_1`;
    const incident = memoryService.createIncident({
      id: incidentId,
      ticketNumber: 'INC-10001',
      userId: 'usr_exec_01',
      deviceId: 'dev_mac_01',
      category: 'NETWORK',
      issueType: 'vpn_connection_failure',
      priority: 'HIGH',
      status: 'OPEN',
      summary: 'Cannot connect to corporate VPN from home',
      description: 'VPN client gets stuck at connecting state after password entry.',
      missingInfo: ['wifi_speed', 'error_code'],
      recommendedNextStep: 'Check split-tunneling settings and restart VPN client daemon.',
      reasoning: 'High priority due to remote worker blocked on urgent deadline.',
      confidenceScore: 0.85
    });

    expect(incident.id).toBe(incidentId);
    expect(incident.ticketNumber).toBe('INC-10001');
    expect(incident.category).toBe('NETWORK');
    expect(incident.priority).toBe('HIGH');
    expect(incident.status).toBe('OPEN');
    expect(incident.createdAt).toBeDefined();
    expect(incident.updatedAt).toBeDefined();

    const fetched = repo.getIncidentById(incidentId);
    expect(fetched).not.toBeNull();
    expect(fetched?.summary).toBe('Cannot connect to corporate VPN from home');
    expect(fetched?.missingInfo).toEqual(['wifi_speed', 'error_code']);
  });

  it('2. Appends answers and logs ANSWER_ADDED events', () => {
    const incidentId = `inc_test_${Date.now()}_2`;
    memoryService.createIncident({
      id: incidentId,
      ticketNumber: 'INC-10002',
      userId: 'usr_eng_02',
      category: 'ACCOUNT',
      issueType: 'account_lockout',
      priority: 'MEDIUM',
      status: 'OPEN',
      summary: 'Locked out of Active Directory account',
      description: 'Too many failed password attempts on workstation.',
      missingInfo: [],
      recommendedNextStep: 'Verify identity and trigger password reset link.',
      reasoning: 'Standard account lockout flow.',
      confidenceScore: 0.9
    });

    const ans1 = memoryService.appendAnswer({
      id: `ans_${Date.now()}_1`,
      incidentId,
      questionId: 'q_acc_lockout_type',
      questionText: 'Is your account locked on all systems or just laptop?',
      answerValue: 'all_systems',
      isUnsure: false
    });

    expect(ans1.id).toBeDefined();
    expect(ans1.incidentId).toBe(incidentId);
    expect(ans1.answerValue).toBe('all_systems');

    const answers = repo.getAnswersForIncident(incidentId);
    expect(answers.length).toBe(1);
    expect(answers[0].questionId).toBe('q_acc_lockout_type');

    const events = repo.getEventsForIncident(incidentId);
    const answerEvent = events.find(e => e.eventType === 'ANSWER_ADDED');
    expect(answerEvent).toBeDefined();
    expect(answerEvent?.description).toContain('Answer recorded for');
  });

  it('3. Appends troubleshooting actions and records action results', () => {
    const incidentId = `inc_test_${Date.now()}_3`;
    memoryService.createIncident({
      id: incidentId,
      ticketNumber: 'INC-10003',
      userId: 'usr_exec_01',
      category: 'APPLICATION',
      issueType: 'outlook_crash',
      priority: 'LOW',
      status: 'IN_PROGRESS',
      summary: 'Outlook crashes when opening large attachments',
      description: 'App freezes and shuts down when downloading PDFs over 20MB.',
      missingInfo: [],
      recommendedNextStep: 'Start Outlook in Safe Mode.',
      reasoning: 'Safe mode bypasses add-ins that cause memory leaks.',
      confidenceScore: 0.8
    });

    const actionId = `act_${Date.now()}_1`;
    const action = memoryService.appendAction({
      id: actionId,
      incidentId,
      actionType: 'DIAGNOSTIC_COMMAND',
      description: 'Run outlook.exe /safe from Windows Run prompt.',
      resultStatus: 'PENDING',
      performer: 'USER'
    });

    expect(action.id).toBe(actionId);

    // Record action result as FAILURE
    const updatedAction = memoryService.recordActionResult(
      actionId,
      'FAILURE',
      'Outlook still crashed in Safe Mode with error code 0x8004010F'
    );

    expect(updatedAction.id).toBe(actionId);

    const timeline = memoryService.getIncidentTimeline(incidentId);
    expect(timeline.actions.length).toBe(1);
    
    const resultEvent = timeline.events.find(e => e.eventType === 'RESULT_RECORDED');
    expect(resultEvent).toBeDefined();
    expect(resultEvent?.description).toContain('FAILURE');
  });

  it('4. Supports status transitions: RESOLVED and REOPENED with timestamps', () => {
    const incidentId = `inc_test_${Date.now()}_4`;
    memoryService.createIncident({
      id: incidentId,
      ticketNumber: 'INC-10004',
      userId: 'usr_exec_01',
      category: 'DEVICE',
      issueType: 'printer_offline',
      priority: 'LOW',
      status: 'IN_PROGRESS',
      summary: 'Office network printer shows offline',
      description: 'Queue stuck with 5 documents.',
      missingInfo: [],
      recommendedNextStep: 'Restart print spooler service.',
      reasoning: 'Spooler crash is most common cause.',
      confidenceScore: 0.95
    });

    // Resolve incident
    const resolved = memoryService.resolveIncident(
      incidentId,
      'Restarted Windows Print Spooler service and cleared spool folder.'
    );

    expect(resolved.status).toBe('RESOLVED');

    // Reopen incident
    const reopened = memoryService.reopenIncident(
      incidentId,
      'Printer went offline again 10 minutes later during print job.'
    );

    expect(reopened.status).toBe('REOPENED');

    const timeline = memoryService.getIncidentTimeline(incidentId);
    const reopenEvent = timeline.events.find(e => e.eventType === 'REOPENED');
    expect(reopenEvent).toBeDefined();
    expect(reopenEvent?.description).toContain('went offline again');
  });

  it('5. Retrieves comprehensive structured incident timeline', () => {
    const incidentId = `inc_test_${Date.now()}_5`;
    memoryService.createIncident({
      id: incidentId,
      ticketNumber: 'INC-10005',
      userId: 'usr_exec_01',
      deviceId: 'dev_mac_01',
      category: 'NETWORK',
      issueType: 'vpn_connection_failure',
      priority: 'HIGH',
      status: 'OPEN',
      summary: 'VPN authentication failed',
      description: 'Error code 800 while attempting connection.',
      missingInfo: [],
      recommendedNextStep: 'Check credentials and token MFA.',
      reasoning: 'MFA token desync suspected.',
      confidenceScore: 0.88
    });

    repo.addEvidence(incidentId, 'mfa_status', 'failed', 'q_mfa_prompt');

    memoryService.appendAnswer({
      id: `ans_${Date.now()}_5`,
      incidentId,
      questionId: 'q_mfa_prompt',
      questionText: 'Did MFA push notification arrive on phone?',
      answerValue: 'no_notification'
    });

    const timeline = memoryService.getIncidentTimeline(incidentId);
    expect(timeline.incident.id).toBe(incidentId);
    expect(timeline.user).toBeDefined();
    expect(timeline.user?.name).toBe('Alex Morgan');
    expect(timeline.answers.length).toBe(1);
    expect(timeline.evidence.length).toBe(1);
    expect(timeline.events.length).toBeGreaterThanOrEqual(2); // CREATED + ANSWER_ADDED
  });

  it('6. Searches and retrieves relevant previous incidents based on query and issueType', () => {
    const incidentId = `inc_test_${Date.now()}_6`;
    memoryService.createIncident({
      id: incidentId,
      ticketNumber: 'INC-10006',
      userId: 'usr_exec_01',
      category: 'NETWORK',
      issueType: 'vpn_connection_failure',
      priority: 'MEDIUM',
      status: 'RESOLVED',
      summary: 'GlobalProtect VPN fails to establish gateway handshake',
      description: 'Client stuck at connecting after upgrading macOS.',
      missingInfo: [],
      recommendedNextStep: 'Reinstall VPN profile certificate.',
      reasoning: 'Profile corrupt post-upgrade.',
      confidenceScore: 0.9
    });

    const matches = memoryService.findRelatedIncidents(
      'usr_exec_01',
      'GlobalProtect VPN fails connecting',
      'vpn_connection_failure'
    );

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].incident.id).toBe(incidentId);
    expect(matches[0].similarityScore).toBeGreaterThanOrEqual(0.7);
    expect(matches[0].relationshipType).toBeDefined();
  });
});

