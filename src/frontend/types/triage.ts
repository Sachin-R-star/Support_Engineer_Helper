export type IncidentCategory = 
  | 'NETWORK'
  | 'ACCOUNT'
  | 'APPLICATION'
  | 'DEVICE'
  | 'OTHER';

export type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentPriority = PriorityLevel | 'P1_CRITICAL' | 'P2_HIGH' | 'P3_MEDIUM' | 'P4_LOW';

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

export interface TaxonomyQuestionOption {
  label: string;
  value: string;
  indicatesIssueType?: string;
  priority_signal?: string;
}

export interface TaxonomyQuestion {
  id: string;
  question_text: string;
  answer_type?: 'YES_NO' | 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'TEXT';
  options: TaxonomyQuestionOption[];
  explanation?: string;
}

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

export interface RecoveryOption {
  id: string;
  label: string;
  description: string;
  actionType: 'SELECT_CATEGORY' | 'CLARIFY' | 'FREE_TEXT' | 'ESCALATE_HUMAN';
  targetCategoryId?: IncidentCategory;
}

export interface NoDeadEndRecoveryPayload {
  isRecoveryActive: boolean;
  reasonCode: string;
  userMessage: string;
  broaderCategories: { category: IncidentCategory; label: string; description: string }[];
  suggestedOptions: RecoveryOption[];
  highInfoClarificationQuestion?: TaxonomyQuestion;
  allowFreeTextRefinement: boolean;
  recommendedHumanEscalation: boolean;
}

export interface HistoricalIncidentEvidence {
  incidentId: string;
  ticketNumber: string;
  category: IncidentCategory;
  issueType: string;
  summary: string;
  resolution?: string;
  executedActions: { actionType: string; description: string; resultStatus: string; timestamp: string }[];
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

export interface TriageEvidence {
  factKey: string;
  factValue: string;
  sourceQuestionId: string;
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
  question?: TaxonomyQuestion;
  actionText?: string;
  score: number;
  rationale: string;
  hypothesesDistinguished: string[];
  evidenceUsed: string[];
  alternativesConsidered: Array<{
    id: string;
    title: string;
    score: number;
    type: 'QUESTION' | 'ACTION';
  }>;
  scoringBreakdown: AdaptiveScoringBreakdown;
  confidenceBand: 'HIGH' | 'MEDIUM' | 'LOW';
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
  linkedIncidents?: { incidentId: string; ticketNumber: string; relationshipType: string; similarityScore: number }[];
  recoveryPayload?: NoDeadEndRecoveryPayload;
  adaptiveStep?: AdaptiveStepPayload;
}

export interface TriageAnswer {
  questionId: string;
  questionText: string;
  answerValue: string;
  isUnsure?: boolean;
  timestamp: string;
}

export interface TriageSession {
  sessionId: string;
  userId: string;
  deviceId?: string;
  currentStep: TriageStep;
  originalInput: string;
  candidateIssues: CandidateIssue[];
  selectedIssue?: { id: string; display_name: string; category: IncidentCategory; issue_type?: string };
  answers: Record<string, TriageAnswer>;
  evidence?: TriageEvidence[];
  questionHistory: string[];
  currentQuestion?: TaxonomyQuestion;
  finalTriageResult?: FinalTriageResult;
  memoryContext?: RelevantMemoryContext;
  recoveryPayload?: NoDeadEndRecoveryPayload;
  confidence: number;
  decisionTrace?: HybridDecisionTrace;
  adaptiveStep?: AdaptiveStepPayload;
}

export interface IncidentRecord {
  id: string;
  ticketNumber: string;
  userId: string;
  deviceId?: string;
  category: IncidentCategory;
  issueType: string;
  priority: IncidentPriority;
  status: string;
  summary: string;
  description: string;
  resolution?: string;
  escalationTier?: string;
  missingInfo: string[];
  recommendedNextStep: string;
  reasoning: string;
  confidenceScore: number;
  createdAt: string;
  updatedAt?: string;
}

export interface TimelineEvent {
  id: string;
  incidentId: string;
  eventType: string;
  description: string;
  actor: string;
  createdAt: string;
  metadata?: any;
}

export interface IncidentActionRecord {
  id: string;
  incidentId: string;
  actionType: string;
  description: string;
  performer: string;
  resultStatus?: 'PENDING' | 'SUCCESS' | 'FAILURE' | 'PARTIAL';
  resultDetails?: string;
  createdAt: string;
}

export interface IncidentAnswerRecord {
  id: string;
  incidentId: string;
  questionId: string;
  questionText: string;
  answerValue: string;
  isUnsure?: boolean;
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

export interface IncidentRelationshipRecord {
  id: string;
  sourceIncidentId: string;
  targetIncidentId: string;
  relationshipType: RelationshipType;
  similarityScore: number;
  status: RelationshipStatus;
  explanation: string;
  sourceActionId?: string;
  confirmedBy?: string;
  confirmedAt?: string;
  createdAt: string;
}

export interface GraphNode {
  id: string;
  ticketNumber: string;
  category: string;
  issueType: string;
  priority: string;
  status: string;
  summary: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationshipType: RelationshipType;
  status: RelationshipStatus;
  similarityScore: number;
  explanation: string;
}

export interface IncidentGraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface IncidentDetailResponse {
  success: boolean;
  incident: IncidentRecord;
  user?: { id: string; name: string; email: string; role: string; department: string; isVip?: boolean };
  device?: { id: string; name: string; deviceType: string; os: string; serialNumber: string; status: string };
  answers: IncidentAnswerRecord[];
  actions: IncidentActionRecord[];
  relationships: IncidentRelationshipRecord[];
}

export interface RecurringPattern {
  issueType: string;
  category: IncidentCategory;
  count: number;
}

export interface DashboardStats {
  totalIncidents: number;
  openCount: number;
  highCriticalCount: number;
  resolvedCount: number;
  escalatedCount: number;
  avgResolutionTimeMinutes: number | null;
  recurringPatterns: RecurringPattern[];
  relationshipSummary: {
    totalLinks: number;
    confirmedCount: number;
    proposedCount: number;
  };
  openIncidents: IncidentRecord[];
  highCriticalIncidents: IncidentRecord[];
  recentlyResolvedIncidents: IncidentRecord[];
  escalatedIncidents: IncidentRecord[];
}

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
  confidence: number;
  supporting_evidence: RcaEvidenceItem[];
  contradicting_evidence: RcaEvidenceItem[];
  missing_evidence: string[];
  verification_question?: string;
  verification_action?: string;
  source: RcaCandidateSource;
  
  // Governance fields
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

export function formatConfidence(score?: number): number {
  if (score === undefined || score === null || isNaN(score)) return 0;
  let val = (score > 0 && score <= 1) ? score * 100 : score;
  return Math.min(100, Math.max(0, Math.round(val)));
}




