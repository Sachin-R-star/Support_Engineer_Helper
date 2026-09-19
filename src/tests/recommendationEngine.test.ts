import { describe, it, expect } from 'vitest';
import { RecommendationService } from '../backend/services/recommendationService';
import { TaxonomyService } from '../backend/services/taxonomyService';
import { TriageAnswer, TriageEvidence } from '../backend/models';

describe('Structured Recommendation Engine Test Suite', () => {
  it('1. Derives primary action from Knowledge Base troubleshooting steps and produces full structured payload', () => {
    const vpnIssue = TaxonomyService.findIssueTypeById('kb_net_vpn_01')!;

    const answers: Record<string, TriageAnswer> = {
      q_net_scope: {
        questionId: 'q_net_scope',
        questionText: 'Can you access public web?',
        answerValue: 'public_ok',
        timestamp: new Date().toISOString()
      }
    };

    const evidence: TriageEvidence[] = [
      { factKey: 'q_net_scope', factValue: 'public_ok', sourceQuestionId: 'q_net_scope' }
    ];

    const recommendation = RecommendationService.generateStructuredRecommendation({
      category: 'NETWORK',
      selectedIssue: vpnIssue,
      answers,
      evidence,
      confidence: 80
    });

    expect(recommendation.action).toBeDefined();
    expect(recommendation.reason).toBeDefined();
    expect(recommendation.expected_result).toBeDefined();
    expect(recommendation.fallback_action).toBeDefined();
    expect(recommendation.escalation).toBeDefined();
    expect(recommendation.confidence).toBe(80);
    expect(vpnIssue.troubleshooting_steps).toContain(recommendation.action);
  });

  it('2. Low Confidence (< 60%): Refrains from claiming certainty when evidence is insufficient', () => {
    const bsodIssue = TaxonomyService.findIssueTypeById('kb_dev_bsod_01')!;

    const recommendation = RecommendationService.generateStructuredRecommendation({
      category: 'DEVICE',
      selectedIssue: bsodIssue,
      answers: {},
      evidence: [],
      confidence: 45
    });

    expect(recommendation.confidence).toBe(45);
    expect(recommendation.reason).toContain('Insufficient diagnostic evidence');
    expect(recommendation.escalation.recommended).toBe(false);
  });

  it('3. Safety Hazard Override: Recommends ON_SITE_BAR escalation for swollen laptop battery', () => {
    const batteryIssue = TaxonomyService.findIssueTypeById('kb_dev_battery_04')!;

    const answers: Record<string, TriageAnswer> = {
      q_battery_phys: {
        questionId: 'q_battery_phys',
        questionText: 'Physical swelling?',
        answerValue: 'battery_swollen',
        timestamp: new Date().toISOString()
      }
    };

    const recommendation = RecommendationService.generateStructuredRecommendation({
      category: 'DEVICE',
      selectedIssue: batteryIssue,
      answers,
      evidence: [],
      confidence: 95
    });

    expect(recommendation.action).toContain('SAFETY MANDATE');
    expect(recommendation.escalation.recommended).toBe(true);
    expect(recommendation.escalation.tier).toBe('ON_SITE_BAR');
  });

  it('4. Security Incident Escalation: Recommends INFOSEC_SIRT escalation for phishing credential exposure', () => {
    const phishingIssue = TaxonomyService.findIssueTypeById('kb_sec_phishing_01')!;

    const answers: Record<string, TriageAnswer> = {
      q_sec_action: {
        questionId: 'q_sec_action',
        questionText: 'Entered creds?',
        answerValue: 'creds_exposed',
        timestamp: new Date().toISOString()
      }
    };

    const recommendation = RecommendationService.generateStructuredRecommendation({
      category: 'OTHER',
      selectedIssue: phishingIssue,
      answers,
      evidence: [],
      confidence: 95
    });

    expect(recommendation.action).toContain('SECURITY MANDATE');
    expect(recommendation.escalation.recommended).toBe(true);
    expect(recommendation.escalation.tier).toBe('INFOSEC_SIRT');
  });

  it('5. Avoids repeating previously executed troubleshooting actions', () => {
    const vpnIssue = TaxonomyService.findIssueTypeById('kb_net_vpn_01')!;
    const firstStep = vpnIssue.troubleshooting_steps[0];

    const recommendation = RecommendationService.generateStructuredRecommendation({
      category: 'NETWORK',
      selectedIssue: vpnIssue,
      answers: {},
      evidence: [],
      previousActions: [firstStep],
      confidence: 75
    });

    // Should skip firstStep because it was already executed!
    expect(recommendation.action).not.toBe(firstStep);
  });
});
