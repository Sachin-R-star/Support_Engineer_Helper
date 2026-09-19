import { describe, it, expect } from 'vitest';
import { PriorityEngine } from '../backend/services/priorityEngine';
import { StructuredPrioritySignals } from '../backend/models';

describe('Explainable Priority Engine Test Suite', () => {
  it('1. LOW Priority: evaluates routine single-user inquiry with workaround available', () => {
    const signals: StructuredPrioritySignals = {
      users_affected: 'SINGLE_USER',
      work_completely_blocked: false,
      workaround_available: true
    };

    const result = PriorityEngine.evaluatePriority(signals, { initialQuery: 'how do I change my desktop wallpaper' });

    expect(result.priority).toBe('LOW');
    expect(result.score).toBeLessThan(30);
    expect(result.contributing_factors.some(f => f.reason_code === 'WORKAROUND_AVAILABLE_REDUCTION')).toBe(true);
    expect(result.explanation).toContain('Priority evaluated as LOW');
  });

  it('2. MEDIUM Priority: evaluates single user account lockout with self-service portal workaround', () => {
    const signals: StructuredPrioritySignals = {
      users_affected: 'SINGLE_USER',
      work_completely_blocked: true,
      critical_system_affected: true,
      workaround_available: true
    };

    const result = PriorityEngine.evaluatePriority(signals, {
      category: 'ACCOUNT',
      initialQuery: 'cant login password locked'
    });

    expect(result.priority).toBe('MEDIUM');
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.score).toBeLessThan(55);
    expect(result.contributing_factors.some(f => f.reason_code === 'WORK_COMPLETELY_BLOCKED')).toBe(true);
    expect(result.contributing_factors.some(f => f.reason_code === 'WORKAROUND_AVAILABLE_REDUCTION')).toBe(true);
  });

  it('3. HIGH Priority: evaluates team-wide unblocked hardware or application outage with no workaround', () => {
    const signals: StructuredPrioritySignals = {
      users_affected: 'TEAM',
      work_completely_blocked: true,
      critical_system_affected: false,
      workaround_available: false
    };

    const result = PriorityEngine.evaluatePriority(signals, {
      category: 'APPLICATION',
      initialQuery: 'all team members experiencing application crash'
    });

    expect(result.priority).toBe('HIGH');
    expect(result.score).toBeGreaterThanOrEqual(55);
    expect(result.score).toBeLessThan(80);
    expect(result.contributing_factors.some(f => f.reason_code === 'TEAM_AFFECTED')).toBe(true);
    expect(result.contributing_factors.some(f => f.reason_code === 'WORK_COMPLETELY_BLOCKED')).toBe(true);
  });

  it('4. CRITICAL Priority: forced override on active security compromise / phishing link clicked', () => {
    const signals: StructuredPrioritySignals = {
      security_implications: true,
      users_affected: 'SINGLE_USER'
    };

    const result = PriorityEngine.evaluatePriority(signals, {
      category: 'OTHER',
      initialQuery: 'I entered my corporate password on a suspicious phishing email link'
    });

    expect(result.priority).toBe('CRITICAL');
    expect(result.contributing_factors.some(f => f.reason_code === 'SECURITY_THREAT_DETECTED')).toBe(true);
    expect(result.explanation).toContain('Priority evaluated as CRITICAL');
  });

  it('5. CRITICAL Priority: physical battery swelling safety hazard override', () => {
    const result = PriorityEngine.evaluatePriority({}, {
      category: 'DEVICE',
      answers: { q_battery_phys: { questionId: 'q_battery_phys', questionText: 'Swelling', answerValue: 'battery_swollen', timestamp: new Date().toISOString() } },
      initialQuery: 'laptop battery is swelling trackpad lifted'
    });

    expect(result.priority).toBe('CRITICAL');
    expect(result.contributing_factors.some(f => f.reason_code === 'SAFETY_HAZARD_DETECTED')).toBe(true);
  });

  it('6. CRITICAL Priority: entire organization facility outage', () => {
    const signals: StructuredPrioritySignals = {
      users_affected: 'ENTIRE_ORGANIZATION',
      work_completely_blocked: true
    };

    const result = PriorityEngine.evaluatePriority(signals, {
      category: 'NETWORK',
      initialQuery: 'all users across entire office building lost internet connection'
    });

    expect(result.priority).toBe('CRITICAL');
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.contributing_factors.some(f => f.reason_code === 'ENTIRE_ORG_OUTAGE')).toBe(true);
  });

  it('7. Edge Case: Workaround availability score reduction lowers score', () => {
    const signalsNoWorkaround: StructuredPrioritySignals = {
      users_affected: 'TEAM',
      work_completely_blocked: true,
      critical_system_affected: true,
      workaround_available: false
    };

    const resultNoWorkaround = PriorityEngine.evaluatePriority(signalsNoWorkaround, { category: 'DEVICE' });

    const signalsWithWorkaround: StructuredPrioritySignals = {
      ...signalsNoWorkaround,
      workaround_available: true
    };

    const resultWithWorkaround = PriorityEngine.evaluatePriority(signalsWithWorkaround, { category: 'DEVICE' });

    expect(resultWithWorkaround.score).toBeLessThan(resultNoWorkaround.score);
    expect(resultWithWorkaround.contributing_factors.some(f => f.reason_code === 'WORKAROUND_AVAILABLE_REDUCTION')).toBe(true);
  });
});
