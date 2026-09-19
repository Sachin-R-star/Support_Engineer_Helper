import { describe, it, expect, beforeEach } from 'vitest';
import { TaxonomyService } from '../backend/services/taxonomyService';
import { QuestionEngine } from '../backend/services/questionEngine';
import { PriorityEngine } from '../backend/services/priorityEngine';
import { MemoryService } from '../backend/services/memoryService';
import { TriageService } from '../backend/services/triageService';
import { DatabaseService } from '../backend/database/db';

describe('Foundational IT Triage Engine Test Suite', () => {
  beforeEach(() => {
    DatabaseService.seedDefaults();
  });

  it('Requirement 1 & 2: converts any user input into issue candidates without dead-ending', () => {
    const matches = TaxonomyService.matchCandidatesFromQuery('I clicked a link in a suspicious email');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some(m => m.issueType.subdomain === 'SECURITY' || m.issueType.subdomain === 'EMAIL')).toBe(true);
  });

  it('Requirement 9: PriorityEngine deterministically assigns P1 to security threats & VIP users', () => {
    const vipUser = {
      id: 'usr_exec_01',
      email: 'alex.morgan@enterprise.com',
      name: 'Alex Morgan',
      role: 'END_USER' as const,
      department: 'Executive Office',
      isVip: true,
      createdAt: new Date().toISOString()
    };

    const secIssue = TaxonomyService.findIssueTypeById('kb_sec_phishing_01')!;

    // Test Security Threat rule
    const secResult = PriorityEngine.calculatePriority({
      category: 'OTHER',
      issueType: secIssue,
      user: null,
      answers: { q_sec_action: { questionId: 'q_sec_action', questionText: 'Action', answerValue: 'creds_exposed', timestamp: new Date().toISOString() } },
      initialQuery: 'phishing email clicked'
    });
    expect(secResult.priority).toBe('P1_CRITICAL');

    // Test VIP hardware failure rule
    const hwIssue = TaxonomyService.findIssueTypeById('kb_dev_bsod_01')!;
    const vipHwResult = PriorityEngine.calculatePriority({
      category: 'DEVICE',
      issueType: hwIssue,
      user: vipUser,
      answers: { q_hw_power: { questionId: 'q_hw_power', questionText: 'Power', answerValue: 'boot_crash', timestamp: new Date().toISOString() } },
      initialQuery: 'macbook won\'t power on'
    });
    expect(vipHwResult.priority).toBe('P1_CRITICAL');
  });

  it('Requirement 3: QuestionEngine selects progressive one-question-at-a-time', () => {
    const triageService = new TriageService();
    const session = triageService.startSession('usr_eng_02', 'cant connect to vpn gateway timeout');
    
    expect(session.currentStep).toBe('PROGRESSIVE_QUESTION');
    expect(session.currentQuestion).toBeDefined();
    expect(session.questionHistory.length).toBe(1);
  });

  it('Requirement 5 & 6: MemoryService matches historical incidents and calculates similarity score', () => {
    const memoryService = new MemoryService();
    const matches = memoryService.findRelatedIncidents(
      'usr_eng_02',
      'VPN gateway timeout on GlobalProtect US-East',
      'VPN Gateway Timeout / Disconnect'
    );

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].similarityScore).toBeGreaterThanOrEqual(0.4);
    expect(matches[0].incident.ticketNumber).toBe('INC-2026-8801');
  });
});
