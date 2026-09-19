import { 
  StructuredTriageState, 
  DiagnosticHypothesis, 
  AdaptiveStepPayload, 
  KbDiagnosticQuestion, 
  KbIssueDefinition,
  IncidentCategory,
  TriageAnswer
} from '../models';
import { TaxonomyService } from './taxonomyService';
import { QuestionEngine } from './questionEngine';
import { RecommendationService } from './recommendationService';
import { ReliabilityLogger } from './reliabilityLogger';

export class AdaptiveTroubleshootingEngine {
  /**
   * Main Entry Point: Dynamically calculates the next best diagnostic step (Question or Action)
   * using Information-Gain heuristic scoring across competing hypotheses.
   */
  public static selectNextAdaptiveStep(state: StructuredTriageState): AdaptiveStepPayload | null {
    try {
      // 1. Compile Plausible Diagnostic Hypotheses
      const hypotheses = this.evaluateHypotheses(state);
      const plausibleHypotheses = hypotheses.filter(h => h.isPlausible);

      // 2. Gather Candidate Questions and Safe Actions
      const candidateQuestions = this.gatherCandidateQuestions(state);
      const candidateActions = this.gatherCandidateActions(state);

      // 3. Score Candidates using Information-Gain Heuristic
      const scoredCandidates: {
        id: string;
        type: 'QUESTION' | 'ACTION';
        title: string;
        question?: KbDiagnosticQuestion;
        actionText?: string;
        score: number;
        rationale: string;
        hypothesesDistinguished: string[];
        evidenceUsed: string[];
        scoringBreakdown: AdaptiveStepPayload['scoringBreakdown'];
      }[] = [];

      // Score Candidate Questions
      for (const q of candidateQuestions) {
        const scoreResult = this.scoreQuestion(q, plausibleHypotheses, state);
        scoredCandidates.push({
          id: q.id,
          type: 'QUESTION',
          title: q.question_text,
          question: q,
          score: scoreResult.finalScore,
          rationale: scoreResult.rationale,
          hypothesesDistinguished: scoreResult.distinguishedHypotheses,
          evidenceUsed: scoreResult.evidenceUsed,
          scoringBreakdown: scoreResult.breakdown
        });
      }

      // Score Candidate Actions
      for (const act of candidateActions) {
        const scoreResult = this.scoreAction(act, plausibleHypotheses, state);
        scoredCandidates.push({
          id: `act_${act.issueId}_${act.stepIndex}`,
          type: 'ACTION',
          title: act.actionText,
          actionText: act.actionText,
          score: scoreResult.finalScore,
          rationale: scoreResult.rationale,
          hypothesesDistinguished: scoreResult.distinguishedHypotheses,
          evidenceUsed: scoreResult.evidenceUsed,
          scoringBreakdown: scoreResult.breakdown
        });
      }

      // Sort by score descending
      scoredCandidates.sort((a, b) => b.score - a.score);

      // Filter out invalid or zero-score steps
      const validCandidates = scoredCandidates.filter(c => c.score > 0);

      if (validCandidates.length === 0) {
        return this.generateFallbackStep(state);
      }

      const topCandidate = validCandidates[0];
      const alternatives = validCandidates.slice(1, 4).map(alt => ({
        id: alt.id,
        title: alt.title,
        score: alt.score,
        type: alt.type
      }));

      const topConfidenceBand: 'HIGH' | 'MEDIUM' | 'LOW' =
        topCandidate.score >= 75 ? 'HIGH' : topCandidate.score >= 50 ? 'MEDIUM' : 'LOW';

      return {
        selectedStepId: topCandidate.id,
        type: topCandidate.type,
        title: topCandidate.title,
        question: topCandidate.question,
        actionText: topCandidate.actionText,
        score: topCandidate.score,
        rationale: topCandidate.rationale,
        hypothesesDistinguished: topCandidate.hypothesesDistinguished,
        evidenceUsed: topCandidate.evidenceUsed,
        alternativesConsidered: alternatives,
        scoringBreakdown: topCandidate.scoringBreakdown,
        confidenceBand: topConfidenceBand
      };
    } catch (err: any) {
      ReliabilityLogger.logModelFailure('AdaptiveTroubleshootingEngine', err.message || String(err));
      return this.generateFallbackStep(state);
    }
  }

  /**
   * Compiles and evaluates all candidate diagnostic hypotheses based on empirical evidence.
   */
  public static evaluateHypotheses(state: StructuredTriageState): DiagnosticHypothesis[] {
    const taxonomy = TaxonomyService.getTaxonomy();
    const candidateIds = new Set(state.candidateIssues.map(c => c.issueTypeId));
    const answers = Object.values(state.answers);
    const answerValues = answers.map(a => a.answerValue);

    const hypotheses: DiagnosticHypothesis[] = [];

    for (const issueDef of taxonomy) {
      // Relevance check: issue matches candidate pool or category
      const isCandidate = candidateIds.has(issueDef.id);
      const isSelected = state.selectedIssue?.id === issueDef.id;
      const isCategoryMatch = state.selectedIssue ? state.selectedIssue.category === issueDef.category : true;

      if (!isCandidate && !isSelected && !isCategoryMatch) {
        continue;
      }

      const supportingEvidence: string[] = [];
      const contradictingEvidence: string[] = [];

      // Evaluate supporting/contradicting evidence
      if (/vpn/i.test(state.originalInput) && issueDef.subdomain === 'VPN') {
        supportingEvidence.push('User query explicitly mentions VPN');
      }
      if (/wifi|wi-fi|wireless/i.test(state.originalInput) && issueDef.keywords.includes('wifi')) {
        supportingEvidence.push('User query mentions Wi-Fi / Wireless');
      }
      if (/password|lockout|sso/i.test(state.originalInput) && issueDef.category === 'ACCOUNT') {
        supportingEvidence.push('User query mentions account lockout/credentials');
      }

      // Check user answers against diagnostic option signals
      for (const ans of answers) {
        if (ans.answerValue === 'public_ok' && issueDef.issue_type === 'vpn_gateway_timeout') {
          supportingEvidence.push('Public internet works outside VPN; isolates VPN gateway node');
        }
        if (ans.answerValue === 'local_network_down' && issueDef.issue_type === 'vpn_gateway_timeout') {
          contradictingEvidence.push('Local network is completely down; excludes remote gateway fault');
        }
        if (ans.answerValue === 'public_ok' && issueDef.issue_type === 'wifi_captive_portal_failure') {
          contradictingEvidence.push('Public internet functions outside VPN; contradicts local Wi-Fi outage');
        }
      }

      const isPlausible = contradictingEvidence.length === 0 || supportingEvidence.length >= contradictingEvidence.length;
      let score = isCandidate ? 60 : 40;
      if (isSelected) score += 25;
      score += supportingEvidence.length * 15;
      score -= contradictingEvidence.length * 30;

      const boundedScore = Math.max(0, Math.min(100, score));
      const band: 'HIGH' | 'MEDIUM' | 'LOW' =
        boundedScore >= 75 ? 'HIGH' : boundedScore >= 50 ? 'MEDIUM' : 'LOW';

      hypotheses.push({
        id: issueDef.id,
        title: issueDef.display_name,
        description: issueDef.description,
        category: issueDef.category,
        confidenceBand: band,
        heuristicScore: boundedScore,
        supportingEvidence,
        contradictingEvidence,
        source: 'knowledge_base',
        isPlausible
      });
    }

    return hypotheses;
  }

  /**
   * Scores a candidate diagnostic question using Information-Gain heuristic.
   */
  private static scoreQuestion(
    q: KbDiagnosticQuestion,
    plausibleHypotheses: DiagnosticHypothesis[],
    state: StructuredTriageState
  ): {
    finalScore: number;
    rationale: string;
    distinguishedHypotheses: string[];
    evidenceUsed: string[];
    breakdown: AdaptiveStepPayload['scoringBreakdown'];
  } {
    const answeredIds = new Set(Object.keys(state.answers));
    const isAnswered = answeredIds.has(q.id);

    let discriminationPoints = 0;
    const distinguishedHypotheses: string[] = [];

    // Evaluate how many plausible hypotheses this question helps distinguish
    for (const hyp of plausibleHypotheses) {
      if (q.question_text.toLowerCase().includes(hyp.category.toLowerCase()) || 
          hyp.title.toLowerCase().includes(q.id.replace('q_', ''))) {
        discriminationPoints += 25;
        distinguishedHypotheses.push(hyp.title);
      }
    }

    if (plausibleHypotheses.length >= 2 && discriminationPoints === 0) {
      // Split discrimination default for category questions
      discriminationPoints = 40;
      distinguishedHypotheses.push(...plausibleHypotheses.slice(0, 2).map(h => h.title));
    }

    const relevance = state.selectedIssue?.diagnostic_questions.some(dq => dq.id === q.id) ? 35 : 15;
    const safetyBonus = 20; // Questions carry zero thermal/hardware risk
    const userEffortPenalty = q.answer_type === 'YES_NO' ? 0 : 10;
    const repetitionPenalty = isAnswered ? 100 : 0;
    
    let prerequisitePenalty = 0;
    if (q.prerequisite_question_id && !state.answers[q.prerequisite_question_id]) {
      prerequisitePenalty = 60;
    }

    const rawScore = discriminationPoints + relevance + safetyBonus - userEffortPenalty - repetitionPenalty - prerequisitePenalty;
    const finalScore = Math.max(0, Math.min(100, rawScore));

    const distList = distinguishedHypotheses.length > 0 ? distinguishedHypotheses.join(' vs ') : 'competing hypotheses';
    const rationale = `Question "${q.question_text}" selected to distinguish between ${distList} with low user effort and zero safety risk.`;

    return {
      finalScore,
      rationale,
      distinguishedHypotheses,
      evidenceUsed: Object.values(state.answers).map(a => `${a.questionId}: ${a.answerValue}`),
      breakdown: {
        hypothesisDiscrimination: discriminationPoints,
        relevance,
        safetyBonus,
        userEffortPenalty,
        repetitionPenalty,
        prerequisitePenalty,
        finalScore
      }
    };
  }

  /**
   * Scores a candidate safe action using Information-Gain heuristic.
   */
  private static scoreAction(
    action: { issueId: string; stepIndex: number; actionText: string; isHighRisk?: boolean },
    plausibleHypotheses: DiagnosticHypothesis[],
    state: StructuredTriageState
  ): {
    finalScore: number;
    rationale: string;
    distinguishedHypotheses: string[];
    evidenceUsed: string[];
    breakdown: AdaptiveStepPayload['scoringBreakdown'];
  } {
    const isAttempted = Object.values(state.answers).some(
      ans => ans.questionText === action.actionText || ans.answerValue === action.actionText
    );
    const isHighRisk = action.isHighRisk || /format|wipe|delete|sirt|swollen/i.test(action.actionText);

    // High Risk Safety Block: Block high risk actions from being selected as routine steps
    if (isHighRisk) {
      return {
        finalScore: 0,
        rationale: 'High risk action blocked by safety protocol.',
        distinguishedHypotheses: [],
        evidenceUsed: [],
        breakdown: {
          hypothesisDiscrimination: 0,
          relevance: 0,
          safetyBonus: 0,
          userEffortPenalty: 50,
          repetitionPenalty: 0,
          prerequisitePenalty: 0,
          finalScore: 0
        }
      };
    }

    const discriminationPoints = 30;
    const relevance = state.selectedIssue?.id === action.issueId ? 30 : 10;
    const safetyBonus = 10;
    const userEffortPenalty = 20; // Actions require user effort
    const repetitionPenalty = isAttempted ? 100 : 0;
    const prerequisitePenalty = state.questionHistory.length === 0 ? 30 : 0; // Prefer asking at least 1 question first

    const rawScore = discriminationPoints + relevance + safetyBonus - userEffortPenalty - repetitionPenalty - prerequisitePenalty;
    const finalScore = Math.max(0, Math.min(100, rawScore));

    const matchingHyp = plausibleHypotheses.find(h => h.id === action.issueId);
    const hypTitle = matchingHyp ? matchingHyp.title : 'top hypothesis';
    const rationale = `Safe troubleshooting action "${action.actionText}" verifies hypothesis "${hypTitle}" directly.`;

    return {
      finalScore,
      rationale,
      distinguishedHypotheses: matchingHyp ? [matchingHyp.title] : [],
      evidenceUsed: [state.originalInput],
      breakdown: {
        hypothesisDiscrimination: discriminationPoints,
        relevance,
        safetyBonus,
        userEffortPenalty,
        repetitionPenalty,
        prerequisitePenalty,
        finalScore
      }
    };
  }

  /**
   * Gathers unanswered candidate questions from current state and category catalog.
   */
  private static gatherCandidateQuestions(state: StructuredTriageState): KbDiagnosticQuestion[] {
    const questions: KbDiagnosticQuestion[] = [];
    const answeredIds = new Set(Object.keys(state.answers));

    if (state.selectedIssue) {
      for (const q of state.selectedIssue.diagnostic_questions) {
        if (!answeredIds.has(q.id)) {
          questions.push(q);
        }
      }
    }

    const taxonomy = TaxonomyService.getTaxonomy();
    for (const issue of taxonomy) {
      if (state.selectedIssue && issue.category === state.selectedIssue.category) {
        for (const q of issue.diagnostic_questions) {
          if (!answeredIds.has(q.id) && !questions.some(existing => existing.id === q.id)) {
            questions.push(q);
          }
        }
      }
    }

    return questions;
  }

  /**
   * Gathers safe candidate troubleshooting actions from Knowledge Base.
   */
  private static gatherCandidateActions(state: StructuredTriageState): { issueId: string; stepIndex: number; actionText: string }[] {
    const actions: { issueId: string; stepIndex: number; actionText: string }[] = [];
    if (!state.selectedIssue) return actions;

    const steps = state.selectedIssue.troubleshooting_steps || [];
    steps.forEach((stepText, idx) => {
      actions.push({
        issueId: state.selectedIssue!.id,
        stepIndex: idx,
        actionText: stepText
      });
    });

    return actions;
  }

  /**
   * Safe Fallback Step Generator when adaptive scoring is unavailable or exhausted.
   */
  private static generateFallbackStep(state: StructuredTriageState): AdaptiveStepPayload {
    const defaultQuestion = QuestionEngine.getNextQuestion(state);
    if (defaultQuestion) {
      return {
        selectedStepId: defaultQuestion.id,
        type: 'QUESTION',
        title: defaultQuestion.question_text,
        question: defaultQuestion,
        score: 50,
        rationale: 'Fallback diagnostic question selected from Knowledge Base branching logic.',
        hypothesesDistinguished: [state.selectedIssue?.display_name || 'Current Issue'],
        evidenceUsed: [state.originalInput],
        alternativesConsidered: [],
        scoringBreakdown: {
          hypothesisDiscrimination: 25,
          relevance: 25,
          safetyBonus: 10,
          userEffortPenalty: 10,
          repetitionPenalty: 0,
          prerequisitePenalty: 0,
          finalScore: 50
        },
        confidenceBand: 'MEDIUM'
      };
    }

    const rec = RecommendationService.generateStructuredRecommendation({
      category: state.selectedIssue?.category || 'OTHER',
      selectedIssue: state.selectedIssue || TaxonomyService.getTaxonomy()[0],
      answers: state.answers,
      evidence: state.evidence,
      confidence: state.confidence
    });

    return {
      selectedStepId: 'act_fallback_rec',
      type: 'ACTION',
      title: rec.action,
      actionText: rec.action,
      score: 45,
      rationale: rec.reason || 'Fallback troubleshooting recommendation derived from grounded Knowledge Base.',
      hypothesesDistinguished: [state.selectedIssue?.display_name || 'General IT Issue'],
      evidenceUsed: [state.originalInput],
      alternativesConsidered: [],
      scoringBreakdown: {
        hypothesisDiscrimination: 20,
        relevance: 25,
        safetyBonus: 10,
        userEffortPenalty: 10,
        repetitionPenalty: 0,
        prerequisitePenalty: 0,
        finalScore: 45
      },
      confidenceBand: 'MEDIUM'
    };
  }
}
