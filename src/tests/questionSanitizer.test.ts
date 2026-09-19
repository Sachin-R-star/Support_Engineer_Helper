import { describe, it, expect } from 'vitest';
import { sanitizeQuestionText } from '../frontend/components/QuestionStep';

describe('Phase 20.2 — User-Facing Question Sanitization & Information Boundary', () => {
  it('1. Removes internal action metadata, ticket IDs, and PENDING status from questions', () => {
    const raw = "Did this issue start immediately after the preceding action (Action 'Automated triage completed for SSO Account Lockout / Password Reset with 98% confidence.' on ticket INC-2026-3478 executed 0h prior (PENDING))?";
    const sanitized = sanitizeQuestionText(raw);

    expect(sanitized).not.toContain('INC-2026-3478');
    expect(sanitized).not.toContain('98% confidence');
    expect(sanitized).not.toContain('PENDING');
    expect(sanitized).toBe('Did this issue start immediately after the previous troubleshooting step?');
  });

  it('2. Replaces technical endpoint phrase with natural language', () => {
    const raw = "Does the issue reproduce across multiple endpoints?";
    const sanitized = sanitizeQuestionText(raw);

    expect(sanitized).toBe('Does the issue happen for anyone else?');
  });

  it('3. Replaces preceding action execution event with previous troubleshooting step', () => {
    const raw = "Did the issue occur immediately after the preceding action execution event?";
    const sanitized = sanitizeQuestionText(raw);

    expect(sanitized).toBe('Did this issue start immediately after the previous troubleshooting step?');
  });

  it('4. Converts security rule phrasing to natural account lock message', () => {
    const raw = "ACCOUNT category locked by deterministic security rule";
    const sanitized = sanitizeQuestionText(raw);

    expect(sanitized).toBe('Your account may be locked');
  });

  it('5. Preserves normal user-facing question text without distortion', () => {
    const raw = "Is anyone else having the same problem?";
    const sanitized = sanitizeQuestionText(raw);

    expect(sanitized).toBe('Is anyone else having the same problem?');
  });
});
