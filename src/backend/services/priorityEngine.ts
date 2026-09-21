import { 
  IncidentCategory, 
  User, 
  KbIssueDefinition, 
  TriageAnswer, 
  PriorityLevel, 
  StructuredPrioritySignals, 
  ContributingFactor, 
  PriorityResultPayload,
  UsersAffectedScope
} from '../models';
import { DEFAULT_PRIORITY_CONFIG } from '../config/priorityConfig';

export interface PriorityContext {
  category: IncidentCategory;
  issueType: KbIssueDefinition;
  user?: User | null;
  answers: Record<string, TriageAnswer>;
  initialQuery: string;
  structuredSignals?: StructuredPrioritySignals;
}

export class PriorityEngine {
  /**
   * Main Explainable Priority Evaluator.
   * Evaluates structured signals against configurable weights and thresholds.
   * Returns exact { priority, score, contributing_factors, explanation } payload.
   */
  public static evaluatePriority(
    signals?: StructuredPrioritySignals,
    context?: Partial<PriorityContext>
  ): PriorityResultPayload {
    const config = DEFAULT_PRIORITY_CONFIG;
    const factors: ContributingFactor[] = [];
    let rawScore = 0;

    const queryLower = (context?.initialQuery || '').toLowerCase();
    const answerValues = context?.answers ? Object.values(context.answers).map(a => a.answerValue) : [];
    const isVip = Boolean(context?.user?.isVip);

    // Helper to add factor
    const addFactor = (factor: string, weight: number, scoreAdded: number, reasonCode: string, desc: string) => {
      factors.push({
        factor,
        weight,
        score_added: scoreAdded,
        reason_code: reasonCode,
        description: desc
      });
      rawScore += scoreAdded;
    };

    // 1. Mandatory Security Compromise Override Rule
    const isSecurityCompromise = 
      signals?.security_implications ||
      context?.category === 'OTHER' && context?.issueType?.subdomain === 'SECURITY' ||
      answerValues.includes('creds_exposed') ||
      answerValues.includes('file_executed') ||
      queryLower.includes('ransomware') ||
      queryLower.includes('phishing link');

    if (isSecurityCompromise) {
      addFactor(
        'Security Compromise Alert',
        config.weights.security_implications,
        config.weights.security_implications,
        config.reasonCodes.SECURITY_THREAT_DETECTED,
        'Active security threat, credential exposure, or malware execution detected.'
      );
    }

    // 2. Hardware Safety Hazard Override Rule (Swollen Battery)
    const isSafetyHazard = answerValues.includes('battery_swollen') || queryLower.includes('swollen battery');
    if (isSafetyHazard) {
      addFactor(
        'Physical Safety Hazard',
        60,
        60,
        config.reasonCodes.SAFETY_HAZARD_DETECTED,
        'Physical laptop battery swelling reported (immediate hardware replacement required).'
      );
    }

    // 3. Number of Users Affected
    let usersScope: UsersAffectedScope = signals?.users_affected || 'SINGLE_USER';
    if (queryLower.includes('all users') || queryLower.includes('entire office') || answerValues.includes('local_network_down')) {
      usersScope = 'ENTIRE_ORGANIZATION';
    } else if (queryLower.includes('department') || queryLower.includes('entire floor')) {
      usersScope = 'DEPARTMENT';
    } else if (queryLower.includes('team') || queryLower.includes('multiple colleagues')) {
      usersScope = 'TEAM';
    }

    if (usersScope === 'ENTIRE_ORGANIZATION') {
      addFactor(
        'Users Affected (Entire Organization)',
        config.weights.users_affected.ENTIRE_ORGANIZATION,
        config.weights.users_affected.ENTIRE_ORGANIZATION,
        config.reasonCodes.ENTIRE_ORG_OUTAGE,
        'Facility or organization-wide outage affecting all users.'
      );
    } else if (usersScope === 'DEPARTMENT') {
      addFactor(
        'Users Affected (Department)',
        config.weights.users_affected.DEPARTMENT,
        config.weights.users_affected.DEPARTMENT,
        config.reasonCodes.DEPARTMENT_OUTAGE,
        'Multiple users across an entire department affected.'
      );
    } else if (usersScope === 'TEAM') {
      addFactor(
        'Users Affected (Team)',
        config.weights.users_affected.TEAM,
        config.weights.users_affected.TEAM,
        config.reasonCodes.TEAM_AFFECTED,
        'Multiple team members experiencing identical issue.'
      );
    }

    // 4. Work Completely Blocked
    const isWorkBlocked = 
      signals?.work_completely_blocked ||
      answerValues.includes('work_blocked') ||
      answerValues.includes('boot_crash') ||
      answerValues.includes('no_power') ||
      answerValues.includes('bsod_critical');

    if (isWorkBlocked) {
      addFactor(
        'Work Completely Blocked',
        config.weights.work_completely_blocked,
        config.weights.work_completely_blocked,
        config.reasonCodes.WORK_COMPLETELY_BLOCKED,
        'User is unable to perform primary daily job duties.'
      );
    }

    // 5. Critical System / Infrastructure Affected
    const isCriticalSystem = Boolean(
      signals?.critical_system_affected ||
      /critical server|domain controller|core router|backbone|datacenter|cluster outage/i.test(queryLower)
    );

    if (isCriticalSystem) {
      addFactor(
        'Critical Infrastructure Affected',
        config.weights.critical_system_affected,
        config.weights.critical_system_affected,
        config.reasonCodes.CRITICAL_SYSTEM_AFFECTED,
        'Critical infrastructure or core enterprise service degraded.'
      );
    }

    // 6. VIP Executive User Status
    if (isVip) {
      addFactor(
        'Executive VIP User',
        config.weights.is_vip_user,
        config.weights.is_vip_user,
        config.reasonCodes.VIP_EXECUTIVE_AFFECTED,
        'User holds designated Executive VIP status.'
      );
    }

    // 7. Client / Customer Impact
    if (signals?.client_customer_impact || queryLower.includes('customer') || queryLower.includes('client')) {
      addFactor(
        'Client/Customer Impact',
        config.weights.client_customer_impact,
        config.weights.client_customer_impact,
        config.reasonCodes.CLIENT_CUSTOMER_IMPACT,
        'Issue directly impacts external clients or customer operations.'
      );
    }

    // 8. Urgent Meeting / Hard Deadline / Time-Sensitive Call
    const hasUrgentTimeSignal = 
      signals?.urgent_meeting_deadline || 
      /meeting|deadline|call|presentation|demo|interview|webinar|urgent|in \d+ (min|minute|hr|hour)/i.test(queryLower);

    if (hasUrgentTimeSignal) {
      addFactor(
        'Urgent Meeting/Deadline',
        config.weights.urgent_meeting_deadline,
        config.weights.urgent_meeting_deadline,
        config.reasonCodes.URGENT_DEADLINE,
        'User has an imminent call, deadline, or critical presentation.'
      );
    }

    // 9. Workaround Availability (Reduces Priority Score!)
    const hasWorkaround = 
      signals?.workaround_available ||
      answerValues.includes('public_ok') ||
      answerValues.includes('webmail_ok') ||
      answerValues.includes('single_app');

    if (hasWorkaround) {
      addFactor(
        'Workaround Available',
        config.weights.workaround_available,
        config.weights.workaround_available,
        config.reasonCodes.WORKAROUND_AVAILABLE_REDUCTION,
        'Viable alternative workaround exists (e.g. webmail access or public internet working).'
      );
    }

    // Default factor if no signals hit
    if (factors.length === 0) {
      addFactor(
        'Routine IT Request',
        10,
        10,
        config.reasonCodes.ROUTINE_REQUEST,
        'Standard single-user IT inquiry or minor configuration request.'
      );
    }

    // Bound total score between 0 and 100
    const finalScore = Math.min(100, Math.max(0, rawScore));

    // Determine Final Priority Tier based on Configured Thresholds
    let priority: PriorityLevel = 'LOW';
    if (isSecurityCompromise || isSafetyHazard || usersScope === 'ENTIRE_ORGANIZATION' || isVip || finalScore >= config.thresholds.CRITICAL) {
      priority = 'CRITICAL';
    } else if (finalScore >= config.thresholds.HIGH) {
      priority = 'HIGH';
    } else if (finalScore >= config.thresholds.MEDIUM) {
      priority = 'MEDIUM';
    } else {
      priority = 'LOW';
    }

    // Generate Human-Readable Explanation
    const factorSummaries = factors.map(f => `${f.factor} (${f.score_added > 0 ? '+' : ''}${f.score_added} pts)`).join(', ');
    const explanation = `Priority evaluated as ${priority} (Score: ${finalScore}/100). Key contributing factors: ${factorSummaries}.`;

    return {
      priority,
      score: finalScore,
      contributing_factors: factors,
      explanation
    };
  }

  /**
   * Legacy Helper Method for backwards compatibility with triage engine interfaces.
   */
  public static calculatePriority(context: PriorityContext): { priority: string; reasoning: string } {
    const result = this.evaluatePriority(context.structuredSignals, context);
    
    // Map CRITICAL -> P1_CRITICAL, HIGH -> P2_HIGH, MEDIUM -> P3_MEDIUM, LOW -> P4_LOW for legacy ticket tables
    let legacyPriority = 'P4_LOW';
    if (result.priority === 'CRITICAL') legacyPriority = 'P1_CRITICAL';
    else if (result.priority === 'HIGH') legacyPriority = 'P2_HIGH';
    else if (result.priority === 'MEDIUM') legacyPriority = 'P3_MEDIUM';

    return {
      priority: legacyPriority,
      reasoning: result.explanation
    };
  }
}
