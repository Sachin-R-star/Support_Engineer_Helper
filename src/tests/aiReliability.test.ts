import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { AiReliabilityService } from '../backend/services/aiReliabilityService';
import { ReliabilityLogger } from '../backend/services/reliabilityLogger';
import { TaxonomyService } from '../backend/services/taxonomyService';

describe('AI Reliability Pass & Observability Guardrails', () => {
  beforeEach(() => {
    ReliabilityLogger.clearLogEvents();
  });

  describe('Structured JSON Schema Validation & Retry Mechanism', () => {
    const SampleSchema = z.object({
      recommendation: z.string(),
      confidence: z.number().min(0).max(100),
      escalate: z.boolean()
    });

    const fallbackData = {
      recommendation: 'Safe fallback recommendation.',
      confidence: 50,
      escalate: false
    };

    it('should parse and validate valid structured JSON output on the first attempt', async () => {
      const validSupplier = () => JSON.stringify({
        recommendation: 'Restart GlobalProtect VPN service.',
        confidence: 85,
        escalate: false
      });

      const res = await AiReliabilityService.executeWithRetryAndValidation(
        'TestModel',
        validSupplier,
        SampleSchema,
        fallbackData,
        3
      );

      expect(res.isFallback).toBe(false);
      expect(res.attempts).toBe(1);
      expect(res.result.recommendation).toBe('Restart GlobalProtect VPN service.');
      expect(res.result.confidence).toBe(85);
    });

    it('should retry on malformed JSON and activate safe fallback after retries are exhausted', async () => {
      let attempts = 0;
      const malformedSupplier = () => {
        attempts++;
        return `INVALID_JSON_OUTPUT_ATTEMPT_${attempts}`;
      };

      const res = await AiReliabilityService.executeWithRetryAndValidation(
        'MalformedModel',
        malformedSupplier,
        SampleSchema,
        fallbackData,
        3
      );

      expect(res.isFallback).toBe(true);
      expect(res.attempts).toBe(3);
      expect(res.result).toEqual(fallbackData);

      const logs = ReliabilityLogger.getLogEvents();
      expect(logs.some(l => l.eventType === 'INVALID_STRUCTURED_OUTPUT')).toBe(true);
      expect(logs.some(l => l.eventType === 'FALLBACK_ACTIVATED')).toBe(true);
    });

    it('should recover when a retry succeeds after initial malformed outputs', async () => {
      let attempts = 0;
      const flakySupplier = () => {
        attempts++;
        if (attempts < 2) {
          return '{"recommendation": "missing confidence field"}';
        }
        return JSON.stringify({
          recommendation: 'Clear DNS cache.',
          confidence: 90,
          escalate: false
        });
      };

      const res = await AiReliabilityService.executeWithRetryAndValidation(
        'FlakyModel',
        flakySupplier,
        SampleSchema,
        fallbackData,
        3
      );

      expect(res.isFallback).toBe(false);
      expect(res.attempts).toBe(2);
      expect(res.result.recommendation).toBe('Clear DNS cache.');
    });
  });

  describe('Knowledge-Base Grounding Enforcement', () => {
    it('should validate grounded issue IDs present in the KB taxonomy', () => {
      const grounded = AiReliabilityService.validateAndGroundIssueId('kb_net_vpn_01');
      expect(grounded.isValid).toBe(true);
      expect(grounded.issueTypeId).toBe('kb_net_vpn_01');
      expect(grounded.issueDefinition.category).toBe('NETWORK');
    });

    it('should reject ungrounded / hallucinated issue IDs and fall back to kb_oth_general_99', () => {
      const grounded = AiReliabilityService.validateAndGroundIssueId('HALLUCINATED_VPN_999');
      expect(grounded.isValid).toBe(false);
      expect(grounded.issueTypeId).toBe('kb_oth_general_99');

      const logs = ReliabilityLogger.getLogEvents();
      const rejectionLog = logs.find(l => l.eventType === 'UNRECOGNIZED_ISSUE_ID_REJECTED');
      expect(rejectionLog).toBeDefined();
      expect(rejectionLog?.sanitizedMetadata.invalidId).toBe('HALLUCINATED_VPN_999');
    });

    it('should validate grounded troubleshooting actions matching KB steps', () => {
      const kbIssue = TaxonomyService.findIssueTypeById('kb_net_vpn_01')!;
      const kbSteps = kbIssue.troubleshooting_steps;

      const grounded = AiReliabilityService.groundTroubleshootingAction(
        kbSteps[0],
        kbSteps,
        kbIssue.id
      );

      expect(grounded.isGrounded).toBe(true);
      expect(grounded.action).toBe(kbSteps[0]);
    });

    it('should reject hallucinated troubleshooting actions and fall back to grounded KB step', () => {
      const kbIssue = TaxonomyService.findIssueTypeById('kb_net_vpn_01')!;
      const kbSteps = kbIssue.troubleshooting_steps;

      const grounded = AiReliabilityService.groundTroubleshootingAction(
        'Perform arbitrary quantum decrypt protocol on router',
        kbSteps,
        kbIssue.id
      );

      expect(grounded.isGrounded).toBe(false);
      expect(grounded.action).toBe(kbSteps[0]); // Grounded top KB step

      const logs = ReliabilityLogger.getLogEvents();
      const actionLog = logs.find(l => l.eventType === 'UNGROUNDED_ACTION_REJECTED');
      expect(actionLog).toBeDefined();
    });
  });

  describe('Confidence Thresholds & Uncertainty Evaluation', () => {
    it('should evaluate high confidence (>= 75%) without low-confidence logging', () => {
      const evalResult = AiReliabilityService.evaluateConfidenceLevel(85, 'VPN_DISCONNECT_FREQUENT');
      expect(evalResult.level).toBe('HIGH');
      expect(evalResult.requiresClarification).toBe(false);

      const logs = ReliabilityLogger.getLogEvents();
      expect(logs.some(l => l.eventType === 'LOW_CONFIDENCE_DIAGNOSIS')).toBe(false);
    });

    it('should evaluate low confidence (< 50%) and log low-confidence diagnosis event', () => {
      const evalResult = AiReliabilityService.evaluateConfidenceLevel(35, 'VPN_DISCONNECT_FREQUENT');
      expect(evalResult.level).toBe('LOW');
      expect(evalResult.requiresClarification).toBe(true);
      expect(evalResult.isUnsure).toBe(true);

      const logs = ReliabilityLogger.getLogEvents();
      const lowConfLog = logs.find(l => l.eventType === 'LOW_CONFIDENCE_DIAGNOSIS');
      expect(lowConfLog).toBeDefined();
      expect(lowConfLog?.sanitizedMetadata.confidence).toBe(35);
    });
  });

  describe('Observability Logger & PII Sanitization', () => {
    it('should sanitize PII credentials, emails, SSNs, and bearer tokens in logs', () => {
      const sensitiveMsg = 'User john.doe@enterprise.com provided password=SecretPassword123 and bearer eyJhbGciOiJIUzI1NiJ9';
      const sanitized = ReliabilityLogger.sanitizePII(sensitiveMsg);

      expect(sanitized).not.toContain('john.doe@enterprise.com');
      expect(sanitized).not.toContain('SecretPassword123');
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiJ9');
      expect(sanitized).toContain('[EMAIL_REDACTED]');
      expect(sanitized).toContain('password=[REDACTED]');
      expect(sanitized).toContain('bearer [REDACTED]');
    });

    it('should capture model failure logs cleanly with sanitized metadata', () => {
      ReliabilityLogger.logModelFailure('GptModel', 'User secret key failed with password=MySecretPass');
      const logs = ReliabilityLogger.getLogEvents();

      expect(logs.length).toBe(1);
      expect(logs[0].eventType).toBe('MODEL_FAILURE');
      expect(logs[0].message).toContain('password=[REDACTED]');
      expect(logs[0].message).not.toContain('MySecretPass');
    });
  });
});
