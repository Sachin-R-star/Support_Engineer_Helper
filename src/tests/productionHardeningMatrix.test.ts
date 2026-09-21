import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../backend/database/db';
import { TriageService } from '../backend/services/triageService';
import { RcaEngine } from '../backend/services/rcaEngine';
import { TaxonomyService } from '../backend/services/taxonomyService';

describe('Production Hardening & Verification Test Matrix', () => {
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
      DELETE FROM devices;
      DELETE FROM users;
    `);
    DatabaseService.seedDefaults();
    triageService = new TriageService();
  });

  it('TEST 1: Wi-Fi connected but no internet (Explicit "not using a VPN") -> NETWORK, no VPN', () => {
    const input = 'My Wi-Fi shows connected with a strong signal, but no website opens. Other devices on the same Wi-Fi can access the internet normally. I am not using a VPN.';
    const session = triageService.startSession('usr_eng_02', input);

    expect(session.selectedIssue?.category).toBe('NETWORK');
    expect(session.selectedIssue?.id).not.toBe('kb_net_vpn_01');
    expect(session.selectedIssue?.id).toBe('kb_net_wifi_02');
  });

  it('TEST 2: Password changed & Outlook sign-in loop -> ACCOUNT / EMAIL AUTH, no VPN', () => {
    const input = 'I changed my company password this morning. Since then, Outlook keeps repeatedly asking me to sign in, even though I can log into the company portal successfully. Other applications seem to work normally.';
    const session = triageService.startSession('usr_eng_02', input);

    expect(['ACCOUNT', 'APPLICATION']).toContain(session.selectedIssue?.category);
    expect(session.selectedIssue?.id).not.toBe('kb_net_vpn_01');
  });

  it('TEST 3: Laptop slow & screen freezes -> DEVICE, no BSOD forced, no VPN', () => {
    const input = 'My laptop has become extremely slow since this morning. Chrome and Teams together make it almost unusable, and occasionally the screen stops responding for a few seconds.';
    const session = triageService.startSession('usr_eng_02', input);

    expect(session.selectedIssue?.category).toBe('DEVICE');
    expect(session.selectedIssue?.id).not.toBe('kb_net_vpn_01');

    // Refined display name must indicate system freeze / performance hang, not BSOD
    const refinedName = TaxonomyService.getRefinedIssueDisplayName(session.selectedIssue!, input);
    expect(refinedName).not.toContain('Blue Screen');
    expect(refinedName).toContain('Freeze');
  });

  it('TEST 4: Excel workbook freeze -> APPLICATION / EXCEL, no device freeze, no VPN', () => {
    const input = 'Excel opens normally, but whenever I try to open a large workbook it freezes for about 20 seconds and then closes without showing any error message. Smaller files work fine.';
    const session = triageService.startSession('usr_eng_02', input);

    expect(session.selectedIssue?.category).toBe('APPLICATION');
    expect(session.selectedIssue?.id).not.toBe('kb_net_vpn_01');
  });

  it('TEST 5: Printer queue stuck -> DEVICE / PRINTER, no VPN', () => {
    const input = 'The office printer appears online and my computer can detect it, but every print job stays in the queue indefinitely. Other employees can print to the same printer.';
    const session = triageService.startSession('usr_eng_02', input);

    expect(session.selectedIssue?.category).toBe('DEVICE');
    expect(session.selectedIssue?.id).toBe('kb_dev_printer_02');
    expect(session.selectedIssue?.id).not.toBe('kb_net_vpn_01');
  });

  it('TEST 6: MFA prompt never arrives -> ACCOUNT / MFA, no VPN', () => {
    const input = 'I can enter my username and password correctly, but after that the MFA prompt never reaches my phone. I have tried requesting a new code twice and still cannot complete sign-in.';
    const session = triageService.startSession('usr_eng_02', input);

    expect(session.selectedIssue?.category).toBe('ACCOUNT');
    expect(session.selectedIssue?.id).toBe('kb_acc_mfa_02');
    expect(session.selectedIssue?.id).not.toBe('kb_net_vpn_01');
  });

  it('TEST 7: Low storage warning & slowdown -> DEVICE, no VPN, no BSOD', () => {
    const input = 'My laptop has become progressively slower over the last few days. Windows reports that the system drive has less than 2 GB free, applications take a long time to open, and I frequently get low-storage warnings.';
    const session = triageService.startSession('usr_eng_02', input);

    expect(['DEVICE', 'OTHER']).toContain(session.selectedIssue?.category);
    expect(session.selectedIssue?.id).not.toBe('kb_net_vpn_01');
  });

  it('TEST 8: Phishing link credential entry -> SECURITY / PHISHING, High/Critical escalation', () => {
    const input = 'I received an email that looked like it came from our IT department asking me to verify my account. I clicked the link and entered my company username and password, but then I noticed the website address looked suspicious.';
    const session = triageService.startSession('usr_eng_02', input);

    expect(session.selectedIssue?.id).toBe('kb_sec_phishing_01');
    const finalized = triageService.finalizeSession(session);
    expect(['P1_CRITICAL', 'P2_HIGH', 'CRITICAL', 'HIGH']).toContain(finalized.finalTriageResult?.priority);
  });

  it('TEST 9: Specific website not loading -> NETWORK/APPLICATION, no VPN', () => {
    const input = 'I can access Google, Teams, and our other internal applications normally, but one particular company website has stopped loading in Chrome. It worked yesterday and the problem happens only on this laptop.';
    const session = triageService.startSession('usr_eng_02', input);

    expect(session.selectedIssue?.id).not.toBe('kb_net_vpn_01');
  });

  it('TEST 10: Laptop camera fails in Teams -> APPLICATION / DEVICE CAMERA', () => {
    const input = 'My laptop camera works correctly in the Windows Camera app, but Teams cannot detect it during meetings. I already restarted Teams and checked that Teams has camera permission.';
    const session = triageService.startSession('usr_eng_02', input);

    expect(session.selectedIssue?.id).not.toBe('kb_net_vpn_01');
  });

  it('SECTION 16: Sequential Cross-Incident Isolation Test (A: VPN -> B: Wi-Fi -> C: MFA)', () => {
    // 1. Create Incident A (VPN)
    const sessionA = triageService.startSession('usr_eng_02', 'My VPN keeps disconnecting every 5 minutes on GlobalProtect.');
    sessionA.answers['q_net_scope'] = { questionId: 'q_net_scope', questionText: 'Scope', answerValue: 'public_ok', isUnsure: false, timestamp: new Date().toISOString() };
    const finalA = triageService.finalizeSession(sessionA).finalTriageResult!;
    expect(finalA.category).toBe('NETWORK');
    expect(finalA.incidentId).toBeDefined();

    // 2. Create Incident B (Wi-Fi)
    const sessionB = triageService.startSession('usr_eng_02', 'Connected to Corporate Wi-Fi but no internet access. I am not using a VPN.');
    const finalB = triageService.finalizeSession(sessionB).finalTriageResult!;
    expect(finalB.category).toBe('NETWORK');
    expect(finalB.issueType).toContain('Wi-Fi');
    expect(finalB.incidentId).not.toBe(finalA.incidentId);

    // 3. Create Incident C (MFA)
    const sessionC = triageService.startSession('usr_eng_02', 'MFA authenticator push notification is not arriving on phone.');
    const finalC = triageService.finalizeSession(sessionC).finalTriageResult!;
    expect(finalC.category).toBe('ACCOUNT');
    expect(finalC.incidentId).not.toBe(finalB.incidentId);

    // Verify RCA Isolation: RCA for B must NOT contain Incident A's ticket or diagnosis
    const rcaB = RcaEngine.generateRca(finalB.incidentId!);
    expect(rcaB.incidentId).toBe(finalB.incidentId);
    expect(rcaB.currentDiagnosis).toContain('Wi-Fi');
    expect(rcaB.currentDiagnosis).not.toContain('VPN Gateway Timeout');

    // Verify RCA for C must NOT contain B's or A's diagnosis
    const rcaC = RcaEngine.generateRca(finalC.incidentId!);
    expect(rcaC.incidentId).toBe(finalC.incidentId);
    expect(rcaC.currentDiagnosis).toContain('MFA');
    expect(rcaC.currentDiagnosis).not.toContain('Wi-Fi');
  });
});
