import { describe, it, expect } from 'vitest';
import { UniversalSearchEngine } from '../backend/services/search/searchEngine';
import { RecommendationService } from '../backend/services/recommendationService';
import { KbValidator } from '../backend/services/kbValidator';

describe('Phase 22 — Network Recommendation Grounding Audit', () => {
  const searchEngine = new UniversalSearchEngine();
  const { definitions } = KbValidator.loadAndValidateFromFile();

  const getDefinition = (id: string) => definitions.find(d => d.id === id);

  it('Test A: "Wi-Fi is connected but I cannot access the internet." does NOT recommend VPN without VPN evidence', () => {
    const query = "Wi-Fi is connected but I cannot access the internet.";
    const searchResults = searchEngine.search(query);
    
    // Top candidate must be Wi-Fi / Captive Portal or Network, NOT forced to VPN
    const topCandidate = searchResults[0];
    expect(topCandidate.issue_id).toBe('kb_net_wifi_02');

    const selectedIssue = getDefinition(topCandidate.issue_id)!;
    const rec = RecommendationService.generateStructuredRecommendation({
      category: topCandidate.category,
      selectedIssue,
      answers: {},
      evidence: [],
      confidence: topCandidate.confidence
    });

    // Verify action is grounded in Wi-Fi / captive portal KB steps, NOT VPN
    expect(rec.action).not.toContain('VPN');
    expect(rec.action).toContain('802.1X');
  });

  it('Test B: "Wi-Fi connected but internet does not work when VPN is enabled" correctly recommends VPN step with explicit VPN evidence', () => {
    const query = "Wi-Fi connected but internet does not work when VPN is enabled. It works when I disconnect VPN.";
    const searchResults = searchEngine.search(query);
    
    const topCandidate = searchResults[0];
    expect(topCandidate.issue_id).toBe('kb_net_vpn_01');

    const selectedIssue = getDefinition(topCandidate.issue_id)!;
    const rec = RecommendationService.generateStructuredRecommendation({
      category: topCandidate.category,
      selectedIssue,
      answers: {
        q_net_scope: {
          questionId: 'q_net_scope',
          questionText: 'Can you reach public websites?',
          answerValue: 'public_ok',
          timestamp: new Date().toISOString()
        }
      },
      evidence: [],
      confidence: 85
    });

    // VPN recommendation IS grounded when user explicitly mentions VPN and answers public_ok
    expect(selectedIssue.troubleshooting_steps).toContain(rec.action);
    expect(topCandidate.category).toBe('NETWORK');
  });

  it('Test C: "The internet is not working." initiates diagnostic questions without ungrounded VPN assumption', () => {
    const query = "The internet is not working.";
    const searchResults = searchEngine.search(query);

    // Verify search yields candidates with diagnostic questions for progressive triage
    expect(searchResults.length).toBeGreaterThan(0);
    const topIssue = getDefinition(searchResults[0].issue_id);
    expect(topIssue?.diagnostic_questions.length).toBeGreaterThan(0);
  });
});
