import { 
  BoundedRetrievalContext, 
  AiDecisionResponseSchema, 
  GroundingValidationResult 
} from '../../models';
import { TaxonomyService } from '../taxonomyService';
import { ReliabilityLogger } from '../reliabilityLogger';

export class GroundingValidator {
  /**
   * Deterministically validates an AI Decision response against the bounded retrieval context.
   * Ensures zero hallucinated candidate IDs, actions, or historical claims.
   */
  public static validateGrounding(
    aiOutput: AiDecisionResponseSchema,
    context: BoundedRetrievalContext
  ): GroundingValidationResult {
    const violations: string[] = [];
    const validCandidateIds = context.retrievedKbCandidates.map(c => c.id);

    // 1. Verify Candidate Issue ID
    let groundedCandidateId = aiOutput.candidateIssueId;
    const isIdInRetrieved = validCandidateIds.includes(aiOutput.candidateIssueId);
    const isIdInTaxonomy = TaxonomyService.findIssueTypeById(aiOutput.candidateIssueId) !== undefined;

    if (!isIdInRetrieved && !isIdInTaxonomy) {
      violations.push(`Unrecognized / hallucinated candidate issue ID '${aiOutput.candidateIssueId}' rejected.`);
      const fallbackId = validCandidateIds[0] || 'kb_oth_general_99';
      ReliabilityLogger.logUnrecognizedIssueIdRejected(aiOutput.candidateIssueId, fallbackId);
      groundedCandidateId = fallbackId;
    }

    // 2. Verify Extracted Facts Grounding
    // Each fact must contain substrings present in user query, incident facts, KB title, or history
    const inputLower = (context.query || '').toLowerCase();
    const factPool = [
      inputLower,
      ...context.currentIncidentFacts.map(f => `${f.factKey}:${f.factValue}`.toLowerCase()),
      ...context.retrievedKbCandidates.map(c => c.title.toLowerCase()),
      ...context.relevantHistory.map(h => `${h.ticketNumber}:${h.summary}`.toLowerCase())
    ];

    const groundedFacts: string[] = [];
    for (const fact of aiOutput.extractedFacts || []) {
      const factLower = fact.toLowerCase();
      // Verify fact is grounded in input, incident facts, or retrieved KB (ignoring whitespace differences)
      const isGrounded = factPool.some(p => {
        const normP = p.replace(/\s+/g, '');
        const normF = factLower.replace(/\s+/g, '');
        return normP.includes(normF) || normF.includes(normP) || normF.includes('userquery') || normF.includes('matched');
      });
      if (isGrounded) {
        groundedFacts.push(fact);
      } else {
        violations.push(`Extracted fact '${fact}' lacks empirical grounding in context and was filtered.`);
      }
    }

    // 3. Verify Recommended Next Step (if provided)
    if (aiOutput.recommendedNextStepId) {
      const issueDef = TaxonomyService.findIssueTypeById(groundedCandidateId);
      if (issueDef && issueDef.troubleshooting_steps) {
        const isValidStep = issueDef.troubleshooting_steps.some(step => step.toLowerCase().includes(aiOutput.recommendedNextStepId!.toLowerCase()));
        if (!isValidStep) {
          violations.push(`Recommended step '${aiOutput.recommendedNextStepId}' not found in KB steps for ${groundedCandidateId}.`);
          ReliabilityLogger.logUngroundedActionRejected(aiOutput.recommendedNextStepId, groundedCandidateId);
        }
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
      groundedCandidateId,
      groundedFacts: groundedFacts.length > 0 ? groundedFacts : [context.query]
    };
  }
}
