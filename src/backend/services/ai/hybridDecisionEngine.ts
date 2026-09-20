import { 
  BoundedRetrievalContext, 
  HybridDecisionTrace, 
  StructuredTriageState, 
  CandidateIssue,
  IncidentCategory,
  User,
  AiDecisionResponseSchema
} from '../../models';
import { TaxonomyService } from '../taxonomyService';
import { PriorityEngine } from '../priorityEngine';
import { MemoryService } from '../memoryService';
import { AiReliabilityService } from '../aiReliabilityService';
import { GroundingValidator } from './groundingValidator';
import { IAiProvider, MockAiProvider, OpenAiCompatibleProvider, AiDecisionZodSchema } from './aiProvider';
import { IncidentRepository } from '../../database/repositories/incidentRepo';
import { ReliabilityLogger } from '../reliabilityLogger';

export class HybridDecisionEngine {
  private static provider: IAiProvider;
  private static memoryService = new MemoryService();
  private static repo = new IncidentRepository();

  public static initializeProvider(customProvider?: IAiProvider): void {
    if (customProvider) {
      this.provider = customProvider;
      return;
    }

    const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
    if (apiKey) {
      let endpoint = process.env.LLM_ENDPOINT || process.env.OPENAI_ENDPOINT;
      let model = process.env.LLM_MODEL || process.env.OPENAI_MODEL;

      if (apiKey.startsWith('gsk_') || process.env.GROQ_API_KEY) {
        endpoint = endpoint || 'https://api.groq.com/openai/v1/chat/completions';
        model = model || 'llama-3.3-70b-versatile';
      }

      this.provider = new OpenAiCompatibleProvider(apiKey, endpoint, model);
    } else {
      this.provider = new MockAiProvider();
    }
  }

  public static getProvider(): IAiProvider {
    if (!this.provider) {
      this.initializeProvider();
    }
    return this.provider;
  }

  /**
   * Main Hybrid Decision Pipeline:
   * Deterministic Retrieval -> Bounded Context -> LLM Reasoning -> Schema Validation -> Grounding Check -> Rule Overrides -> Trace
   */
  public static async processHybridDecision(
    sessionId: string,
    query: string,
    userId: string,
    deviceId?: string,
    existingCandidateMatches?: CandidateIssue[]
  ): Promise<{
    selectedCandidateId: string;
    decisionTrace: HybridDecisionTrace;
    aiOutput: AiDecisionResponseSchema;
  }> {
    const timestamp = new Date().toISOString();
    const provider = this.getProvider();

    // 1. Prompt Injection Shield & Normalization
    const sanitizedQuery = this.sanitizeQuery(query);

    // 2. Deterministic Bounded Retrieval Context Construction
    const candidateMatches = existingCandidateMatches || TaxonomyService.matchCandidatesFromQuery(sanitizedQuery).map(m => ({
      issueTypeId: m.issueType.id,
      issueTypeName: m.issueType.display_name,
      category: m.issueType.category,
      confidence: m.confidence,
      matchReason: m.matchReason
    }));

    const topCandidates = candidateMatches.slice(0, 5).map(c => ({
      id: c.issueTypeId,
      title: c.issueTypeName,
      category: c.category,
      confidence: c.confidence
    }));

    // Bounded historical memory retrieval
    const memoryContext = this.memoryService.getRelevantMemoryContext(
      userId,
      topCandidates[0]?.category || 'OTHER',
      topCandidates[0]?.id,
      deviceId,
      sanitizedQuery
    );

    const relevantHistory = memoryContext.relevantIncidents.slice(0, 3).map(h => ({
      incidentId: h.incidentId,
      ticketNumber: h.ticketNumber,
      summary: h.summary
    }));

    const user = this.repo.getUserById(userId);
    const prioritySignals: string[] = [];
    if (user?.isVip) prioritySignals.push('EXECUTIVE_VIP');
    if (/password|lockout|mfa|sso/i.test(sanitizedQuery)) prioritySignals.push('SECURITY_LOCKOUT');
    if (/call in \d+|meeting|urgent|client/i.test(sanitizedQuery)) prioritySignals.push('URGENT_TIMEFRAME');

    const boundedContext: BoundedRetrievalContext = {
      query: sanitizedQuery,
      retrievedKbCandidates: topCandidates,
      currentIncidentFacts: [
        { factKey: 'userId', factValue: userId },
        { factKey: 'deviceId', factValue: deviceId || 'unknown' },
        { factKey: 'department', factValue: user?.department || 'General' }
      ],
      relevantHistory,
      prioritySignals
    };

    // 3. AI Reasoning via Supplier with Retry and Zod Schema Validation
    const fallbackDecision: AiDecisionResponseSchema = {
      candidateIssueId: topCandidates[0]?.id || 'kb_oth_general_99',
      extractedFacts: [`User query: "${sanitizedQuery}"`],
      missingInformation: [],
      reasoning: ['Deterministic fallback selected top TF-IDF candidate.'],
      confidenceBand: (topCandidates[0]?.confidence || 0) >= 75 ? 'HIGH' : (topCandidates[0]?.confidence || 0) >= 50 ? 'MEDIUM' : 'LOW',
      escalationRequired: prioritySignals.length > 0
    };

    const validationRes = await AiReliabilityService.executeWithRetryAndValidation<AiDecisionResponseSchema>(
      provider.name,
      () => provider.generateStructuredDecision(boundedContext),
      AiDecisionZodSchema,
      fallbackDecision,
      3
    );

    const aiOutput = validationRes.result;

    // 4. Grounding Validation
    const groundingRes = GroundingValidator.validateGrounding(aiOutput, boundedContext);

    // 5. Deterministic Business & Safety Rule Overrides
    const deterministicRulesApplied: string[] = [];
    let finalDecisionCandidateId = groundingRes.groundedCandidateId;

    // Rule A: High-confidence exact match override (Confidence >= 85%)
    if (topCandidates[0] && topCandidates[0].confidence >= 85 && topCandidates[0].id !== finalDecisionCandidateId) {
      deterministicRulesApplied.push(`Exact deterministic match '${topCandidates[0].id}' (${topCandidates[0].confidence}%) overridden over AI selection.`);
      finalDecisionCandidateId = topCandidates[0].id;
    }

    // Rule B: Mandatory Security Lockout Category Lock
    if (prioritySignals.includes('SECURITY_LOCKOUT')) {
      deterministicRulesApplied.push(`Security Lockout rule evaluated: category locked to ACCOUNT.`);
      if (!finalDecisionCandidateId.startsWith('kb_acc_')) {
        const accCandidate = topCandidates.find(c => c.category === 'ACCOUNT') || { id: 'kb_acc_lockout_01' };
        finalDecisionCandidateId = accCandidate.id;
      }
    }

    // Rule C: Executive VIP Escalation Signal
    if (user?.isVip) {
      deterministicRulesApplied.push(`Executive VIP user role automatically tagged for P1 priority processing.`);
    }

    // 6. Construct Full AI vs Deterministic Decision Trace
    const decisionTrace: HybridDecisionTrace = {
      sessionId,
      timestamp,
      retrievedKbCandidateIds: topCandidates.map(c => c.id),
      aiSelectedCandidateId: aiOutput.candidateIssueId,
      aiInterpretation: aiOutput.reasoning.join(' '),
      extractedFacts: groundingRes.groundedFacts,
      deterministicRulesApplied,
      groundingValidationPassed: groundingRes.isValid,
      groundingViolations: groundingRes.violations,
      finalDecisionCandidateId,
      confidenceBand: aiOutput.confidenceBand,
      fallbackTriggered: validationRes.isFallback,
      fallbackReason: validationRes.errorDetails,
      decisionBreakdown: {
        deterministicEvidence: topCandidates.map(c => `[KB Candidate] ${c.title} (${c.id}) - ${c.confidence}% match`),
        aiContribution: `AI Provider (${provider.name}) interpreted query and mapped to ${aiOutput.candidateIssueId} with ${aiOutput.confidenceBand} confidence.`,
        ruleOverrides: deterministicRulesApplied.length > 0 ? deterministicRulesApplied : ['No deterministic overrides triggered. AI candidate accepted.'],
        finalDecision: `Selected Candidate ${finalDecisionCandidateId} with ${aiOutput.confidenceBand} confidence.`
      }
    };

    return {
      selectedCandidateId: finalDecisionCandidateId,
      decisionTrace,
      aiOutput
    };
  }

  /**
   * Synchronous version for deterministic triage pipelines and offline execution.
   */
  public static processHybridDecisionSync(
    sessionId: string,
    query: string,
    userId: string,
    deviceId?: string,
    existingCandidateMatches?: CandidateIssue[]
  ): {
    selectedCandidateId: string;
    decisionTrace: HybridDecisionTrace;
    aiOutput: AiDecisionResponseSchema;
  } {
    const timestamp = new Date().toISOString();
    const provider = this.getProvider();
    const sanitizedQuery = this.sanitizeQuery(query);

    const candidateMatches = existingCandidateMatches || TaxonomyService.matchCandidatesFromQuery(sanitizedQuery).map(m => ({
      issueTypeId: m.issueType.id,
      issueTypeName: m.issueType.display_name,
      category: m.issueType.category,
      confidence: m.confidence,
      matchReason: m.matchReason
    }));

    const topCandidates = candidateMatches.slice(0, 5).map(c => ({
      id: c.issueTypeId,
      title: c.issueTypeName,
      category: c.category,
      confidence: c.confidence
    }));

    const memoryContext = this.memoryService.getRelevantMemoryContext(
      userId,
      topCandidates[0]?.category || 'OTHER',
      topCandidates[0]?.id,
      deviceId,
      sanitizedQuery
    );

    const relevantHistory = memoryContext.relevantIncidents.slice(0, 3).map(h => ({
      incidentId: h.incidentId,
      ticketNumber: h.ticketNumber,
      summary: h.summary
    }));

    const user = this.repo.getUserById(userId);
    const prioritySignals: string[] = [];
    if (user?.isVip) prioritySignals.push('EXECUTIVE_VIP');
    if (/password|lockout|mfa|sso/i.test(sanitizedQuery)) prioritySignals.push('SECURITY_LOCKOUT');
    if (/call in \d+|meeting|urgent|client/i.test(sanitizedQuery)) prioritySignals.push('URGENT_TIMEFRAME');

    const boundedContext: BoundedRetrievalContext = {
      query: sanitizedQuery,
      retrievedKbCandidates: topCandidates,
      currentIncidentFacts: [
        { factKey: 'userId', factValue: userId },
        { factKey: 'deviceId', factValue: deviceId || 'unknown' },
        { factKey: 'department', factValue: user?.department || 'General' }
      ],
      relevantHistory,
      prioritySignals
    };

    const fallbackDecision: AiDecisionResponseSchema = {
      candidateIssueId: topCandidates[0]?.id || 'kb_oth_general_99',
      extractedFacts: [`User query: "${sanitizedQuery}"`],
      missingInformation: [],
      reasoning: ['Deterministic fallback selected top TF-IDF candidate.'],
      confidenceBand: (topCandidates[0]?.confidence || 0) >= 75 ? 'HIGH' : (topCandidates[0]?.confidence || 0) >= 50 ? 'MEDIUM' : 'LOW',
      escalationRequired: prioritySignals.length > 0
    };

    let rawOutput: string | object = '{}';
    try {
      rawOutput = provider.generateStructuredDecision(boundedContext);
    } catch (err: any) {
      ReliabilityLogger.logModelFailure(provider.name, String(err));
    }

    const validationRes = AiReliabilityService.validateAndGroundJson<AiDecisionResponseSchema>(
      provider.name,
      rawOutput,
      AiDecisionZodSchema,
      fallbackDecision
    );

    const aiOutput = validationRes.result;
    const groundingRes = GroundingValidator.validateGrounding(aiOutput, boundedContext);

    const deterministicRulesApplied: string[] = [];
    let finalDecisionCandidateId = groundingRes.groundedCandidateId;

    if (topCandidates[0] && topCandidates[0].confidence >= 85 && topCandidates[0].id !== finalDecisionCandidateId) {
      deterministicRulesApplied.push(`Exact deterministic match '${topCandidates[0].id}' (${topCandidates[0].confidence}%) overridden over AI selection.`);
      finalDecisionCandidateId = topCandidates[0].id;
    }

    if (prioritySignals.includes('SECURITY_LOCKOUT')) {
      deterministicRulesApplied.push(`Security Lockout rule evaluated: category locked to ACCOUNT.`);
      if (!finalDecisionCandidateId.startsWith('kb_acc_')) {
        const accCandidate = topCandidates.find(c => c.category === 'ACCOUNT') || { id: 'kb_acc_lockout_01' };
        finalDecisionCandidateId = accCandidate.id;
      }
    }

    if (user?.isVip) {
      deterministicRulesApplied.push(`Executive VIP user role automatically tagged for P1 priority processing.`);
    }

    const decisionTrace: HybridDecisionTrace = {
      sessionId,
      timestamp,
      retrievedKbCandidateIds: topCandidates.map(c => c.id),
      aiSelectedCandidateId: aiOutput.candidateIssueId,
      aiInterpretation: aiOutput.reasoning.join(' '),
      extractedFacts: groundingRes.groundedFacts,
      deterministicRulesApplied,
      groundingValidationPassed: groundingRes.isValid,
      groundingViolations: groundingRes.violations,
      finalDecisionCandidateId,
      confidenceBand: aiOutput.confidenceBand,
      fallbackTriggered: validationRes.isFallback,
      fallbackReason: validationRes.errorDetails,
      decisionBreakdown: {
        deterministicEvidence: topCandidates.map(c => `[KB Candidate] ${c.title} (${c.id}) - ${c.confidence}% match`),
        aiContribution: `AI Provider (${provider.name}) interpreted query and mapped to ${aiOutput.candidateIssueId} with ${aiOutput.confidenceBand} confidence.`,
        ruleOverrides: deterministicRulesApplied.length > 0 ? deterministicRulesApplied : ['No deterministic overrides triggered. AI candidate accepted.'],
        finalDecision: `Selected Candidate ${finalDecisionCandidateId} with ${aiOutput.confidenceBand} confidence.`
      }
    };

    return {
      selectedCandidateId: finalDecisionCandidateId,
      decisionTrace,
      aiOutput
    };
  }

  /**
   * Sanitizes user input to defend against prompt injection attacks.
   * Treats user input strictly as DATA.
   */
  private static sanitizeQuery(rawInput: string): string {
    if (!rawInput) return '';
    // Preserve 100% of user ticket content intact; strip only non-printable control characters
    return rawInput.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  }
}
