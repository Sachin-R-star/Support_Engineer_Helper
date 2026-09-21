import { TriageSession, IncidentRecord, TimelineEvent, IncidentGraphPayload, IncidentDetailResponse, DashboardStats } from '../types/triage';

const API_BASE = '/api';

export class ApiClient {
  private static async requestJson(url: string, init?: RequestInit): Promise<any> {
    const res = await fetch(url, init);
    const contentType = res.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      const text = await res.text();
      throw new Error(`API server returned non-JSON response (HTTP ${res.status}): ${text.substring(0, 150)}`);
    }

    const data = await res.json();
    return data;
  }

  public static async fetchDashboardStats(): Promise<DashboardStats> {
    const data = await this.requestJson(`${API_BASE}/incidents/dashboard/stats`);
    if (!data.success) throw new Error(data.error || 'Failed to fetch dashboard stats');
    return data.stats;
  }

  public static async startTriage(userId: string, query: string, deviceId?: string): Promise<TriageSession> {
    const data = await this.requestJson(`${API_BASE}/triage/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, query, deviceId })
    });
    if (!data.success) throw new Error(data.error || 'Failed to start triage');
    return data.session;
  }

  public static async selectCandidate(sessionId: string, issueTypeId: string): Promise<TriageSession> {
    const data = await this.requestJson(`${API_BASE}/triage/select-issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, issueTypeId })
    });
    if (!data.success) throw new Error(data.error || 'Failed to select issue');
    return data.session;
  }

  public static async answerQuestion(
    sessionId: string, 
    questionId: string, 
    answerValue: string,
    isUnsure = false
  ): Promise<TriageSession> {
    const data = await this.requestJson(`${API_BASE}/triage/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, questionId, answerValue, isUnsure })
    });
    if (!data.success) throw new Error(data.error || 'Failed to process answer');
    return data.session;
  }

  public static async goBack(sessionId: string): Promise<TriageSession> {
    const data = await this.requestJson(`${API_BASE}/triage/back`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
    if (!data.success) throw new Error(data.error || 'Failed to navigate back');
    return data.session;
  }

  public static async searchIssues(query: string): Promise<any[]> {
    const data = await this.requestJson(`${API_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    if (!data.success) throw new Error(data.error || 'Search failed');
    return data.candidates;
  }

  public static async fetchIncidents(userId?: string): Promise<IncidentRecord[]> {
    const url = userId ? `${API_BASE}/incidents?userId=${encodeURIComponent(userId)}` : `${API_BASE}/incidents`;
    const data = await this.requestJson(url);
    if (!data.success) throw new Error(data.error || 'Failed to fetch incidents');
    return data.incidents;
  }

  public static async fetchIncidentDetails(id: string): Promise<IncidentDetailResponse> {
    const data = await this.requestJson(`${API_BASE}/incidents/${id}`);
    if (!data.success) throw new Error(data.error || 'Failed to fetch incident details');
    return data;
  }

  public static async fetchIncidentTimeline(id: string): Promise<TimelineEvent[]> {
    const data = await this.requestJson(`${API_BASE}/incidents/${id}/timeline`);
    if (!data.success) throw new Error(data.error || 'Failed to fetch incident timeline');
    return data.timeline;
  }

  public static async fetchIncidentGraph(id: string): Promise<IncidentGraphPayload> {
    const data = await this.requestJson(`${API_BASE}/incidents/${id}/graph`);
    if (!data.success) throw new Error(data.error || 'Failed to fetch incident graph');
    return data.graph;
  }

  public static async fetchIncidentChain(id: string): Promise<IncidentRecord[]> {
    const data = await this.requestJson(`${API_BASE}/incidents/${id}/chain`);
    if (!data.success) throw new Error(data.error || 'Failed to fetch incident chain');
    return data.chain;
  }

  public static async reopenIncident(id: string, reason: string): Promise<IncidentRecord> {
    const data = await this.requestJson(`${API_BASE}/incidents/${id}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    if (!data.success) throw new Error(data.error || 'Failed to reopen incident');
    return data.incident;
  }

  public static async resolveIncident(id: string, resolution: string): Promise<IncidentRecord> {
    const data = await this.requestJson(`${API_BASE}/incidents/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution })
    });
    if (!data.success) throw new Error(data.error || 'Failed to resolve incident');
    return data.incident;
  }

  public static async confirmRelationship(relId: string, actorId = 'USER'): Promise<any> {
    const data = await this.requestJson(`${API_BASE}/incidents/relationships/${relId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId })
    });
    if (!data.success) throw new Error(data.error || 'Failed to confirm relationship');
    return data.relationship;
  }

  public static async rejectRelationship(relId: string, actorId = 'USER'): Promise<any> {
    const data = await this.requestJson(`${API_BASE}/incidents/relationships/${relId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId })
    });
    if (!data.success) throw new Error(data.error || 'Failed to reject relationship');
    return data.relationship;
  }

  public static async linkIncidents(
    sourceIncidentId: string, 
    targetIncidentId: string, 
    relationshipType: string, 
    explanation = '', 
    similarityScore = 0.85
  ): Promise<any> {
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
    if (!data.success) throw new Error(data.error || 'Failed to link incidents');
    return data.relationship;
  }

  public static async appendAction(
    incidentId: string, 
    actionType: string, 
    description: string, 
    performer = 'USER'
  ): Promise<any> {
    const data = await this.requestJson(`${API_BASE}/incidents/${incidentId}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionType, description, performer })
    });
    if (!data.success) throw new Error(data.error || 'Failed to append action');
    return data.action;
  }

  public static async recordActionResult(
    incidentId: string, 
    actionId: string, 
    resultStatus: 'SUCCESS' | 'FAILURE' | 'PARTIAL', 
    resultDetails: string
  ): Promise<any> {
    const data = await this.requestJson(`${API_BASE}/incidents/${incidentId}/actions/${actionId}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resultStatus, resultDetails })
    });
    if (!data.success) throw new Error(data.error || 'Failed to record action result');
    return data.action;
  }

  public static async verifyActionResult(
    incidentId: string,
    actionDescription: string,
    resultStatus: 'YES_RESOLVED' | 'NO_FAILED' | 'PARTIALLY_RESOLVED' | 'SOMETHING_CHANGED' | 'PENDING',
    userNotes?: string,
    actionId?: string
  ): Promise<any> {
    const data = await this.requestJson(`${API_BASE}/incidents/${incidentId}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId, actionDescription, resultStatus, userNotes })
    });
    if (!data.success) throw new Error(data.error || 'Failed to verify action result');
    return data;
  }

  public static async fetchRca(incidentId: string): Promise<any> {
    const data = await this.requestJson(`${API_BASE}/incidents/${incidentId}/rca`);
    if (!data.success) throw new Error(data.error || 'Failed to fetch RCA');
    return data.rca;
  }

  public static async recordRcaDecision(
    incidentId: string,
    candidateId: string,
    decision: 'CONFIRMED' | 'REJECTED' | 'UNCERTAIN' | 'NONE',
    notes?: string,
    overrideReason?: string,
    actorId = 'USER'
  ): Promise<any> {
    const data = await this.requestJson(`${API_BASE}/incidents/${incidentId}/rca/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId, decision, notes, overrideReason, actorId })
    });
    if (!data.success) throw new Error(data.error || 'Failed to record RCA decision');
    return data.rca;
  }

  public static async verifyRcaHypothesis(
    incidentId: string,
    candidateId: string,
    result: 'CONFIRMED' | 'DISPROVED' | 'INCONCLUSIVE',
    notes?: string,
    actorId = 'USER'
  ): Promise<any> {
    const data = await this.requestJson(`${API_BASE}/incidents/${incidentId}/rca/verify-hypothesis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId, result, notes, actorId })
    });
    if (!data.success) throw new Error(data.error || 'Failed to record hypothesis verification');
    return data.rca;
  }
}
