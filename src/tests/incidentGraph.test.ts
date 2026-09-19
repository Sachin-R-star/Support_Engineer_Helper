import { describe, it, expect, beforeEach } from 'vitest';
import { IncidentGraphService } from '../backend/services/incidentGraphService';
import { MemoryService } from '../backend/services/memoryService';
import { DatabaseService } from '../backend/database/db';

describe('Incident Relationship & Issue Chain Test Suite', () => {
  let graphService: IncidentGraphService;
  let memoryService: MemoryService;

  beforeEach(() => {
    DatabaseService.getDb();
    DatabaseService.seedDefaults();
    graphService = new IncidentGraphService();
    memoryService = new MemoryService();
  });

  it('1. Related Incidents Detection: Suggests RELATED_TO for same device within timing window', () => {
    const inc1 = memoryService.createIncident({
      id: `inc_rel_${Date.now()}_1`,
      ticketNumber: 'INC-20001',
      userId: 'usr_exec_01',
      deviceId: 'dev_mac_01',
      category: 'APPLICATION',
      issueType: 'slack_crash',
      priority: 'LOW',
      status: 'RESOLVED',
      summary: 'Slack application crash on macOS',
      description: 'Slack unhandled exception on launch.',
      missingInfo: [],
      recommendedNextStep: 'Clear Slack app cache.',
      reasoning: 'App cache corrupt.',
      confidenceScore: 0.9
    });

    const inc2 = memoryService.createIncident({
      id: `inc_rel_${Date.now()}_2`,
      ticketNumber: 'INC-20002',
      userId: 'usr_exec_01',
      deviceId: 'dev_mac_01',
      category: 'APPLICATION',
      issueType: 'zoom_audio_failure',
      priority: 'MEDIUM',
      status: 'OPEN',
      summary: 'Zoom audio input device disconnected',
      description: 'Microphone not detected during video call.',
      missingInfo: [],
      recommendedNextStep: 'Check macOS Privacy permissions for Microphone.',
      reasoning: 'Permission issue after macOS update.',
      confidenceScore: 0.85
    });

    const suggestions = graphService.detectPotentialRelationships(inc2);
    expect(suggestions.length).toBeGreaterThan(0);
    
    const match = suggestions.find(s => s.targetIncidentId === inc1.id);
    expect(match).toBeDefined();
    expect(match?.relationshipType).toBe('RELATED_TO');
    expect(match?.cautiousReasoning).toContain('Possibly related device fault');
  });

  it('2. Unrelated Incidents Detection: Returns no suggestions for unrelated users/categories', () => {
    const incUnrelated = memoryService.createIncident({
      id: `inc_unrel_${Date.now()}_1`,
      ticketNumber: 'INC-20003',
      userId: 'usr_eng_02',
      category: 'ACCOUNT',
      issueType: 'password_reset',
      priority: 'LOW',
      status: 'RESOLVED',
      summary: 'User forgotten Active Directory password',
      description: 'Need self-service password reset token.',
      missingInfo: [],
      recommendedNextStep: 'Send password reset SMS token.',
      reasoning: 'Standard auth request.',
      confidenceScore: 0.95
    });

    const incExec = memoryService.createIncident({
      id: `inc_unrel_${Date.now()}_2`,
      ticketNumber: 'INC-20004',
      userId: 'usr_exec_01',
      deviceId: 'dev_mac_01',
      category: 'DEVICE',
      issueType: 'monitor_flicker',
      priority: 'LOW',
      status: 'OPEN',
      summary: 'External 4K monitor flickering via USB-C dock',
      description: 'Screen flashes black every 30 seconds.',
      missingInfo: [],
      recommendedNextStep: 'Replace Thunderbolt cable.',
      reasoning: 'Cable bandwidth degradation.',
      confidenceScore: 0.88
    });

    const suggestions = graphService.detectPotentialRelationships(incExec);
    const match = suggestions.find(s => s.targetIncidentId === incUnrelated.id);
    expect(match).toBeUndefined();
  });

  it('3. Possible Causal Relationship: Detects POSSIBLY_CAUSED_BY when network reset precedes VPN issue', () => {
    // Step 1: Internet issue incident (INC-001)
    const inc1 = memoryService.createIncident({
      id: `inc_cause_${Date.now()}_1`,
      ticketNumber: 'INC-30001',
      userId: 'usr_exec_01',
      deviceId: 'dev_mac_01',
      category: 'NETWORK',
      issueType: 'wifi_intermittent',
      priority: 'HIGH',
      status: 'RESOLVED',
      summary: 'Home WiFi connection dropping intermittently',
      description: 'Packet loss over home router.',
      missingInfo: [],
      recommendedNextStep: 'Reset network adapter configuration.',
      reasoning: 'Stale IP lease.',
      confidenceScore: 0.9
    });

    // Step 2: Agent executes a Network Reset action on INC-001
    const action = memoryService.appendAction({
      id: `act_cause_${Date.now()}_1`,
      incidentId: inc1.id,
      actionType: 'DIAGNOSTIC_COMMAND',
      description: 'Network reset and flush DNS cache daemon',
      resultStatus: 'SUCCESS',
      performer: 'AGENT'
    });

    // Step 3: Subsequent VPN issue incident (INC-002)
    const inc2 = memoryService.createIncident({
      id: `inc_cause_${Date.now()}_2`,
      ticketNumber: 'INC-30002',
      userId: 'usr_exec_01',
      deviceId: 'dev_mac_01',
      category: 'NETWORK',
      issueType: 'vpn_connection_failure',
      priority: 'HIGH',
      status: 'OPEN',
      summary: 'VPN client failed to handshake gateway',
      description: 'VPN gateway error immediately after network reset.',
      missingInfo: [],
      recommendedNextStep: 'Re-authenticate VPN profile.',
      reasoning: 'Flushed route table affected VPN daemon adapter.',
      confidenceScore: 0.85
    });

    const suggestions = graphService.detectPotentialRelationships(inc2);
    expect(suggestions.length).toBeGreaterThan(0);

    const causalMatch = suggestions.find(s => s.targetIncidentId === inc1.id);
    expect(causalMatch).toBeDefined();
    expect(causalMatch?.relationshipType).toBe('POSSIBLY_CAUSED_BY');
    expect(causalMatch?.sourceActionId).toBe(action.id);
    expect(causalMatch?.cautiousReasoning).toContain('Possibly caused by previous troubleshooting action');
  });

  it('4. Relationship Confirmation & Rejection Workflow', () => {
    const inc1 = memoryService.createIncident({
      id: `inc_flow_${Date.now()}_1`,
      ticketNumber: 'INC-40001',
      userId: 'usr_exec_01',
      category: 'DEVICE',
      issueType: 'battery_drain',
      priority: 'MEDIUM',
      status: 'OPEN',
      summary: 'Rapid battery drain on laptop',
      description: 'Battery drops from 100% to 20% in 1 hour.',
      missingInfo: [],
      recommendedNextStep: 'Check background battery consumers.',
      reasoning: 'Background indexer process suspected.',
      confidenceScore: 0.88
    });

    const inc2 = memoryService.createIncident({
      id: `inc_flow_${Date.now()}_2`,
      ticketNumber: 'INC-40002',
      userId: 'usr_exec_01',
      category: 'DEVICE',
      issueType: 'fan_noise_high',
      priority: 'LOW',
      status: 'OPEN',
      summary: 'Laptop fan running at max RPM continuously',
      description: 'Heavy thermal throttling.',
      missingInfo: [],
      recommendedNextStep: 'Inspect CPU process utilization.',
      reasoning: 'High CPU usage.',
      confidenceScore: 0.9
    });

    // 1. Link as PROPOSED
    const rel = graphService.linkIncidents(
      inc2.id,
      inc1.id,
      'POSSIBLY_CAUSED_BY',
      0.75,
      'PROPOSED',
      'Both thermal throttling and battery drain may be caused by runaway background process'
    );

    expect(rel.status).toBe('PROPOSED');

    // 2. Reject the relationship
    const rejected = graphService.rejectRelationship(rel.id, 'usr_exec_01');
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.confirmedBy).toBe('usr_exec_01');

    // Rejected relationships should be excluded from active graph traversal
    const graph = graphService.getIncidentGraph(inc2.id);
    const rejectedEdgeInGraph = graph.edges.find(e => e.id === rel.id);
    expect(rejectedEdgeInGraph).toBeUndefined();
  });

  it('5. Multiple Linked Incidents & Issue Chains (INC-001 -> INC-002 -> INC-003)', () => {
    const inc1 = memoryService.createIncident({
      id: `inc_chain_${Date.now()}_1`,
      ticketNumber: 'INC-50001',
      userId: 'usr_exec_01',
      category: 'NETWORK',
      issueType: 'router_disconnect',
      priority: 'HIGH',
      status: 'RESOLVED',
      summary: 'Office gateway disconnect',
      description: 'Router offline.',
      missingInfo: [],
      recommendedNextStep: 'Reboot gateway.',
      reasoning: 'Gateway crash.',
      confidenceScore: 0.9
    });

    const inc2 = memoryService.createIncident({
      id: `inc_chain_${Date.now()}_2`,
      ticketNumber: 'INC-50002',
      userId: 'usr_exec_01',
      category: 'NETWORK',
      issueType: 'dns_resolution_failure',
      priority: 'MEDIUM',
      status: 'RESOLVED',
      summary: 'Internal DNS resolution failed',
      description: 'Cannot resolve internal domain names.',
      missingInfo: [],
      recommendedNextStep: 'Flush DNS.',
      reasoning: 'Stale DNS cache post router reboot.',
      confidenceScore: 0.88
    });

    const inc3 = memoryService.createIncident({
      id: `inc_chain_${Date.now()}_3`,
      ticketNumber: 'INC-50003',
      userId: 'usr_exec_01',
      category: 'APPLICATION',
      issueType: 'crm_login_error',
      priority: 'HIGH',
      status: 'OPEN',
      summary: 'CRM web portal authentication error 502',
      description: '502 Bad Gateway error accessing internal CRM.',
      missingInfo: [],
      recommendedNextStep: 'Verify DNS A-records.',
      reasoning: 'Upstream DNS failure.',
      confidenceScore: 0.92
    });

    // Build chain: inc1 -> inc2 -> inc3
    graphService.linkIncidents(inc2.id, inc1.id, 'POSSIBLY_CAUSED_BY', 0.85, 'CONFIRMED', 'DNS issue occurred after gateway reboot');
    graphService.linkIncidents(inc3.id, inc2.id, 'POSSIBLY_CAUSED_BY', 0.90, 'CONFIRMED', 'CRM auth failed due to internal DNS resolution failure');

    const graph = graphService.getIncidentGraph(inc1.id);
    expect(graph.nodes.length).toBe(3);
    expect(graph.edges.length).toBe(2);

    const chain = graphService.getIncidentChain(inc1.id);
    expect(chain.length).toBe(3);
    expect(chain[0].id).toBe(inc1.id);
    expect(chain[1].id).toBe(inc2.id);
    expect(chain[2].id).toBe(inc3.id);
  });
});
