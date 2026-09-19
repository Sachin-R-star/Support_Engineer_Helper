import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryService } from '../backend/services/memoryService';
import { TriageService } from '../backend/services/triageService';
import { DatabaseService } from '../backend/database/db';

describe('Memory Engine & Progressive Triage Integration Test Suite', () => {
  let memoryService: MemoryService;
  let triageService: TriageService;

  beforeEach(() => {
    DatabaseService.getDb();
    DatabaseService.seedDefaults();
    memoryService = new MemoryService();
    triageService = new TriageService();
  });

  it('1. Irrelevant History Exclusion: Filters out unrelated tickets (printer/password) when diagnosing VPN issue', () => {
    const userId = 'usr_exec_01';
    const deviceId = 'dev_mac_01';

    // Seed 8 irrelevant tickets (different categories & issue types)
    for (let i = 1; i <= 8; i++) {
      memoryService.createIncident({
        id: `inc_irrelevant_${i}`,
        ticketNumber: `INC-ERR-00${i}`,
        userId,
        deviceId,
        category: i % 2 === 0 ? 'ACCOUNT' : 'OTHER',
        issueType: i % 2 === 0 ? 'password_reset' : 'printer_paper_jam',
        priority: 'LOW',
        status: 'RESOLVED',
        summary: i % 2 === 0 ? `Password reset request ${i}` : `Paper jam in printer ${i}`,
        description: 'Irrelevant past history record',
        missingInfo: [],
        recommendedNextStep: 'Close ticket',
        reasoning: 'Routine action',
        confidenceScore: 0.9
      });
    }

    // Seed 2 relevant VPN tickets
    const rel1 = memoryService.createIncident({
      id: 'inc_relevant_vpn_1',
      ticketNumber: 'INC-VPN-101',
      userId,
      deviceId,
      category: 'NETWORK',
      issueType: 'vpn_connection_failure',
      priority: 'HIGH',
      status: 'RESOLVED',
      summary: 'GlobalProtect VPN handshake timeout',
      description: 'VPN failed to connect on US-East server',
      missingInfo: [],
      recommendedNextStep: 'Clear DNS cache',
      reasoning: 'Resolved via gateway flush',
      confidenceScore: 0.95
    });

    const rel2 = memoryService.createIncident({
      id: 'inc_relevant_vpn_2',
      ticketNumber: 'INC-VPN-102',
      userId,
      deviceId,
      category: 'NETWORK',
      issueType: 'vpn_connection_failure',
      priority: 'MEDIUM',
      status: 'RESOLVED',
      summary: 'VPN disconnects every 10 minutes',
      description: 'Keep-alive packet dropped by ISP router',
      missingInfo: [],
      recommendedNextStep: 'Enable UDP encapsulation',
      reasoning: 'NAT keepalive configured',
      confidenceScore: 0.88
    });

    // Diagnosing new VPN request
    const context = memoryService.getRelevantMemoryContext(
      userId,
      'NETWORK',
      'vpn_connection_failure',
      deviceId,
      'Cannot connect to corporate VPN from home'
    );

    // Verify irrelevant history is excluded!
    expect(context.relevantIncidents.length).toBeLessThanOrEqual(3);
    expect(context.relevantIncidents.every(inc => inc.category === 'NETWORK' || inc.issueType === 'vpn_connection_failure')).toBe(true);
    
    const includedTicketNumbers = context.relevantIncidents.map(inc => inc.ticketNumber);
    expect(includedTicketNumbers).toContain('INC-VPN-101');
    expect(includedTicketNumbers).not.toContain('INC-ERR-001');
    expect(includedTicketNumbers).not.toContain('INC-ERR-002');
  });

  it('2. Historical Context Labeling & Demarcation: All items explicitly marked with isHistorical: true', () => {
    const userId = 'usr_exec_01';
    const deviceId = 'dev_mac_01';

    memoryService.createIncident({
      id: 'inc_historical_tag_1',
      ticketNumber: 'INC-TAG-501',
      userId,
      deviceId,
      category: 'NETWORK',
      issueType: 'vpn_connection_failure',
      priority: 'HIGH',
      status: 'RESOLVED',
      summary: 'GlobalProtect authentication desync',
      description: 'MFA token expired',
      missingInfo: [],
      recommendedNextStep: 'Resync MFA token',
      reasoning: 'MFA resynced',
      confidenceScore: 0.95
    });

    const context = memoryService.getRelevantMemoryContext(
      userId,
      'NETWORK',
      'vpn_connection_failure',
      deviceId,
      'VPN authentication desync'
    );

    expect(context.relevantIncidents.length).toBeGreaterThan(0);
    for (const item of context.relevantIncidents) {
      expect(item.isHistorical).toBe(true);
    }
    expect(context.cautiousPromptContext).toContain('[HISTORICAL CONTEXT');
  });

  it('3. Preceding Causal Action & Targeted Question Path: Triggers targeted verification question', () => {
    const userId = 'usr_exec_01';
    const deviceId = 'dev_mac_01';

    // Past incident: Network Reset
    const incNet = memoryService.createIncident({
      id: 'inc_net_causal_1',
      ticketNumber: 'INC-NET-801',
      userId,
      deviceId,
      category: 'NETWORK',
      issueType: 'wifi_intermittent',
      priority: 'HIGH',
      status: 'RESOLVED',
      summary: 'Network configuration reset on laptop',
      description: 'Adapter reset executed to clear IP conflict',
      missingInfo: [],
      recommendedNextStep: 'Flush DNS and reset TCP/IP stack',
      reasoning: 'Stack reset',
      confidenceScore: 0.92
    });

    memoryService.appendAction({
      id: 'act_net_causal_1',
      incidentId: incNet.id,
      actionType: 'DIAGNOSTIC_COMMAND',
      description: 'Network configuration reset and winsock flush',
      resultStatus: 'SUCCESS',
      performer: 'AGENT'
    });

    // Current query: VPN stopped working
    const state = triageService.startSession(
      userId,
      'VPN stopped working after network reset',
      deviceId
    );

    expect(state.memoryContext?.hasPrecedingCausalAction).toBe(true);
    expect(state.currentQuestion).toBeDefined();
    expect(state.currentQuestion?.id).toBe('q_historical_causal_check');
    expect(state.currentQuestion?.question_text).toContain('Did this issue start immediately after the preceding action');
  });

  it('4. Compact Context Payload: Ensures memory context remains compact and auditable', () => {
    const userId = 'usr_exec_01';
    const deviceId = 'dev_mac_01';

    const context = memoryService.getRelevantMemoryContext(
      userId,
      'NETWORK',
      'vpn_connection_failure',
      deviceId,
      'VPN client error 800'
    );

    expect(context.cautiousPromptContext.length).toBeLessThan(1500); // Compact string limit
    expect(context.userId).toBe(userId);
    expect(context.deviceId).toBe(deviceId);
  });
});
