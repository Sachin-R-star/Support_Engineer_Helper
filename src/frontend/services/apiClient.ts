import {
  TriageSession,
  IncidentRecord,
  TimelineEvent,
  IncidentGraphPayload,
  IncidentDetailResponse,
  DashboardStats
} from '../types/triage';
import { LocalEdgeService } from './localEdgeService';

const API_BASE = '/api';

export class ApiClient {
  public static isEdgeMode = false;
  private static listeners: ((isEdge: boolean) => void)[] = [];

  public static onModeChange(listener: (isEdge: boolean) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public static setEdgeMode(active: boolean): void {
    if (this.isEdgeMode !== active) {
      this.isEdgeMode = active;
      this.listeners.forEach(fn => fn(active));
    }
  }

  /**
   * Performs an HTTP request with automatic retry on transient rate limits (HTTP 429)
   * and gateway blips (502, 503, 504).
   */
  private static async requestJson(url: string, init?: RequestInit, retries = 2): Promise<any> {
    if (this.isEdgeMode) {
      throw new Error('EDGE_MODE_ACTIVE');
    }

    let lastError: any = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, init);

        // Handle rate limiting (429) or transient gateway errors (502, 503, 504)
        if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
          if (attempt < retries) {
            const retryAfter = res.headers.get('retry-after');
            const delayMs = retryAfter
              ? Math.max(parseInt(retryAfter, 10) * 1000, 1000)
              : Math.min(800 * Math.pow(2, attempt), 2500);
            await new Promise(r => setTimeout(r, delayMs));
            continue;
          }

          const rawText = await res.text();
          throw new Error(`CLOUD_API_RATE_LIMIT_${res.status}: ${rawText.substring(0, 100)}`);
        }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const text = await res.text();
          throw new Error(`API server returned non-JSON response (HTTP ${res.status}): ${text.substring(0, 150)}`);
        }

        const data = await res.json();
        return data;
      } catch (err: any) {
        lastError = err;
        if (attempt < retries && !err?.message?.includes('CLOUD_API_RATE_LIMIT') && !err?.message?.includes('EDGE_MODE_ACTIVE')) {
          await new Promise(r => setTimeout(r, 600));
          continue;
        }
        break;
      }
    }

    throw lastError;
  }

  public static async fetchDashboardStats(): Promise<DashboardStats> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/incidents/dashboard/stats`);
        if (data.success && data.stats) return data.stats;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Failed to fetch stats from cloud, falling back to edge store:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.fetchDashboardStats();
  }

  public static async startTriage(userId: string, query: string, deviceId?: string): Promise<TriageSession> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/triage/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, query, deviceId })
        });
        if (data.success && data.session) return data.session;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Triage cloud request rate limited or offline:', err?.message, '- transitioning to local edge engine.');
      this.setEdgeMode(true);
    }
    return LocalEdgeService.startTriage(userId, query, deviceId);
  }

  public static async selectCandidate(sessionId: string, issueTypeId: string): Promise<TriageSession> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/triage/select-issue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, issueTypeId })
        });
        if (data.success && data.session) return data.session;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud candidate selection failed, falling back to edge engine:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.selectCandidate(sessionId, issueTypeId);
  }

  public static async answerQuestion(
    sessionId: string,
    questionId: string,
    answerValue: string,
    isUnsure = false
  ): Promise<TriageSession> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/triage/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, questionId, answerValue, isUnsure })
        });
        if (data.success && data.session) return data.session;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud answer submission failed, falling back to edge engine:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.answerQuestion(sessionId, questionId, answerValue, isUnsure);
  }

  public static async goBack(sessionId: string): Promise<TriageSession> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/triage/back`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        });
        if (data.success && data.session) return data.session;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud navigation back failed, falling back to edge engine:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.goBack(sessionId);
  }

  public static async searchIssues(query: string): Promise<any[]> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        if (data.success && data.candidates) return data.candidates;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud search failed, falling back to edge catalog:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.searchIssues(query);
  }

  public static async fetchIncidents(userId?: string): Promise<IncidentRecord[]> {
    try {
      if (!this.isEdgeMode) {
        const url = userId ? `${API_BASE}/incidents?userId=${encodeURIComponent(userId)}` : `${API_BASE}/incidents`;
        const data = await this.requestJson(url);
        if (data.success && data.incidents) return data.incidents;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud incident fetch failed, falling back to edge store:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.fetchIncidents(userId);
  }

  public static async fetchIncidentDetails(id: string): Promise<IncidentDetailResponse> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/incidents/${id}`);
        if (data.success && data.incident) return data;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud incident details fetch failed, falling back to edge store:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.fetchIncidentDetails(id);
  }

  public static async fetchIncidentTimeline(id: string): Promise<TimelineEvent[]> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/incidents/${id}/timeline`);
        if (data.success && data.timeline) return data.timeline;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud timeline fetch failed, falling back to edge store:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.fetchIncidentTimeline(id);
  }

  public static async fetchIncidentGraph(id: string): Promise<IncidentGraphPayload> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/incidents/${id}/graph`);
        if (data.success && data.graph) return data.graph;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud graph fetch failed, falling back to edge store:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.fetchIncidentGraph(id);
  }

  public static async fetchIncidentChain(id: string): Promise<IncidentRecord[]> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/incidents/${id}/chain`);
        if (data.success && data.chain) return data.chain;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud incident chain fetch failed, falling back to edge store:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.fetchIncidentChain(id);
  }

  public static async reopenIncident(id: string, reason: string): Promise<IncidentRecord> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/incidents/${id}/reopen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })
        });
        if (data.success && data.incident) return data.incident;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud reopen incident failed, falling back to edge store:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.reopenIncident(id, reason);
  }

  public static async resolveIncident(id: string, resolution: string): Promise<IncidentRecord> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/incidents/${id}/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resolution })
        });
        if (data.success && data.incident) return data.incident;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud resolve incident failed, falling back to edge store:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.resolveIncident(id, resolution);
  }

  public static async confirmRelationship(relId: string, actorId = 'USER'): Promise<any> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/incidents/relationships/${relId}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actorId })
        });
        if (data.success) return data.relationship;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud relationship confirmation failed, falling back to edge store:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.confirmRelationship(relId);
  }

  public static async rejectRelationship(relId: string, actorId = 'USER'): Promise<any> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/incidents/relationships/${relId}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actorId })
        });
        if (data.success) return data.relationship;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud relationship rejection failed, falling back to edge store:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.rejectRelationship(relId);
  }

  public static async linkIncidents(
    sourceIncidentId: string,
    targetIncidentId: string,
    relationshipType: string,
    explanation = '',
    similarityScore = 0.85
  ): Promise<any> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/incidents/${sourceIncidentId}/link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetIncidentId,
            relationshipType,
            explanation,
            similarityScore,
            status: 'CONFIRMED'
          })
        });
        if (data.success) return data.relationship;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud incident linking failed, falling back to edge store:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.linkIncidents(sourceIncidentId, targetIncidentId, relationshipType);
  }

  public static async appendAction(
    incidentId: string,
    actionType: string,
    description: string,
    performer = 'USER'
  ): Promise<any> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/incidents/${incidentId}/actions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionType, description, performer })
        });
        if (data.success) return data.action;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud append action failed, falling back to edge store:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.appendAction(incidentId, actionType, description);
  }

  public static async recordActionResult(
    incidentId: string,
    actionId: string,
    resultStatus: 'SUCCESS' | 'FAILURE' | 'PARTIAL',
    resultDetails: string
  ): Promise<any> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/incidents/${incidentId}/actions/${actionId}/result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resultStatus, resultDetails })
        });
        if (data.success) return data.action;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud action result recording failed, falling back to edge store:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.recordActionResult(incidentId, actionId, resultStatus, resultDetails);
  }

  public static async verifyActionResult(
    incidentId: string,
    actionDescription: string,
    resultStatus: 'YES_RESOLVED' | 'NO_FAILED' | 'PARTIALLY_RESOLVED' | 'SOMETHING_CHANGED' | 'PENDING',
    userNotes?: string,
    actionId?: string
  ): Promise<any> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/incidents/${incidentId}/verify-action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionId, actionDescription, resultStatus, userNotes })
        });
        if (data.success) return data;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud action verification failed, falling back to edge store:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.verifyActionResult(incidentId, actionDescription, resultStatus, userNotes);
  }

  public static async fetchRca(incidentId: string): Promise<any> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/incidents/${incidentId}/rca`);
        if (data.success && data.rca) return data.rca;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud RCA fetch failed, falling back to edge store:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.fetchRca(incidentId);
  }

  public static async recordRcaDecision(
    incidentId: string,
    candidateId: string,
    decision: 'CONFIRMED' | 'REJECTED' | 'UNCERTAIN' | 'NONE',
    notes?: string,
    overrideReason?: string,
    actorId = 'USER'
  ): Promise<any> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/incidents/${incidentId}/rca/decide`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidateId, decision, notes, overrideReason, actorId })
        });
        if (data.success) return data.rca;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud RCA decision recording failed, falling back to edge store:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.recordRcaDecision(incidentId, candidateId, decision, notes);
  }

  public static async verifyRcaHypothesis(
    incidentId: string,
    candidateId: string,
    result: 'CONFIRMED' | 'DISPROVED' | 'INCONCLUSIVE',
    notes?: string,
    actorId = 'USER'
  ): Promise<any> {
    try {
      if (!this.isEdgeMode) {
        const data = await this.requestJson(`${API_BASE}/incidents/${incidentId}/rca/verify-hypothesis`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidateId, result, notes, actorId })
        });
        if (data.success) return data.rca;
      }
    } catch (err: any) {
      console.warn('[ApiClient] Cloud RCA hypothesis verification failed, falling back to edge store:', err?.message);
      this.setEdgeMode(true);
    }
    return LocalEdgeService.verifyRcaHypothesis(incidentId, candidateId, result, notes);
  }
}
