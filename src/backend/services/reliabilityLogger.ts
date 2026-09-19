export type ReliabilityEventType = 
  | 'MODEL_FAILURE'
  | 'INVALID_STRUCTURED_OUTPUT'
  | 'FALLBACK_ACTIVATED'
  | 'LOW_CONFIDENCE_DIAGNOSIS'
  | 'CONTRADICTION_DETECTED'
  | 'UNGROUNDED_ACTION_REJECTED'
  | 'UNRECOGNIZED_ISSUE_ID_REJECTED';

export interface ReliabilityLogEvent {
  id: string;
  eventType: ReliabilityEventType;
  timestamp: string;
  message: string;
  sanitizedMetadata: Record<string, any>;
}

export class ReliabilityLogger {
  private static events: ReliabilityLogEvent[] = [];

  public static sanitizePII(text: string): string {
    if (!text) return '';
    return text
      .replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'bearer [REDACTED]')
      .replace(/password\s*=\s*[^\s]+/gi, 'password=[REDACTED]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]');
  }

  public static logEvent(
    eventType: ReliabilityEventType, 
    message: string, 
    metadata: Record<string, any> = {}
  ): ReliabilityLogEvent {
    const sanitizedMeta: Record<string, any> = {};
    for (const [key, val] of Object.entries(metadata)) {
      if (typeof val === 'string') {
        sanitizedMeta[key] = this.sanitizePII(val);
      } else {
        sanitizedMeta[key] = val;
      }
    }

    const event: ReliabilityLogEvent = {
      id: `rlog_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      eventType,
      timestamp: new Date().toISOString(),
      message: this.sanitizePII(message),
      sanitizedMetadata: sanitizedMeta
    };

    ReliabilityLogger.events.push(event);

    // Print structured JSON log to stdout for server observability
    console.log(`[AI_RELIABILITY_LOG] ${JSON.stringify(event)}`);
    return event;
  }

  public static logModelFailure(modelName: string, error: string, metadata: Record<string, any> = {}): ReliabilityLogEvent {
    return this.logEvent('MODEL_FAILURE', `Model execution failure on ${modelName}: ${error}`, metadata);
  }

  public static logInvalidOutput(modelName: string, schemaError: string, attempt: number): ReliabilityLogEvent {
    return this.logEvent(
      'INVALID_STRUCTURED_OUTPUT',
      `Structured JSON schema validation failed for ${modelName} on attempt ${attempt}: ${schemaError}`,
      { modelName, attempt, schemaError }
    );
  }

  public static logFallbackActivated(reasonCode: string, queryContext: string): ReliabilityLogEvent {
    return this.logEvent(
      'FALLBACK_ACTIVATED',
      `Non-dead-ending fallback activated due to ${reasonCode}`,
      { reasonCode, queryContextSnippet: queryContext.substring(0, 50) }
    );
  }

  public static logLowConfidenceDiagnosis(issueTypeId: string, confidence: number): ReliabilityLogEvent {
    return this.logEvent(
      'LOW_CONFIDENCE_DIAGNOSIS',
      `Diagnosis finalized with low confidence (${confidence}%) for issue type ${issueTypeId}`,
      { issueTypeId, confidence }
    );
  }

  public static logContradictionDetected(questionId: string, answerValue: string): ReliabilityLogEvent {
    return this.logEvent(
      'CONTRADICTION_DETECTED',
      `Contradictory triage answers detected on question ${questionId}`,
      { questionId, answerValue }
    );
  }

  public static logUngroundedActionRejected(action: string, kbIssueId: string): ReliabilityLogEvent {
    return this.logEvent(
      'UNGROUNDED_ACTION_REJECTED',
      `Ungrounded troubleshooting action rejected for issue ${kbIssueId}: fallback step selected`,
      { action, kbIssueId }
    );
  }

  public static logUnrecognizedIssueIdRejected(invalidId: string, fallbackId: string): ReliabilityLogEvent {
    return this.logEvent(
      'UNRECOGNIZED_ISSUE_ID_REJECTED',
      `Unrecognized issue ID ${invalidId} rejected; grounded fallback to ${fallbackId}`,
      { invalidId, fallbackId }
    );
  }

  public static getLogEvents(): ReliabilityLogEvent[] {
    return [...ReliabilityLogger.events];
  }

  public static clearLogEvents(): void {
    ReliabilityLogger.events = [];
  }
}
