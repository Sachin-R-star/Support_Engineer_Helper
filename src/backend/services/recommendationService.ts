import { 
  KbIssueDefinition, 
  IncidentCategory, 
  TriageAnswer, 
  TriageEvidence,
  RecommendationPayload,
  EscalationDetail,
  EscalationTier
} from '../models';
import { AiReliabilityService } from './aiReliabilityService';

export interface RecommendationContext {
  category: IncidentCategory;
  selectedIssue: KbIssueDefinition;
  answers: Record<string, TriageAnswer>;
  evidence: TriageEvidence[];
  previousActions?: string[];
  confidence: number;
}

export class RecommendationService {
  /**
   * Main Structured Recommendation Engine.
   * Derives auditable next steps directly from Knowledge Base troubleshooting steps,
   * collected answers, evidence facts, and confidence levels.
   */
  public static generateStructuredRecommendation(context: RecommendationContext): RecommendationPayload {
    const { category, selectedIssue, answers, evidence, previousActions, confidence } = context;
    const answerValues = Object.values(answers).map(a => a.answerValue);
    const kbSteps = selectedIssue.troubleshooting_steps || [];

    // 1. Safety Hazard Override Rule: Swollen Battery -> Immediate hardware swap
    if (answerValues.includes('battery_swollen')) {
      return {
        action: 'SAFETY MANDATE: Immediately power off laptop, disconnect AC charger, and do not attempt to charge.',
        reason: 'Physical battery swelling poses a thermal expansion and safety hazard.',
        expected_result: 'Device remains thermally safe until physical battery replacement.',
        fallback_action: 'If device cannot be powered off normally, press and hold power button for 10 seconds.',
        escalation: {
          recommended: true,
          tier: 'ON_SITE_BAR',
          reason: 'Physical hardware battery replacement required at On-Site IT Bar.'
        },
        confidence: 98
      };
    }

    // 2. Security Incident Override Rule: Credential Theft / Phishing Link Clicked -> SIRT Escalation
    if (answerValues.includes('creds_exposed') || answerValues.includes('file_executed')) {
      return {
        action: 'SECURITY MANDATE: Disconnect device from corporate Wi-Fi/Ethernet and trigger immediate SSO token revocation.',
        reason: 'Active credential exposure or malicious payload execution detected on workstation.',
        expected_result: 'Corporate network assets isolated and compromised session tokens invalidated.',
        fallback_action: 'Perform emergency manual AD account lock via Self-Service Portal or IT Desk helpline.',
        escalation: {
          recommended: true,
          tier: 'INFOSEC_SIRT',
          reason: 'Active credential theft escalated directly to InfoSec Incident Response Team.'
        },
        confidence: 95
      };
    }

    // 3. LOW CONFIDENCE RULE (< 60%): Never claim certainty when evidence is insufficient!
    if (confidence < 60) {
      const missingFields = selectedIssue.required_information.slice(0, 2).join(', ');
      return {
        action: kbSteps[0] || 'Perform initial diagnostic assessment and verify system power/network indicators.',
        reason: `Insufficient diagnostic evidence gathered to reach definitive resolution path. Missing information: ${missingFields || 'unconfirmed diagnostic symptoms'}.`,
        expected_result: 'Clarifies preliminary diagnostic symptoms before committing to heavy troubleshooting.',
        fallback_action: 'Escalate ticket to Tier 1 IT Service Desk for manual triage interview.',
        escalation: {
          recommended: false,
          tier: 'NONE',
          reason: 'Diagnostic evidence insufficient; additional triage input requested before escalation.'
        },
        confidence
      };
    }

    // 4. Primary Knowledge-Base Step Mapping based on Answers & Evidence
    let primaryStep = kbSteps[0] || 'Escalate request to IT Service Desk.';
    let expectedOutcome = 'Restores standard functionality and resolves symptom.';
    let fallbackStep = kbSteps[1] || 'Escalate to Tier 2 IT Support.';
    let escalationTier: EscalationTier = 'NONE';
    let escalationReason = 'Standard resolution path within Tier 1 / Self-Service capabilities.';

    if (answerValues.includes('locked_out')) {
      primaryStep = kbSteps[0] || 'Direct user to Enterprise Self-Service Password Portal (id.enterprise.com/reset).';
      expectedOutcome = 'Active Directory / SSO account unlocks and user authenticates successfully.';
      fallbackStep = 'Initiate manual account unlock via Tier 1 IT Helpdesk agent console.';
      escalationTier = 'TIER_1';
      escalationReason = 'Self-service portal unblocks user; Tier 1 escalation only if SMS 2FA token fails.';
    } else if (answerValues.includes('public_ok')) {
      primaryStep = kbSteps[1] || kbSteps[0] || 'Flush local DNS cache and reconnect to fallback VPN gateway.';
      expectedOutcome = 'Establishes stable IPSec tunnel via secondary regional VPN node.';
      fallbackStep = kbSteps[2] || 'Reinstall GlobalProtect VPN network virtual adapter driver.';
      escalationTier = 'TIER_2';
      escalationReason = 'Network gateway routing failure requiring Tier 2 Network team investigation.';
    } else if (answerValues.includes('no_power') || answerValues.includes('boot_crash')) {
      primaryStep = kbSteps[0] || 'Perform SMC/EC power reset by holding power button for 30 seconds.';
      expectedOutcome = 'System completes POST boot cycle into operating system.',
      fallbackStep = 'Schedule workstation hardware diagnostic appointment at IT Bar.';
      escalationTier = 'ON_SITE_BAR';
      escalationReason = 'Hardware kernel boot fault requiring physical hardware repair.';
    }

    // Filter out previously executed actions to avoid repeating ineffective steps!
    if (previousActions && previousActions.length > 0) {
      const remainingSteps = kbSteps.filter(step => !previousActions.includes(step));
      if (remainingSteps.length > 0) {
        primaryStep = remainingSteps[0];
        fallbackStep = remainingSteps[1] || 'Escalate to Tier 2 IT Support.';
      } else if (kbSteps.length > 0) {
        primaryStep = 'All standard troubleshooting steps previously attempted. Escalate ticket to Tier 2 engineering team.';
        fallbackStep = 'Schedule physical hardware/workstation diagnostic at IT Support Bar.';
        escalationTier = 'TIER_2';
        escalationReason = 'All automated KB steps exhausted without resolution.';
      }
    }

    const rationale = `Matched KB troubleshooting step for ${selectedIssue.display_name} (${selectedIssue.category}/${selectedIssue.subdomain}) based on diagnostic evidence.`;

    // AI Reliability Grounding Enforcement
    const groundingCheck = AiReliabilityService.groundTroubleshootingAction(
      primaryStep,
      kbSteps,
      selectedIssue.id
    );

    return {
      action: groundingCheck.action,
      reason: rationale,
      expected_result: expectedOutcome,
      fallback_action: fallbackStep,
      escalation: {
        recommended: escalationTier !== 'NONE',
        tier: escalationTier,
        reason: escalationReason
      },
      confidence
    };
  }

  /**
   * Legacy Helper Method for backwards compatibility.
   */
  public static generateRecommendation(
    category: IncidentCategory,
    selectedIssue: KbIssueDefinition,
    answers: Record<string, TriageAnswer>,
    confidence: number
  ): { recommendedNextStep: string; missingInformation: string[] } {
    const structured = this.generateStructuredRecommendation({
      category,
      selectedIssue,
      answers,
      evidence: [],
      confidence
    });

    const missingInfo: string[] = [];
    if (confidence < 60) {
      missingInfo.push(...selectedIssue.required_information);
    }

    return {
      recommendedNextStep: structured.action,
      missingInformation: missingInfo
    };
  }
}
