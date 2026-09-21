// Core Domain Entities & Strongly Typed Interfaces for Enterprise IT Triage Assistant

export type UserRole = 'END_USER' | 'TIER_1_AGENT' | 'TIER_2_AGENT' | 'TIER_3_AGENT' | 'IT_ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department: string;
  isVip: boolean;
  createdAt: string;
}

export type DeviceStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'RETIRED';

export interface Device {
  id: string;
  userId: string;
  name: string;
  deviceType: 'LAPTOP' | 'DESKTOP' | 'MOBILE' | 'MONITOR' | 'NETWORK_EQUIPMENT' | 'OTHER';
  os: string;
  serialNumber: string;
  status: DeviceStatus;
  createdAt: string;
}

export type IncidentCategory = 
  | 'NETWORK'
  | 'ACCOUNT'
  | 'APPLICATION'
  | 'DEVICE'
  | 'OTHER';

export type IncidentSubdomain =
  | 'VPN'
  | 'EMAIL'
  | 'SECURITY'
  | 'PRINTING'
  | 'CLOUD'
  | 'OFFICE_PRODUCTIVITY'
  | 'PERIPHERALS'
  | 'NETWORK'
  | 'ACCOUNT'
  | 'APPLICATION'
  | 'DEVICE'
  | 'GENERAL';

export type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IncidentPriority = PriorityLevel | 'P1_CRITICAL' | 'P2_HIGH' | 'P3_MEDIUM' | 'P4_LOW';

export type IncidentStatus = 
  | 'TRIAGING'
  | 'PENDING_USER_INPUT'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CLOSED'
  | 'ESCALATED'
  | 'REOPENED';

export interface Incident {
  id: string;
  ticketNumber: string;
  userId: string;
  deviceId?: string;
  category: IncidentCategory;
  issueType: string;
  priority: IncidentPriority;
  status: IncidentStatus;
  summary: string;
  description: string;
  resolution?: string;
  escalationTier?: EscalationTier;
  missingInfo: string[];
  recommendedNextStep: string;
  reasoning: string;
  confidenceScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentAnswer {
  id: string;
  incidentId: string;
  questionId: string;
  questionText: string;
  answerValue: string;
  createdAt: string;
}

export type IncidentActionType = 
  | 'TRIAGING'
  | 'QUESTION_ASKED'
  | 'ANSWER_PROVIDED'
  | 'ISSUE_SELECTED'
  | 'AUTOMATED_DIAGNOSTIC'
  | 'SELF_SERVICE_ATTEMPTED'
  | 'STATUS_CHANGED'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'DIAGNOSTIC_COMMAND'
  | 'TROUBLESHOOTING_STEP'
  | 'MANUAL_ACTION'
  | 'ACTION_EXECUTED'
  | 'RESULT_RECORDED';

export interface IncidentAction {
  id: string;
  incidentId: string;
  actionType: IncidentActionType;
  description: string;
  resultStatus?: string;
  resultDetails?: string;
  performer: string;
  createdAt: string;
}

export type RelationshipType = 
  | 'RELATED_TO'
  | 'FOLLOW_UP_TO'
  | 'OCCURRED_AFTER'
  | 'POSSIBLY_CAUSED_BY'
  | 'REOPENED_FROM'
  | 'RESOLVED_BY'
  | 'DUPLICATE'
  | 'RELATED'
  | 'PARENT'
  | 'CHILD';

export type RelationshipStatus = 'PROPOSED' | 'CONFIRMED' | 'REJECTED';

export interface IncidentRelationship {
  id: string;
  sourceIncidentId: string;
  targetIncidentId: string;
  relationshipType: RelationshipType;
  similarityScore: number;
  status: RelationshipStatus;
  sourceActionId?: string;
  explanation: string;
  confirmedBy?: string;
  confirmedAt?: string;
  createdAt: string;
}

// Knowledge Base Structured Schema Interfaces
export interface KbQuestionOption {
  label: string;
  value: string;
  priority_signal?: string;
  indicates_issue_type?: string;
  prerequisite_answer?: string;
}

export type QuestionAnswerType = 'YES_NO' | 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'TEXT';

export interface KbDiagnosticQuestion {
  id: string;
  question_text: string;
  explanation?: string;
  answer_type?: QuestionAnswerType;
  prerequisite_question_id?: string;
  prerequisite_answer_value?: string;
  assumed_components?: string[];
  options: KbQuestionOption[];
}

export interface KbPrioritySignals {
  p1_conditions?: string[];
  p2_conditions?: string[];
  p3_conditions?: string[];
  p4_conditions?: string[];
}

export interface KbIssueDefinition {
  id: string;
  category: IncidentCategory;
  subdomain: IncidentSubdomain;
  issue_type: string;
  display_name: string;
  description: string;
  keywords: string[];
  example_user_phrases: string[];
  required_information: string[];
  diagnostic_questions: KbDiagnosticQuestion[];
  troubleshooting_steps: string[];
  priority_signals: KbPrioritySignals;
  escalation_conditions: string[];
  related_issue_types: string[];
}

// Explainable Priority Signals & Payload Schemas
export type UsersAffectedScope = 'SINGLE_USER' | 'TEAM' | 'DEPARTMENT' | 'ENTIRE_ORGANIZATION';

export interface StructuredPrioritySignals {
  users_affected?: UsersAffectedScope;
  business_impact?: PriorityLevel;
  work_completely_blocked?: boolean;
  client_customer_impact?: boolean;
  urgent_meeting_deadline?: boolean;
  security_implications?: boolean;
  critical_system_affected?: boolean;
  workaround_available?: boolean;
}

export interface ContributingFactor {
  factor: string;
  weight: number;
  score_added: number;
  reason_code: string;
  description: string;
}

export interface PriorityResultPayload {
  priority: PriorityLevel;
  score: number;
  contributing_factors: ContributingFactor[];
  explanation: string;
}

// Structured Recommendation Engine Schemas
export type EscalationTier = 'NONE' | 'TIER_1' | 'TIER_2' | 'TIER_3' | 'INFOSEC_SIRT' | 'ON_SITE_BAR' | 'VENDOR';

export interface EscalationDetail {
  recommended: boolean;
  tier: EscalationTier;
  reason: string;
}

export interface RecommendationPayload {
  action: string;
  reason: string;
  expected_result: string;
  fallback_action: string;
  escalation: EscalationDetail;
  confidence: number;
}

// Triage Engine Structured State Interfaces
export type TriageStep = 
  | 'INITIAL_INPUT'
  | 'AMBIGUITY_SELECTION'
  | 'PROGRESSIVE_QUESTION'
  | 'TRIAGE_COMPLETE';

export interface CandidateIssue {
  issueTypeId: string;
  issueTypeName: string;
  category: IncidentCategory;
  confidence: number;
  matchReason: string;
}

export interface TriageAnswer {
  questionId: string;
  questionText: string;
  answerValue: string;
  isUnsure?: boolean;
  timestamp: string;
}

export interface TriageEvidence {
  factKey: string;
  factValue: string;
  sourceQuestionId: string;
}

export interface IncidentSummary {
  incidentId: string;
  ticketNumber: string;
  summary: string;
  status: string;
  createdAt: string;
}

export interface HistoricalExecutedAction {
  actionType: string;
  description: string;
  resultStatus: string;
  resultDetails?: string;
  timestamp: string;
}

export interface HistoricalIncidentEvidence {
  incidentId: string;
  ticketNumber: string;
  category: IncidentCategory;
  issueType: string;
  summary: string;
  resolution?: string;
  executedActions: HistoricalExecutedAction[];
  isHistorical: true;
  relevanceScore: number;
  relevanceReason: string;
}

export interface RelevantMemoryContext {
  userId: string;
  deviceId?: string;
  relevantIncidents: HistoricalIncidentEvidence[];
  recentExecutedActions: { incidentTicket: string; description: string; resultStatus: string; timestamp: string }[];
  hasPrecedingCausalAction: boolean;
  precedingCausalActionSummary?: string;
  cautiousPromptContext: string;
}

export type RecoveryReasonCode =
  | 'EMPTY_INPUT'
  | 'NONSENSE_INPUT'
  | 'UNRELATED_INPUT'
  | 'EXTREMELY_VAGUE'
  | 'AMBIGUOUS_CHOICES'
  | 'LOW_CONFIDENCE'
  | 'NO_KB_MATCH'
  | 'CONTRADICTORY_ANSWERS';

export interface RecoveryOption {
  id: string;
  label: string;
  description: string;
  actionType: 'SELECT_CATEGORY' | 'CLARIFY' | 'FREE_TEXT' | 'ESCALATE_HUMAN';
  targetCategoryId?: IncidentCategory;
}

export interface NoDeadEndRecoveryPayload {
  isRecoveryActive: boolean;
  reasonCode: RecoveryReasonCode;
  userMessage: string;
  broaderCategories: { category: IncidentCategory; label: string; description: string }[];
  suggestedOptions: RecoveryOption[];
  highInfoClarificationQuestion?: KbDiagnosticQuestion;
  allowFreeTextRefinement: boolean;
  recommendedHumanEscalation: boolean;
}

export interface StructuredTriageState {
  sessionId: string;
  userId: string;
  deviceId?: string;
  currentStep: TriageStep;
  originalInput: string;
  candidateIssues: CandidateIssue[];
  selectedIssue: KbIssueDefinition | null;
  answers: Record<string, TriageAnswer>;
  evidence: TriageEvidence[];
  confidence: number;
  missingInformation: string[];
  relevantPreviousIncidents: IncidentSummary[];
  memoryContext?: RelevantMemoryContext;
  recoveryPayload?: NoDeadEndRecoveryPayload;
  questionHistory: string[];
  currentQuestion?: KbDiagnosticQuestion;
  finalTriageResult?: FinalTriageResult;
  recommendation?: RecommendationPayload;
  decisionTrace?: HybridDecisionTrace;
  adaptiveStep?: AdaptiveStepPayload;
}

export interface FinalTriageResult {
  incidentId?: string;
  ticketNumber?: string;
  category: IncidentCategory;
  issueType: string;
  priority: IncidentPriority;
  missingInformation: string[];
  recommendedNextStep: string;
  reasoning: string;
  confidence: number;
  recommendation?: RecommendationPayload;
  linkedIncidents?: { incidentId: string; ticketNumber: string; relationshipType: RelationshipType; similarityScore: number }[];
  recoveryPayload?: NoDeadEndRecoveryPayload;
  adaptiveStep?: AdaptiveStepPayload;
}

// Troubleshooting Verification Loop Interfaces & Payloads
export type ActionResultStatus = 
  | 'YES_RESOLVED' 
  | 'NO_FAILED' 
  | 'PARTIALLY_RESOLVED' 
  | 'SOMETHING_CHANGED' 
  | 'PENDING';

export interface ActionVerificationPayload {
  incidentId: string;
  actionId?: string;
  actionDescription: string;
  resultStatus: ActionResultStatus;
  userNotes?: string;
  evidenceAfterAction?: Record<string, string>;
}

export interface AttemptedActionRecord {
  id: string;
  actionDescription: string;
  resultStatus: ActionResultStatus;
  userNotes?: string;
  timestamp: string;
}

export interface VerificationLoopResponse {
  incidentId: string;
  ticketNumber: string;
  updatedIncidentStatus: IncidentStatus;
  resultStatus: ActionResultStatus;
  actionDescription: string;
  nextRecommendedAction?: string;
  nextFallbackAction?: string;
  followUpIncident?: {
    id: string;
    ticketNumber: string;
    summary: string;
    relationshipType: RelationshipType;
  };
  updatedConfidence: number;
  attemptedActionsHistory: AttemptedActionRecord[];
  resolutionSummary?: string;
  isResolved: boolean;
}

// Explainable Root Cause Analysis (RCA) Domain Types & Schemas
export type RcaCandidateSource =
  | 'knowledge_base'
  | 'current_incident_evidence'
  | 'historical_incident_evidence'
  | 'troubleshooting_action'
  | 'relationship_context';

export type RcaHumanDecisionType = 'CONFIRMED' | 'REJECTED' | 'UNCERTAIN' | 'NONE';

export interface RcaEvidenceItem {
  id: string;
  statement: string;
  source: RcaCandidateSource;
  isHistorical: boolean;
  factKey?: string;
  traceableEventId?: string;
  ticketNumber?: string;
}

export type RcaGovernanceState =
  | 'AI_HYPOTHESIS'
  | 'HUMAN_CONFIRMED'
  | 'HUMAN_REJECTED'
  | 'HUMAN_UNCERTAIN'
  | 'VERIFIED_BY_EVIDENCE';

export type RcaVerificationOutcome = 'CONFIRMED' | 'DISPROVED' | 'INCONCLUSIVE';

export interface RcaVerificationRecord {
  id: string;
  incidentId: string;
  candidateId: string;
  verificationTarget: string;
  result: RcaVerificationOutcome;
  notes?: string;
  actorId: string;
  createdAt: string;
}

export interface RcaDecisionAuditEntry {
  id: string;
  incidentId: string;
  candidateId: string;
  decision: RcaHumanDecisionType;
  actorId: string;
  notes?: string;
  aiConfidenceAtDecision: number;
  evidenceSnapshot: RcaEvidenceItem[];
  createdAt: string;
}

export interface RcaCandidate {
  candidate_id: string;
  title: string;
  description: string;
  confidence: number; // 0 to 100 (AI confidence, immutable by human decision)
  supporting_evidence: RcaEvidenceItem[];
  contradicting_evidence: RcaEvidenceItem[];
  missing_evidence: string[];
  verification_question?: string;
  verification_action?: string;
  source: RcaCandidateSource;
  
  // Governance & Human-in-the-Loop fields
  governance_state: RcaGovernanceState;
  human_decision: RcaHumanDecisionType;
  human_decision_actor?: string;
  human_decision_timestamp?: string;
  human_decision_notes?: string;
  ai_confidence_at_decision?: number;
  evidence_snapshot?: RcaEvidenceItem[];
  decision_history?: RcaDecisionAuditEntry[];
  governance_conflict?: boolean;

  // Verification fields
  latest_verification?: RcaVerificationRecord;
  verification_history?: RcaVerificationRecord[];

  // Rejection resurrection flag
  previously_rejected_new_evidence?: boolean;
}

export interface RcaPayload {
  incidentId: string;
  currentDiagnosis: string;
  confidenceScore: number;
  possibleRootCauses: RcaCandidate[];
  verifiedRootCause?: RcaCandidate;
  rejectedCandidates: RcaCandidate[];
  uncertaintyWarning?: string;
  generatedAt: string;
}

export interface RcaHumanDecisionPayload {
  incidentId: string;
  candidateId: string;
  decision: RcaHumanDecisionType;
  actorId?: string;
  notes?: string;
  overrideReason?: string;
}

export interface RcaVerifyHypothesisPayload {
  incidentId: string;
  candidateId: string;
  result: RcaVerificationOutcome;
  notes?: string;
  actorId?: string;
}

// Hybrid AI Decision Engine Entities & Schemas

export interface BoundedRetrievalContext {
  query: string;
  retrievedKbCandidates: { id: string; title: string; category: IncidentCategory; confidence: number }[];
  currentIncidentFacts: { factKey: string; factValue: string }[];
  relevantHistory: { incidentId: string; ticketNumber: string; summary: string }[];
  prioritySignals: string[];
}

export interface AiDecisionResponseSchema {
  candidateIssueId: string;
  extractedFacts: string[];
  missingInformation: string[];
  reasoning: string[];
  recommendedNextStepId?: string;
  confidenceBand: 'HIGH' | 'MEDIUM' | 'LOW';
  uncertaintyReason?: string;
  escalationRequired: boolean;
}

export interface GroundingValidationResult {
  isValid: boolean;
  violations: string[];
  groundedCandidateId: string;
  groundedFacts: string[];
}

export interface HybridDecisionTrace {
  sessionId: string;
  timestamp: string;
  retrievedKbCandidateIds: string[];
  aiSelectedCandidateId: string | null;
  aiInterpretation: string;
  extractedFacts: string[];
  deterministicRulesApplied: string[];
  groundingValidationPassed: boolean;
  groundingViolations: string[];
  finalDecisionCandidateId: string;
  confidenceBand: 'HIGH' | 'MEDIUM' | 'LOW';
  fallbackTriggered: boolean;
  fallbackReason?: string;
  decisionBreakdown: {
    deterministicEvidence: string[];
    aiContribution: string;
    ruleOverrides: string[];
    finalDecision: string;
  };
}

// Adaptive Troubleshooting / Information-Gain Engine Entities

export interface DiagnosticHypothesis {
  id: string;
  title: string;
  description: string;
  category: IncidentCategory;
  confidenceBand: 'HIGH' | 'MEDIUM' | 'LOW';
  heuristicScore: number;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  source: string;
  isPlausible: boolean;
}

export interface AdaptiveScoringBreakdown {
  hypothesisDiscrimination: number;
  relevance: number;
  safetyBonus: number;
  userEffortPenalty: number;
  repetitionPenalty: number;
  prerequisitePenalty: number;
  finalScore: number;
}

export interface AdaptiveStepPayload {
  selectedStepId: string;
  type: 'QUESTION' | 'ACTION';
  title: string;
  question?: KbDiagnosticQuestion;
  actionText?: string;
  score: number;
  rationale: string;
  hypothesesDistinguished: string[];
  evidenceUsed: string[];
  alternativesConsidered: { id: string; title: string; score: number; type: 'QUESTION' | 'ACTION' }[];
  scoringBreakdown: AdaptiveScoringBreakdown;
  confidenceBand: 'HIGH' | 'MEDIUM' | 'LOW';
}




