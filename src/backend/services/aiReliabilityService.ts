import { z } from 'zod';
import { TaxonomyService } from './taxonomyService';
import { KbIssueDefinition } from '../models';
import { ReliabilityLogger } from './reliabilityLogger';

export interface RetryValidationResult<T> {
  result: T;
  attempts: number;
  isFallback: boolean;
  errorDetails?: string;
}

export class AiReliabilityService {
  /**
   * Executes a model supplier function with structured JSON parsing, Zod schema validation,
   * retry attempts on malformed output, and safe fallback activation.
   */
  public static async executeWithRetryAndValidation<T>(
    modelName: string,
    supplierFn: () => Promise<string> | string,
    schema: z.ZodSchema<T>,
    fallbackValue: T,
    maxRetries = 3
  ): Promise<RetryValidationResult<T>> {
    let attempt = 0;
    let lastError = '';

    while (attempt < maxRetries) {
      attempt++;
      try {
        const rawOutput = await supplierFn();
        let parsedJson: any;

        try {
          parsedJson = JSON.parse(rawOutput);
        } catch (jsonErr: any) {
          lastError = `JSON syntax parse error: ${jsonErr.message}`;
          ReliabilityLogger.logInvalidOutput(modelName, lastError, attempt);
          continue;
        }

        const parseResult = schema.safeParse(parsedJson);
        if (parseResult.success) {
          return {
            result: parseResult.data,
            attempts: attempt,
            isFallback: false
          };
        } else {
          lastError = `Schema mismatch: ${parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`;
          ReliabilityLogger.logInvalidOutput(modelName, lastError, attempt);
        }
      } catch (err: any) {
        lastError = `Execution error: ${err.message || err}`;
        ReliabilityLogger.logModelFailure(modelName, lastError, { attempt });
      }
    }

    // All retries failed -> Fallback activated
    ReliabilityLogger.logFallbackActivated(`EXHAUSTED_RETRIES_${modelName}`, lastError);
    return {
      result: fallbackValue,
      attempts: attempt,
      isFallback: true,
      errorDetails: lastError
    };
  }

  /**
   * Synchronous version for deterministic rule engines with schema validation and fallback.
   */
  public static validateAndGroundJson<T>(
    modelName: string,
    rawJson: string | object,
    schema: z.ZodSchema<T>,
    fallbackValue: T
  ): RetryValidationResult<T> {
    try {
      const inputObj = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
      const parseResult = schema.safeParse(inputObj);
      if (parseResult.success) {
        return { result: parseResult.data, attempts: 1, isFallback: false };
      }
      const schemaError = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      ReliabilityLogger.logInvalidOutput(modelName, schemaError, 1);
      ReliabilityLogger.logFallbackActivated(`SCHEMA_MISMATCH_${modelName}`, schemaError);
      return { result: fallbackValue, attempts: 1, isFallback: true, errorDetails: schemaError };
    } catch (err: any) {
      ReliabilityLogger.logModelFailure(modelName, err.message || String(err));
      ReliabilityLogger.logFallbackActivated(`JSON_PARSE_ERROR_${modelName}`, err.message || String(err));
      return { result: fallbackValue, attempts: 1, isFallback: true, errorDetails: err.message };
    }
  }

  /**
   * Grounding check for Issue Types.
   * Ensures returned Issue IDs match authoritative KB taxonomy definitions.
   * Falls back to 'OTHER_UNKNOWN_ISSUE' if ungrounded.
   */
  public static validateAndGroundIssueId(issueTypeId: string): {
    isValid: boolean;
    issueTypeId: string;
    issueDefinition: KbIssueDefinition;
  } {
    const found = TaxonomyService.findIssueTypeById(issueTypeId);
    if (found) {
      return { isValid: true, issueTypeId: found.id, issueDefinition: found };
    }

    const fallback =
      TaxonomyService.findIssueTypeById('kb_oth_general_99') ||
      TaxonomyService.findIssueTypeById('kb_other_unknown') ||
      TaxonomyService.findIssueTypeById('OTHER_UNKNOWN_ISSUE') ||
      TaxonomyService.getTaxonomy()[0];
    
    ReliabilityLogger.logUnrecognizedIssueIdRejected(issueTypeId, fallback.id);

    return {
      isValid: false,
      issueTypeId: fallback.id,
      issueDefinition: fallback
    };
  }

  /**
   * Grounding check for Recommended Troubleshooting Actions.
   * Ensures generated actions are grounded in KB troubleshooting steps.
   */
  public static groundTroubleshootingAction(
    proposedAction: string,
    kbSteps: string[],
    issueId: string
  ): { action: string; isGrounded: boolean } {
    if (!proposedAction || !kbSteps || kbSteps.length === 0) {
      return { action: kbSteps[0] || 'Contact IT Service Desk for manual assistance.', isGrounded: true };
    }

    const normProposed = proposedAction.toLowerCase();
    const isMatched = kbSteps.some((step) => {
      const normStep = step.toLowerCase();
      return normStep.includes(normProposed) || normProposed.includes(normStep) || normStep === normProposed;
    });

    if (isMatched) {
      return { action: proposedAction, isGrounded: true };
    }

    // Ungrounded action detected -> Replace with top KB step
    const groundedFallback = kbSteps[0];
    ReliabilityLogger.logUngroundedActionRejected(proposedAction, issueId);

    return {
      action: groundedFallback,
      isGrounded: false
    };
  }

  /**
   * Confidence Threshold Evaluator.
   * Enforces explicit uncertainty messaging for low confidence (< 50%).
   */
  public static evaluateConfidenceLevel(confidence: number, issueTypeId?: string): {
    level: 'HIGH' | 'MEDIUM' | 'LOW';
    requiresClarification: boolean;
    isUnsure: boolean;
  } {
    if (confidence >= 75) {
      return { level: 'HIGH', requiresClarification: false, isUnsure: false };
    }
    if (confidence >= 50) {
      return { level: 'MEDIUM', requiresClarification: false, isUnsure: false };
    }

    if (issueTypeId) {
      ReliabilityLogger.logLowConfidenceDiagnosis(issueTypeId, confidence);
    }

    return {
      level: 'LOW',
      requiresClarification: true,
      isUnsure: true
    };
  }
}
