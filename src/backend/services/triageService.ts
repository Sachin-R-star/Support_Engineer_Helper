import { 
  StructuredTriageState, 
  CandidateIssue, 
  FinalTriageResult, 
  KbIssueDefinition,
  Incident,
  TriageAnswer,
  TriageEvidence,
  IncidentSummary,
  PriorityLevel,
  IncidentPriority,
  ActionVerificationPayload,
  VerificationLoopResponse,
  IncidentStatus,
  AttemptedActionRecord
} from '../models';
import { TaxonomyService } from './taxonomyService';
import { QuestionEngine } from './questionEngine';
import { PriorityEngine } from './priorityEngine';
import { RecommendationService } from './recommendationService';
import { MemoryService } from './memoryService';
import { IncidentRepository } from '../database/repositories/incidentRepo';
import { DatabaseService } from '../database/db';

import { RecoveryEngine } from './recoveryEngine';
import { AiReliabilityService } from './aiReliabilityService';
import { ReliabilityLogger } from './reliabilityLogger';
import { HybridDecisionEngine } from './ai/hybridDecisionEngine';
import { AdaptiveTroubleshootingEngine } from './adaptiveEngine';

export class TriageService {
  private static sessions: Map<string, StructuredTriageState> = new Map();
  private repo = new IncidentRepository();
  private memoryService = new MemoryService();

  /**
   * Initializes a new Structured Triage Session from universal user input.
   */
  public startSession(userId: string, query: string, deviceId?: string): StructuredTriageState {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const candidateMatches = TaxonomyService.matchCandidatesFromQuery(query);

    const candidateIssues: CandidateIssue[] = candidateMatches.map(m => ({
      issueTypeId: m.issueType.id,
      issueTypeName: m.issueType.display_name,
      category: m.issueType.category,
      confidence: m.confidence,
      matchReason: m.matchReason
    }));

    let selectedIssue: KbIssueDefinition | null = null;
    let step: StructuredTriageState['currentStep'] = 'AMBIGUITY_SELECTION';

    if (candidateMatches.length === 1 || candidateMatches[0].confidence >= 80) {
      selectedIssue = candidateMatches[0].issueType;
      step = 'PROGRESSIVE_QUESTION';
    }

    // Dead-End Scenario Detection
    const topConfidence = candidateMatches[0]?.confidence || 0;
    const deadEndReason = RecoveryEngine.detectDeadEndScenario(query, candidateMatches.length, topConfidence);
    
    let recoveryPayload: StructuredTriageState['recoveryPayload'];
    if (deadEndReason) {
      recoveryPayload = RecoveryEngine.buildRecoveryPayload(deadEndReason, query);
      if (['EMPTY_INPUT', 'NONSENSE_INPUT', 'UNRELATED_INPUT', 'EXTREMELY_VAGUE', 'NO_KB_MATCH'].includes(deadEndReason)) {
        step = 'AMBIGUITY_SELECTION';
        selectedIssue = null;
      }
    }

    // Memory Integration: Retrieve compact relevant memory context
    const memoryContext = this.memoryService.getRelevantMemoryContext(
      userId,
      selectedIssue?.category,
      selectedIssue?.issue_type,
      deviceId,
      query
    );

    const pastIncidents = memoryContext.relevantIncidents.map((inc: any) => ({
      incidentId: inc.incidentId,
      ticketNumber: inc.ticketNumber,
      summary: inc.summary,
      status: inc.resolution ? 'RESOLVED' : 'OPEN',
      createdAt: new Date().toISOString()
    }));

    // Hybrid AI Decision Engine execution
    const hybridDecision = HybridDecisionEngine.processHybridDecisionSync(
      sessionId,
      query,
      userId,
      deviceId,
      candidateIssues
    );

    const state: StructuredTriageState = {
      sessionId,
      userId,
      deviceId,
      currentStep: step,
      originalInput: query,
      candidateIssues,
      selectedIssue,
      answers: {},
      evidence: [],
      confidence: selectedIssue ? Math.min(65, candidateMatches[0].confidence) : 40,
      missingInformation: selectedIssue ? selectedIssue.required_information : [],
      relevantPreviousIncidents: pastIncidents,
      memoryContext,
      recoveryPayload,
      questionHistory: [],
      decisionTrace: hybridDecision.decisionTrace
    };

    if (step === 'PROGRESSIVE_QUESTION') {
      const nextQ = QuestionEngine.getNextQuestion(state);
      if (nextQ) {
        state.currentQuestion = nextQ;
        state.questionHistory.push(nextQ.id);
      } else {
        return this.finalizeSession(state);
      }
    }

    state.adaptiveStep = AdaptiveTroubleshootingEngine.selectNextAdaptiveStep(state) || undefined;
    TriageService.sessions.set(sessionId, state);
    return state;
  }

  /**
   * Disambiguates user selection when multiple candidate issues match.
   */
  public selectCandidateIssue(sessionId: string, issueTypeId: string): StructuredTriageState {
    const state = TriageService.sessions.get(sessionId);
    if (!state) throw new Error(`Triage session ${sessionId} not found`);

    const issueType = TaxonomyService.findIssueTypeById(issueTypeId);
    if (!issueType) throw new Error(`Issue type ${issueTypeId} invalid`);

    state.selectedIssue = issueType;
    state.currentStep = 'PROGRESSIVE_QUESTION';

    // Re-evaluate memory context with newly selected issue category/type
    state.memoryContext = this.memoryService.getRelevantMemoryContext(
      state.userId,
      issueType.category,
      issueType.issue_type,
      state.deviceId,
      state.originalInput
    );

    state.confidence = Math.min(65, QuestionEngine.calculateConfidence(issueType, state.answers));

    const nextQ = QuestionEngine.getNextQuestion(state);
    if (nextQ) {
      state.currentQuestion = nextQ;
      state.questionHistory.push(nextQ.id);
    } else {
      return this.finalizeSession(state);
    }

    state.adaptiveStep = AdaptiveTroubleshootingEngine.selectNextAdaptiveStep(state) || undefined;
    TriageService.sessions.set(sessionId, state);
    return state;
  }

  /**
   * Processes a single answer to a progressive triage question.
   */
  public processAnswer(
    sessionId: string, 
    questionId: string, 
    answerValue: string,
    isUnsure = false
  ): StructuredTriageState {
    const state = TriageService.sessions.get(sessionId);
    if (!state) throw new Error(`Triage session ${sessionId} not found`);

    const questionText = state.currentQuestion?.question_text || questionId;
    const isUnsureFlag = isUnsure || answerValue === 'UNSURE';

    const answerObj: TriageAnswer = {
      questionId,
      questionText,
      answerValue,
      isUnsure: isUnsureFlag,
      timestamp: new Date().toISOString()
    };

    state.answers[questionId] = answerObj;
    state.questionHistory.push(questionId); // Push answered question ID

    // Check for contradictory answers
    const deadEndReason = RecoveryEngine.detectDeadEndScenario(
      state.originalInput,
      state.candidateIssues.length,
      state.confidence,
      state.answers
    );

    if (deadEndReason === 'CONTRADICTORY_ANSWERS') {
      ReliabilityLogger.logContradictionDetected(questionId, answerValue);
      ReliabilityLogger.logFallbackActivated('CONTRADICTORY_ANSWERS', state.originalInput);
      state.recoveryPayload = RecoveryEngine.buildRecoveryPayload('CONTRADICTORY_ANSWERS', state.originalInput);
    }

    // Extract Evidence Fact
    if (!isUnsureFlag) {
      state.evidence.push({
        factKey: questionId,
        factValue: answerValue,
        sourceQuestionId: questionId
      });
    }

    // Recalculate Confidence
    if (state.selectedIssue) {
      state.confidence = QuestionEngine.calculateConfidence(state.selectedIssue, state.answers);
    }

    state.adaptiveStep = AdaptiveTroubleshootingEngine.selectNextAdaptiveStep(state) || undefined;

    // Determine Next Question or Finalize
    const nextQ = QuestionEngine.getNextQuestion(state);
    if (nextQ) {
      state.currentQuestion = nextQ;
      TriageService.sessions.set(sessionId, state);
      return state;
    }

    return this.finalizeSession(state);
  }

  /**
   * Reverts previous question step (Back button navigation).
   * Re-evaluates evidence and restores prior triage state.
   */
  public goBack(sessionId: string): StructuredTriageState {
    const state = TriageService.sessions.get(sessionId);
    if (!state) throw new Error(`Triage session ${sessionId} not found`);

    if (state.questionHistory.length === 0) {
      state.currentStep = 'AMBIGUITY_SELECTION';
      state.currentQuestion = undefined;
      state.adaptiveStep = AdaptiveTroubleshootingEngine.selectNextAdaptiveStep(state) || undefined;
      TriageService.sessions.set(sessionId, state);
      return state;
    }

    // Pop the last answered question ID from stack
    const lastAnsweredQuestionId = state.questionHistory.pop();
    if (lastAnsweredQuestionId) {
      delete state.answers[lastAnsweredQuestionId];
      state.evidence = state.evidence.filter(e => e.sourceQuestionId !== lastAnsweredQuestionId);
    }

    // If step was TRIAGE_COMPLETE, revert step to PROGRESSIVE_QUESTION
    if (state.currentStep === 'TRIAGE_COMPLETE') {
      state.currentStep = 'PROGRESSIVE_QUESTION';
      state.finalTriageResult = undefined;
    }

    if (state.selectedIssue) {
      state.confidence = QuestionEngine.calculateConfidence(state.selectedIssue, state.answers);
      const activeQ = QuestionEngine.getNextQuestion(state);
      state.currentQuestion = activeQ || undefined;
    }

    state.adaptiveStep = AdaptiveTroubleshootingEngine.selectNextAdaptiveStep(state) || undefined;
    TriageService.sessions.set(sessionId, state);
    return state;
  }

  /**
   * Computes final triage payload and saves to database.
   */
  public finalizeSession(state: StructuredTriageState): StructuredTriageState {
    const initialIssueId = state.selectedIssue?.id || state.candidateIssues[0]?.issueTypeId || '';
    const grounding = AiReliabilityService.validateAndGroundIssueId(initialIssueId);
    const issueType = grounding.issueDefinition;
    state.selectedIssue = issueType;

    const user = this.repo.getUserById(state.userId);

    const confidence = QuestionEngine.calculateConfidence(issueType, state.answers);
    state.confidence = confidence;

    AiReliabilityService.evaluateConfidenceLevel(confidence, issueType.id);

    const { priority, reasoning: priorityReasoning } = PriorityEngine.calculatePriority({
      category: issueType.category,
      issueType,
      user,
      answers: state.answers,
      initialQuery: state.originalInput
    });

    const { recommendedNextStep, missingInformation } = RecommendationService.generateRecommendation(
      issueType.category,
      issueType,
      state.answers,
      confidence
    );
    state.missingInformation = missingInformation;

    const recommendation = RecommendationService.generateStructuredRecommendation({
      category: issueType.category,
      selectedIssue: issueType,
      answers: state.answers,
      evidence: state.evidence,
      confidence
    });
    state.recommendation = recommendation;

    state.adaptiveStep = AdaptiveTroubleshootingEngine.selectNextAdaptiveStep(state) || undefined;

    const relatedIncidents = this.memoryService.findRelatedIncidents(state.userId, state.originalInput, issueType.display_name);

    const fullReasoning = `${priorityReasoning} Classified as ${issueType.display_name} under ${issueType.category}. Diagnostic confidence rated at ${confidence}%.`;

    const finalResult: FinalTriageResult = {
      category: issueType.category,
      issueType: issueType.display_name,
      priority: priority as IncidentPriority,
      missingInformation,
      recommendedNextStep: recommendation.action,
      reasoning: fullReasoning,
      confidence,
      recommendation,
      adaptiveStep: state.adaptiveStep,
      linkedIncidents: relatedIncidents.map((r: any) => ({
        incidentId: r.incident.id,
        ticketNumber: r.incident.ticketNumber,
        relationshipType: r.relationshipType,
        similarityScore: r.similarityScore
      }))
    };

    state.currentStep = 'TRIAGE_COMPLETE';
    state.currentQuestion = undefined;
    state.finalTriageResult = finalResult;

    // Save finalized ticket into DB
    const ticketNumber = `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const newIncident: Incident = this.repo.createIncident({
      id: `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ticketNumber,
      userId: state.userId,
      deviceId: state.deviceId,
      category: finalResult.category,
      issueType: finalResult.issueType,
      priority: finalResult.priority,
      status: 'OPEN',
      summary: state.originalInput.substring(0, 100),
      description: state.originalInput,
      missingInfo: finalResult.missingInformation,
      recommendedNextStep: finalResult.recommendedNextStep,
      reasoning: finalResult.reasoning,
      confidenceScore: finalResult.confidence
    });

    finalResult.incidentId = newIncident.id;
    finalResult.ticketNumber = newIncident.ticketNumber;

    for (const [qId, ans] of Object.entries(state.answers)) {
      this.repo.addAnswer({
        id: `ans_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        incidentId: newIncident.id,
        questionId: qId,
        questionText: ans.questionText,
        answerValue: ans.answerValue
      });
    }

    this.repo.addAction({
      id: `act_${Date.now()}_1`,
      incidentId: newIncident.id,
      actionType: 'TRIAGING',
      description: `Automated triage completed for ${issueType.display_name} with ${confidence}% confidence.`,
      performer: 'SYSTEM'
    });

    for (const rel of relatedIncidents) {
      this.memoryService.linkIncidents(newIncident.id, rel.incident.id, rel.relationshipType, rel.similarityScore);
    }

    TriageService.sessions.set(state.sessionId, state);
    return state;
  }

  public getSession(sessionId: string): StructuredTriageState | undefined {
    return TriageService.sessions.get(sessionId);
  }

  /**
   * TROUBLESHOOTING VERIFICATION LOOP METHOD
   * Tracks user confirmation of troubleshooting action execution, updates incident evidence & timeline,
   * resolves ticket if successful, selects next KB action if failed/partial, or links follow-up ticket if something changed.
   */
  public verifyActionResult(payload: ActionVerificationPayload): VerificationLoopResponse {
    let incident = this.repo.getIncidentById(payload.incidentId);
    if (!incident) {
      const session = TriageService.sessions.get(payload.incidentId);
      if (session?.finalTriageResult?.incidentId) {
        incident = this.repo.getIncidentById(session.finalTriageResult.incidentId);
      }
      if (!incident) {
        const allIncidents = this.repo.getAllIncidents();
        if (allIncidents.length > 0) {
          incident = allIncidents[0];
        }
      }
    }
    if (!incident) throw new Error(`Incident ${payload.incidentId} not found`);

    // 1. Record action entry & result details in DB
    const actionId = payload.actionId || `act_verif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    this.repo.appendAction({
      id: actionId,
      incidentId: incident.id,
      actionType: 'TROUBLESHOOTING_STEP',
      description: payload.actionDescription,
      resultStatus: payload.resultStatus,
      resultDetails: payload.userNotes || `Result recorded as ${payload.resultStatus}`,
      performer: 'USER'
    });

    // Update evidence after action if provided
    if (payload.evidenceAfterAction) {
      for (const [key, val] of Object.entries(payload.evidenceAfterAction)) {
        this.repo.addEvidence(incident.id, key, val, 'action_verification');
      }
    }

    let updatedStatus: IncidentStatus = 'IN_PROGRESS';
    let isResolved = false;
    let resolutionSummary: string | undefined;
    let followUpIncident: VerificationLoopResponse['followUpIncident'] = undefined;

    // 2. Fetch all attempted actions history for this incident
    const attemptedHistory = this.repo.getAttemptedActionsForIncident(incident.id);
    const previousActionDescriptions = attemptedHistory.map(a => a.actionDescription);

    const issueType = TaxonomyService.findIssueTypeById(incident.issueType) || TaxonomyService.getTaxonomy()[0];

    // 3. Branch handling by ActionResultStatus & User Notes symptom evaluation
    let matchedNewIssue: KbIssueDefinition | null = null;
    if (payload.userNotes && payload.userNotes.trim().length > 3) {
      const newSymptomMatches = TaxonomyService.matchCandidatesFromQuery(payload.userNotes.trim());
      if (newSymptomMatches.length > 0 && newSymptomMatches[0].confidence >= 40) {
        matchedNewIssue = newSymptomMatches[0].issueType;
      }
    }

    if (payload.resultStatus === 'YES_RESOLVED') {
      updatedStatus = 'RESOLVED';
      isResolved = true;
      resolutionSummary = `Resolved via troubleshooting action: "${payload.actionDescription}". ${payload.userNotes ? 'User notes: ' + payload.userNotes : ''}`;
      this.repo.resolveIncident(incident.id, resolutionSummary);

      // If user resolved current step but reported a NEW symptom in notes, create linked follow-up incident for the new issue!
      if (matchedNewIssue && payload.userNotes && payload.userNotes.trim()) {
        const followUpSummary = `New symptom reported: ${payload.userNotes.trim()}`;
        const followUpId = `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const followUpTicketNum = `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`;

        const createdFollowUp = this.memoryService.createIncident({
          id: followUpId,
          ticketNumber: followUpTicketNum,
          userId: incident.userId,
          deviceId: incident.deviceId,
          category: matchedNewIssue.category,
          issueType: matchedNewIssue.issue_type,
          priority: incident.priority,
          status: 'OPEN',
          summary: followUpSummary,
          description: `Linked follow-up incident for new symptom reported while resolving ${incident.ticketNumber}: "${payload.userNotes.trim()}". Matched domain: ${matchedNewIssue.display_name}.`,
          missingInfo: matchedNewIssue.required_information || [],
          recommendedNextStep: matchedNewIssue.troubleshooting_steps[0] || 'Investigate new reported symptom.',
          reasoning: `Follow-up ticket linked to ${incident.ticketNumber} for newly reported symptom '${payload.userNotes.trim()}'.`,
          confidenceScore: 65
        });

        this.memoryService.linkIncidents(
          createdFollowUp.id,
          incident.id,
          'POSSIBLY_CAUSED_BY',
          0.85
        );

        followUpIncident = {
          id: createdFollowUp.id,
          ticketNumber: createdFollowUp.ticketNumber,
          summary: createdFollowUp.summary,
          relationshipType: 'POSSIBLY_CAUSED_BY'
        };
      }
    } else if (payload.resultStatus === 'NO_FAILED' || payload.resultStatus === 'PARTIALLY_RESOLVED' || payload.resultStatus === 'SOMETHING_CHANGED') {
      updatedStatus = 'IN_PROGRESS';
      this.repo.updateStatus(incident.id, 'IN_PROGRESS');

      // Create & link a follow-up incident representing the new symptom/issue if notes provided or SOMETHING_CHANGED
      const followUpSummary = payload.userNotes 
        ? `New symptom after ${payload.actionDescription}: ${payload.userNotes}`
        : `New/changed symptom reported following action '${payload.actionDescription}' on ${incident.ticketNumber}`;

      const followUpId = `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const followUpTicketNum = `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const targetIssue = matchedNewIssue || issueType;

      const createdFollowUp = this.memoryService.createIncident({
        id: followUpId,
        ticketNumber: followUpTicketNum,
        userId: incident.userId,
        deviceId: incident.deviceId,
        category: targetIssue.category,
        issueType: targetIssue.issue_type,
        priority: incident.priority,
        status: 'OPEN',
        summary: followUpSummary,
        description: `Follow-up issue triggered after executing action '${payload.actionDescription}' on ticket ${incident.ticketNumber}. User feedback: ${payload.userNotes || payload.resultStatus}`,
        missingInfo: targetIssue.required_information || [],
        recommendedNextStep: targetIssue.troubleshooting_steps[0] || 'Assess new symptom and verify system configuration.',
        reasoning: `Follow-up ticket linked to ${incident.ticketNumber} after troubleshooting action execution. Matched domain: ${targetIssue.display_name}.`,
        confidenceScore: Math.max(30, incident.confidenceScore - 10)
      });

      // Link follow-up incident with POSSIBLY_CAUSED_BY relationship
      this.memoryService.linkIncidents(
        createdFollowUp.id,
        incident.id,
        'POSSIBLY_CAUSED_BY',
        0.80
      );

      followUpIncident = {
        id: createdFollowUp.id,
        ticketNumber: createdFollowUp.ticketNumber,
        summary: createdFollowUp.summary,
        relationshipType: 'POSSIBLY_CAUSED_BY'
      };
    }

    // 4. Calculate updated confidence and next recommended action if not resolved
    let updatedConfidence = incident.confidenceScore;
    let nextRecAction: string | undefined;
    let nextFallbackAction: string | undefined;

    if (!isResolved) {
      // Reduce confidence for failed/partial attempts (-10% per attempt)
      const failedCount = attemptedHistory.filter(a => a.resultStatus === 'NO_FAILED' || a.resultStatus === 'PARTIALLY_RESOLVED' || a.resultStatus === 'SOMETHING_CHANGED').length;
      updatedConfidence = Math.max(30, Math.min(95, incident.confidenceScore - (failedCount * 10)));

      if (matchedNewIssue && matchedNewIssue.troubleshooting_steps.length > 0) {
        // If a new symptom was matched to a specific issue type, prioritize troubleshooting steps for the new symptom!
        nextRecAction = matchedNewIssue.troubleshooting_steps[0];
        nextFallbackAction = matchedNewIssue.troubleshooting_steps[1] || matchedNewIssue.troubleshooting_steps[0];
      } else {
        // Generate recommendation excluding all attempted actions
        const newRec = RecommendationService.generateStructuredRecommendation({
          category: incident.category,
          selectedIssue: issueType,
          answers: {},
          evidence: this.repo.getEvidenceForIncident(incident.id),
          previousActions: previousActionDescriptions,
          confidence: updatedConfidence
        });

        nextRecAction = newRec.action;
        nextFallbackAction = newRec.fallback_action;
      }

      // Update incident record with new next step & confidence
      DatabaseService.getDb().prepare(`
        UPDATE incidents 
        SET recommended_next_step = ?, confidence_score = ?, updated_at = ? 
        WHERE id = ?
      `).run(nextRecAction, updatedConfidence, new Date().toISOString(), incident.id);
    }

    return {
      incidentId: incident.id,
      ticketNumber: incident.ticketNumber,
      updatedIncidentStatus: updatedStatus,
      resultStatus: payload.resultStatus,
      actionDescription: payload.actionDescription,
      nextRecommendedAction: nextRecAction,
      nextFallbackAction,
      followUpIncident,
      updatedConfidence,
      attemptedActionsHistory: attemptedHistory,
      resolutionSummary,
      isResolved
    };
  }
}

