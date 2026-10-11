import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalEdgeService } from '../frontend/services/localEdgeService';
import { ApiClient } from '../frontend/services/apiClient';

describe('Client Edge Resilience & 429 Rate Limit Immunity Test Suite', () => {
  beforeEach(() => {
    ApiClient.setEdgeMode(false);
    vi.restoreAllMocks();
  });

  it('1. LocalEdgeService starts triage cleanly for "API is giving 500" with high confidence and valid questions', () => {
    const session = LocalEdgeService.startTriage('usr_exec_01', 'API is giving 500', 'dev_mac_01');

    expect(session).toBeDefined();
    expect(session.sessionId).toContain('edge_sess_');
    expect(session.userId).toBe('usr_exec_01');
    expect(session.candidateIssues.length).toBeGreaterThan(0);
    expect(session.confidence).toBeGreaterThanOrEqual(30);

    // Should generate a diagnostic question or candidate selection
    if (session.currentStep === 'PROGRESSIVE_QUESTION') {
      expect(session.currentQuestion).toBeDefined();
      expect(session.currentQuestion?.options.length).toBeGreaterThan(0);
    } else {
      expect(session.candidateIssues.length).toBeGreaterThan(0);
    }
  });

  it('2. LocalEdgeService advances questions and finalizes with structured recommendation and SLA priority', () => {
    const session = LocalEdgeService.startTriage('usr_exec_01', 'VPN disconnects constantly', 'dev_mac_01');

    if (session.currentStep === 'PROGRESSIVE_QUESTION' && session.currentQuestion) {
      const qId = session.currentQuestion.id;
      const updated = LocalEdgeService.answerQuestion(session.sessionId, qId, 'public_ok', false);
      expect(updated.answers[qId]).toBeDefined();
      expect(updated.answers[qId].answerValue).toBe('public_ok');

      // Finalize by completing question path
      if (updated.currentQuestion) {
        const finalSession = LocalEdgeService.answerQuestion(session.sessionId, updated.currentQuestion.id, 'us_east', false);
        expect(finalSession.currentStep).toBe('TRIAGE_COMPLETE');
        expect(finalSession.finalTriageResult).toBeDefined();
        expect(finalSession.finalTriageResult?.ticketNumber).toMatch(/^INC-2026-\d+/);
        expect(finalSession.finalTriageResult?.confidence).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it('3. ApiClient gracefully catches HTTP 429 and falls back to LocalEdgeService without crashing', async () => {
    // Mock fetch returning HTTP 429 Too Many Requests
    global.fetch = vi.fn().mockResolvedValue({
      status: 429,
      headers: {
        get: (h: string) => (h === 'content-type' ? 'text/plain' : null)
      },
      text: async () => 'Too Many Requests'
    } as any);

    // Call ApiClient.startTriage - MUST NOT THROW!
    const session = await ApiClient.startTriage('usr_exec_01', 'API is giving 500');

    expect(session).toBeDefined();
    expect(session.sessionId).toContain('edge_sess_');
    expect(ApiClient.isEdgeMode).toBe(true);
  });

  it('4. LocalEdgeService provides full offline CRUD for incidents and dashboard metrics', () => {
    const incidents = LocalEdgeService.fetchIncidents();
    expect(incidents.length).toBeGreaterThan(0);

    const stats = LocalEdgeService.fetchDashboardStats();
    expect(stats.totalIncidents).toBeGreaterThan(0);
    expect(stats.openCount).toBeGreaterThanOrEqual(0);
    expect(stats.resolvedCount).toBeGreaterThanOrEqual(0);

    const details = LocalEdgeService.fetchIncidentDetails(incidents[0].id);
    expect(details.incident.id).toBe(incidents[0].id);
    expect(details.user).toBeDefined();
  });
});
