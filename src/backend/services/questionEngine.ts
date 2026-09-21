import { 
  KbIssueDefinition, 
  KbDiagnosticQuestion, 
  StructuredTriageState,
  TriageAnswer
} from '../models';
import { TaxonomyService } from './taxonomyService';

export class QuestionEngine {
  /**
   * Determines the next single question to present to the user based on branching logic and state context.
   * Never repeats answered questions. Skips questions failing prerequisite conditions.
   * Returns null if diagnosis readiness threshold is reached or no further questions exist.
   */
  public static getNextQuestion(state: StructuredTriageState): KbDiagnosticQuestion | null {
    if (!state.selectedIssue) {
      return null;
    }

    // Diagnosis Readiness Check: If confidence >= 85%, stop progressive questioning early!
    if (state.confidence >= 85) {
      return null;
    }

    // 0. Memory Integration: If a preceding causal action was detected in recent memory, ask targeted verification question first!
    const answeredQuestionIds = new Set(Object.keys(state.answers));
    if (
      state.memoryContext?.hasPrecedingCausalAction && 
      !answeredQuestionIds.has('q_historical_causal_check') &&
      state.memoryContext.precedingCausalActionSummary
    ) {
      return {
        id: 'q_historical_causal_check',
        question_text: `Did this issue start immediately after the preceding action (${state.memoryContext.precedingCausalActionSummary})?`,
        answer_type: 'YES_NO',
        options: [
          { label: 'Yes, it started right after that action', value: 'yes_after_action' },
          { label: 'No, it was happening before', value: 'no_prior_issue' },
          { label: "I don't know / Not sure", value: 'UNSURE' }
        ]
      };
    }

    const issue = state.selectedIssue;

    // 1. Evaluate questions belonging to the selected issue definition
    for (const rawQuestion of issue.diagnostic_questions) {
      if (answeredQuestionIds.has(rawQuestion.id)) {
        continue;
      }

      // Component Grounding Check: Skip questions assuming ungrounded hardware/software components
      if (!this.isQuestionGrounded(rawQuestion, state)) {
        continue;
      }

      // Evaluate Branching Prerequisite
      if (rawQuestion.prerequisite_question_id) {
        const prereqAnswer = state.answers[rawQuestion.prerequisite_question_id];
        if (!prereqAnswer) {
          // Prerequisite question not answered yet -> skip for now
          continue;
        }
        if (
          rawQuestion.prerequisite_answer_value &&
          prereqAnswer.answerValue !== rawQuestion.prerequisite_answer_value &&
          prereqAnswer.answerValue !== 'UNSURE'
        ) {
          // Prerequisite answer condition not satisfied -> skip this question!
          continue;
        }
      }

      return this.enrichQuestionWithOptions(rawQuestion);
    }

    // 2. Evaluate related category questions if selected issue questions exhausted and confidence < 75%
    if (state.confidence < 75) {
      const allKb = TaxonomyService.getTaxonomy();
      for (const otherIssue of allKb) {
        if (otherIssue.category === issue.category && otherIssue.id !== issue.id) {
          for (const rawQuestion of otherIssue.diagnostic_questions) {
            if (answeredQuestionIds.has(rawQuestion.id)) {
              continue;
            }

            // Component Grounding Check
            if (!this.isQuestionGrounded(rawQuestion, state)) {
              continue;
            }

            // Prerequisite check
            if (rawQuestion.prerequisite_question_id) {
              const prereqAnswer = state.answers[rawQuestion.prerequisite_question_id];
              if (!prereqAnswer || (rawQuestion.prerequisite_answer_value && prereqAnswer.answerValue !== rawQuestion.prerequisite_answer_value)) {
                continue;
              }
            }

            return this.enrichQuestionWithOptions(rawQuestion);
          }
        }
      }
    }

    // No remaining relevant questions
    return null;
  }

  /**
   * Checks if a diagnostic question is grounded in the current session context.
   * A question is grounded if it has no assumed components, OR all assumed components
   * are explicitly mentioned in the user query or confirmed in prior answers.
   */
  public static isQuestionGrounded(q: KbDiagnosticQuestion, state: StructuredTriageState): boolean {
    const queryLower = (state.originalInput || '').toLowerCase();
    const answerValues = Object.values(state.answers).map(a => (a.answerValue || '').toLowerCase());
    const answerTexts = Object.values(state.answers).map(a => `${a.questionText || ''} ${a.isUnsure ? '' : a.answerValue || ''}`.toLowerCase());

    const components = new Set<string>(q.assumed_components || []);
    const qTextLower = (q.question_text || '').toLowerCase();

    if (/docking station|thunderbolt dock/i.test(qTextLower)) components.add('docking_station');
    if (/printer|print spooler/i.test(qTextLower)) components.add('printer');
    if (/external monitor|second display|second screen/i.test(qTextLower)) components.add('external_monitor');
    if (/\bvpn\b|globalprotect|anyconnect/i.test(qTextLower)) components.add('vpn');
    if (/wi-fi|wifi/i.test(qTextLower)) components.add('wifi');

    for (const comp of components) {
      if (!this.isComponentGroundedInContext(comp, queryLower, answerValues, answerTexts)) {
        return false;
      }
    }
    return true;
  }

  private static isComponentGroundedInContext(
    comp: string,
    queryLower: string,
    answerValues: string[],
    answerTexts: string[]
  ): boolean {
    const term = comp.toLowerCase();
    switch (term) {
      case 'docking_station':
      case 'dock':
        return (
          /dock|docking|thunderbolt dock|usb-c dock/i.test(queryLower) ||
          answerValues.some(v => /dock/i.test(v)) ||
          answerTexts.some(t => /dock/i.test(t))
        );
      case 'external_monitor':
      case 'monitor':
        return (
          /external monitor|dual monitor|second screen|displayport|hdmi/i.test(queryLower) ||
          answerValues.some(v => /monitor|display/i.test(v)) ||
          answerTexts.some(t => /monitor/i.test(t))
        );
      case 'battery':
      case 'power':
        return (
          /battery|charger|charging|power|thermal|overheating|swollen/i.test(queryLower) ||
          answerValues.some(v => /battery|charger/i.test(v))
        );
      case 'vpn':
        return (
          /vpn|globalprotect|anyconnect|tunnel/i.test(queryLower) ||
          answerValues.some(v => /vpn/i.test(v))
        );
      case 'printer':
        return (
          /print|printer|spooler|papercut/i.test(queryLower) ||
          answerValues.some(v => /print/i.test(v))
        );
      case 'wifi':
        return (
          /wifi|wi-fi|wireless|ssid|captive/i.test(queryLower) ||
          answerValues.some(v => /wifi/i.test(v))
        );
      default:
        return queryLower.includes(term) || answerValues.some(v => v.includes(term));
    }
  }

  /**
   * Enriches a diagnostic question with default "I don't know / Unsure" choice option if choice question.
   */
  private static enrichQuestionWithOptions(q: KbDiagnosticQuestion): KbDiagnosticQuestion {
    const hasUnsure = q.options.some(opt => opt.value === 'UNSURE' || opt.label.toLowerCase().includes('don\'t know'));
    
    if (!hasUnsure && (q.answer_type === 'SINGLE_CHOICE' || q.answer_type === 'YES_NO' || !q.answer_type)) {
      return {
        ...q,
        options: [
          ...q.options,
          { label: "I don't know / Not sure", value: "UNSURE" }
        ]
      };
    }

    return q;
  }

  /**
   * Calculates overall diagnostic confidence score (0 to 100).
   */
  public static calculateConfidence(
    selectedIssue: KbIssueDefinition,
    answers: Record<string, TriageAnswer>
  ): number {
    let baseConfidence = 55;

    const answerEntries = Object.values(answers);
    const answeredCount = answerEntries.length;

    for (const ans of answerEntries) {
      if (ans.isUnsure || ans.answerValue === 'UNSURE') {
        // "I don't know" answers add small neutral confidence (+5%)
        baseConfidence += 5;
      } else {
        // Concrete answers reduce uncertainty (+20%)
        baseConfidence += 20;
      }
    }

    // High-value diagnostic answers
    const values = answerEntries.map(a => a.answerValue);
    if (values.includes('creds_exposed') || values.includes('locked_out') || values.includes('battery_swollen') || values.includes('bsod_critical')) {
      baseConfidence += 15;
    }

    return Math.min(98, Math.max(35, baseConfidence));
  }
}
