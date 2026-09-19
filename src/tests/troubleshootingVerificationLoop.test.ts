import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../backend/database/db';
import { TriageService } from '../backend/services/triageService';
import { MemoryService } from '../backend/services/memoryService';
import { IncidentRepository } from '../backend/database/repositories/incidentRepo';

describe('Troubleshooting Verification Loop Engine Test Suite', () => {
  let triageService: TriageService;
  let memoryService: MemoryService;
  let repo: IncidentRepository;

  beforeEach(() => {
    // Reset in-memory database for testing
    const db = DatabaseService.getDb();
    db.exec(`
      DELETE FROM incident_relationships;
      DELETE FROM incident_events;
      DELETE FROM incident_evidence;
      DELETE FROM incident_actions;
      DELETE FROM incident_answers;
      DELETE FROM incidents;
    `);
    DatabaseService.seedDefaults();

    triageService = new TriageService();
    memoryService = new MemoryService();
    repo = new IncidentRepository();
  });

  const createHelper = (overrides: any = {}) => {
    const id = overrides.id || `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const ticketNumber = overrides.ticketNumber || `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    return memoryService.createIncident({
      id,
      ticketNumber,
      userId: 'usr_eng_02',
      deviceId: 'dev_win_02',
      category: 'NETWORK',
      issueType: 'office_network_outage',
      priority: 'P2_HIGH',
      status: 'OPEN',
      summary: 'Office network down',
      description: 'Cannot access internal resources',
      missingInfo: [],
      recommendedNextStep: 'Flush DNS cache and restart wireless network adapter.',
      reasoning: 'Standard network troubleshooting',
      confidenceScore: 80,
      ...overrides
    });
  };

  it('1. Never marks an incident RESOLVED merely because a recommendation was shown; requires explicit user confirmation', () => {
    const inc = createHelper();

    expect(inc.status).toBe('OPEN');
    const fetched = repo.getIncidentById(inc.id);
    expect(fetched?.status).toBe('OPEN');
  });

  it('2. Marks incident RESOLVED when user confirms YES_RESOLVED in verification loop', () => {
    const inc = createHelper();

    const res = triageService.verifyActionResult({
      incidentId: inc.id,
      actionDescription: 'Flush DNS cache and restart wireless network adapter.',
      resultStatus: 'YES_RESOLVED',
      userNotes: 'Internet access restored cleanly.'
    });

    expect(res.isResolved).toBe(true);
    expect(res.updatedIncidentStatus).toBe('RESOLVED');
    expect(res.resolutionSummary).toContain('Resolved via troubleshooting action');

    const updatedInc = repo.getIncidentById(inc.id);
    expect(updatedInc?.status).toBe('RESOLVED');
    expect(updatedInc?.resolution).toContain('Internet access restored cleanly.');
  });

  it('3. Advances to next Knowledge-Base action and updates confidence when action FAILS (NO_FAILED)', () => {
    const inc = createHelper({
      issueType: 'vpn_gateway_timeout',
      recommendedNextStep: 'Flush local DNS cache and restart network stack.',
      confidenceScore: 85
    });

    const res = triageService.verifyActionResult({
      incidentId: inc.id,
      actionDescription: 'Flush local DNS cache and restart network stack.',
      resultStatus: 'NO_FAILED',
      userNotes: 'DNS flush completed but VPN still times out.'
    });

    expect(res.isResolved).toBe(false);
    expect(res.updatedIncidentStatus).toBe('IN_PROGRESS');
    expect(res.updatedConfidence).toBe(75); // 85 - 10
    expect(res.nextRecommendedAction).toBeDefined();
    expect(res.nextRecommendedAction).not.toBe('Flush local DNS cache and restart network stack.');
    expect(res.attemptedActionsHistory.length).toBe(1);
    expect(res.attemptedActionsHistory[0].resultStatus).toBe('NO_FAILED');
  });

  it('4. Handles SOMETHING_CHANGED by creating and linking a follow-up incident with POSSIBLY_CAUSED_BY relationship', () => {
    const inc = createHelper({
      recommendedNextStep: 'Reset network adapter configuration.'
    });

    const res = triageService.verifyActionResult({
      incidentId: inc.id,
      actionDescription: 'Reset network adapter configuration.',
      resultStatus: 'SOMETHING_CHANGED',
      userNotes: 'Wi-Fi connected now, but Outlook stopped syncing credentials.'
    });

    expect(res.isResolved).toBe(false);
    expect(res.followUpIncident).toBeDefined();
    expect(res.followUpIncident?.relationshipType).toBe('POSSIBLY_CAUSED_BY');
    expect(res.followUpIncident?.summary).toContain('Outlook stopped syncing');

    const graph = repo.getRelationshipsForIncident(inc.id);
    expect(graph.length).toBeGreaterThan(0);
    expect(graph[0].relationshipType).toBe('POSSIBLY_CAUSED_BY');
  });

  it('5. Stores complete attempted actions timeline and never repeats failed steps', () => {
    const inc = createHelper({
      category: 'APPLICATION',
      issueType: 'outlook_mail_disconnected',
      priority: 'P3_MEDIUM',
      recommendedNextStep: 'Remove generic credentials from Windows Credential Manager.',
      confidenceScore: 90
    });

    const step1 = triageService.verifyActionResult({
      incidentId: inc.id,
      actionDescription: 'Remove generic credentials from Windows Credential Manager.',
      resultStatus: 'NO_FAILED'
    });

    const step2 = triageService.verifyActionResult({
      incidentId: inc.id,
      actionDescription: step1.nextRecommendedAction!,
      resultStatus: 'NO_FAILED'
    });

    expect(step2.attemptedActionsHistory.length).toBe(2);
    const attemptedSet = new Set(step2.attemptedActionsHistory.map(a => a.actionDescription));
    expect(attemptedSet.has('Remove generic credentials from Windows Credential Manager.')).toBe(true);
    expect(step2.nextRecommendedAction).not.toEqual(step1.nextRecommendedAction);
  });
});
