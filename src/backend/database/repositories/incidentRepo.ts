import { DatabaseService } from '../db';
import { 
  Incident, 
  IncidentAnswer, 
  IncidentAction, 
  IncidentRelationship,
  User,
  Device,
  TriageEvidence,
  IncidentStatus,
  EscalationTier
} from '../../models';

export interface IncidentEvent {
  id: string;
  incidentId: string;
  eventType: string;
  description: string;
  metadataJson: string;
  createdAt: string;
}

export interface IncidentTimeline {
  incident: Incident;
  user: User | null;
  device: Device | null;
  answers: IncidentAnswer[];
  actions: IncidentAction[];
  evidence: TriageEvidence[];
  events: IncidentEvent[];
  relationships: IncidentRelationship[];
}

export class IncidentRepository {
  private db = DatabaseService.getDb();

  public createIncident(incident: Omit<Incident, 'createdAt' | 'updatedAt'> & { resolution?: string; escalationTier?: EscalationTier }): Incident {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO incidents (
        id, ticket_number, user_id, device_id, category, issue_type, priority, 
        status, summary, description, resolution, escalation_tier, missing_info, recommended_next_step, 
        reasoning, confidence_score, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      incident.id,
      incident.ticketNumber,
      incident.userId,
      incident.deviceId || null,
      incident.category,
      incident.issueType,
      incident.priority,
      incident.status || 'OPEN',
      incident.summary,
      incident.description,
      incident.resolution || null,
      incident.escalationTier || 'NONE',
      JSON.stringify(incident.missingInfo),
      incident.recommendedNextStep,
      incident.reasoning,
      incident.confidenceScore,
      now,
      now
    );

    this.addEvent(incident.id, 'CREATED', `Incident ${incident.ticketNumber} created with priority ${incident.priority}`, { category: incident.category, issueType: incident.issueType });

    return { ...incident, status: incident.status || 'OPEN', createdAt: now, updatedAt: now };
  }

  public getIncidentById(id: string): Incident | null {
    const row = this.db.prepare('SELECT * FROM incidents WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapIncidentRow(row);
  }

  public getAllIncidents(userId?: string): Incident[] {
    const query = userId 
      ? 'SELECT * FROM incidents WHERE user_id = ? ORDER BY created_at DESC'
      : 'SELECT * FROM incidents ORDER BY created_at DESC';
    const rows = (userId ? this.db.prepare(query).all(userId) : this.db.prepare(query).all()) as any[];
    return rows.map(r => this.mapIncidentRow(r));
  }

  public updateStatus(incidentId: string, status: IncidentStatus, extraFields?: { resolution?: string; escalationTier?: EscalationTier }): Incident {
    const now = new Date().toISOString();
    const current = this.getIncidentById(incidentId);
    if (!current) throw new Error(`Incident ${incidentId} not found`);

    let resolvedAt = current.status === 'RESOLVED' ? (current as any).resolvedAt : null;
    let reopenedAt = (current as any).reopenedAt || null;

    if (status === 'RESOLVED') {
      resolvedAt = now;
    } else if (status === 'REOPENED') {
      reopenedAt = now;
    }

    const stmt = this.db.prepare(`
      UPDATE incidents 
      SET status = ?, 
          resolution = COALESCE(?, resolution), 
          escalation_tier = COALESCE(?, escalation_tier),
          resolved_at = COALESCE(?, resolved_at),
          reopened_at = COALESCE(?, reopened_at),
          updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      status,
      extraFields?.resolution || null,
      extraFields?.escalationTier || null,
      resolvedAt,
      reopenedAt,
      now,
      incidentId
    );

    this.addEvent(incidentId, 'STATUS_CHANGED', `Incident status updated to ${status}`, { previousStatus: current.status, newStatus: status });

    return this.getIncidentById(incidentId)!;
  }

  public resolveIncident(incidentId: string, resolution: string): Incident {
    return this.updateStatus(incidentId, 'RESOLVED', { resolution });
  }

  public reopenIncident(incidentId: string, reason: string): Incident {
    const updated = this.updateStatus(incidentId, 'REOPENED');
    this.addEvent(incidentId, 'REOPENED', `Incident reopened by user/agent: ${reason}`, { reason });
    return updated;
  }

  public appendAnswer(answer: Omit<IncidentAnswer, 'createdAt'> & { isUnsure?: boolean }): IncidentAnswer {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO incident_answers (id, incident_id, question_id, question_text, answer_value, is_unsure, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(answer.id, answer.incidentId, answer.questionId, answer.questionText, answer.answerValue, answer.isUnsure ? 1 : 0, now);
    
    this.addEvent(answer.incidentId, 'ANSWER_ADDED', `Answer recorded for "${answer.questionText}"`, { questionId: answer.questionId, answerValue: answer.answerValue });
    return { ...answer, createdAt: now };
  }

  public appendAction(action: Omit<IncidentAction, 'createdAt'> & { resultStatus?: string; resultDetails?: string }): IncidentAction {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO incident_actions (id, incident_id, action_type, description, result_status, result_details, performer, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      action.id,
      action.incidentId,
      action.actionType,
      action.description,
      action.resultStatus || 'PENDING',
      action.resultDetails || null,
      action.performer,
      now
    );

    this.addEvent(action.incidentId, 'ACTION_ADDED', `Action appended: ${action.description}`, { actionType: action.actionType });
    return { ...action, createdAt: now };
  }

  public recordActionResult(actionId: string, resultStatus: string, resultDetails: string): IncidentAction {
    const now = new Date().toISOString();
    const row = this.db.prepare('SELECT * FROM incident_actions WHERE id = ?').get(actionId) as any;
    if (!row) throw new Error(`Action ${actionId} not found`);

    this.db.prepare(`
      UPDATE incident_actions 
      SET result_status = ?, result_details = ? 
      WHERE id = ?
    `).run(resultStatus, resultDetails, actionId);

    this.addEvent(row.incident_id, 'RESULT_RECORDED', `Action result recorded: ${resultStatus}`, { actionId, resultStatus, resultDetails });

    const updatedRow = this.db.prepare('SELECT * FROM incident_actions WHERE id = ?').get(actionId) as any;
    return {
      id: updatedRow.id,
      incidentId: updatedRow.incident_id,
      actionType: updatedRow.action_type,
      description: updatedRow.description,
      performer: updatedRow.performer,
      createdAt: updatedRow.created_at
    };
  }

  public getAttemptedActionsForIncident(incidentId: string): { id: string; actionDescription: string; resultStatus: any; userNotes?: string; timestamp: string }[] {
    const rows = this.db.prepare(`
      SELECT id, description, result_status, result_details, created_at 
      FROM incident_actions 
      WHERE incident_id = ? AND (action_type = 'TROUBLESHOOTING_STEP' OR result_status != 'PENDING')
      ORDER BY created_at ASC
    `).all(incidentId) as any[];

    return rows.map(r => ({
      id: r.id,
      actionDescription: r.description,
      resultStatus: r.result_status || 'PENDING',
      userNotes: r.result_details || undefined,
      timestamp: r.created_at
    }));
  }

  public addEvidence(incidentId: string, factKey: string, factValue: string, sourceQuestionId: string): TriageEvidence {
    const now = new Date().toISOString();
    const id = `ev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const stmt = this.db.prepare(`
      INSERT INTO incident_evidence (id, incident_id, fact_key, fact_value, source_question_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, incidentId, factKey, factValue, sourceQuestionId, now);
    return { factKey, factValue, sourceQuestionId };
  }

  public addEvent(incidentId: string, eventType: string, description: string, metadata?: Record<string, any>): IncidentEvent {
    const now = new Date().toISOString();
    const id = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const stmt = this.db.prepare(`
      INSERT INTO incident_events (id, incident_id, event_type, description, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, incidentId, eventType, description, JSON.stringify(metadata || {}), now);
    return { id, incidentId, eventType, description, metadataJson: JSON.stringify(metadata || {}), createdAt: now };
  }

  public getIncidentTimeline(incidentId: string): IncidentTimeline {
    const incident = this.getIncidentById(incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found`);

    const user = this.getUserById(incident.userId);
    const device = incident.deviceId ? this.getDeviceById(incident.deviceId) : null;
    const answers = this.getAnswersForIncident(incidentId);
    const actions = this.getActionsForIncident(incidentId);
    const evidence = this.getEvidenceForIncident(incidentId);
    const events = this.getEventsForIncident(incidentId);
    const relationships = this.getRelationshipsForIncident(incidentId);

    return {
      incident,
      user,
      device,
      answers,
      actions,
      evidence,
      events,
      relationships
    };
  }

  public getAnswersForIncident(incidentId: string): IncidentAnswer[] {
    const rows = this.db.prepare('SELECT * FROM incident_answers WHERE incident_id = ? ORDER BY created_at ASC').all(incidentId) as any[];
    return rows.map(r => ({
      id: r.id,
      incidentId: r.incident_id,
      questionId: r.question_id,
      questionText: r.question_text,
      answerValue: r.answer_value,
      createdAt: r.created_at
    }));
  }

  public getActionsForIncident(incidentId: string): IncidentAction[] {
    const rows = this.db.prepare('SELECT * FROM incident_actions WHERE incident_id = ? ORDER BY created_at ASC').all(incidentId) as any[];
    return rows.map(r => ({
      id: r.id,
      incidentId: r.incident_id,
      actionType: r.action_type,
      description: r.description,
      resultStatus: r.result_status || 'PENDING',
      resultDetails: r.result_details || undefined,
      performer: r.performer,
      createdAt: r.created_at
    }));
  }

  public getEvidenceForIncident(incidentId: string): TriageEvidence[] {
    const rows = this.db.prepare('SELECT * FROM incident_evidence WHERE incident_id = ? ORDER BY created_at ASC').all(incidentId) as any[];
    return rows.map(r => ({
      factKey: r.fact_key,
      factValue: r.fact_value,
      sourceQuestionId: r.source_question_id
    }));
  }

  public getEventsForIncident(incidentId: string): IncidentEvent[] {
    const rows = this.db.prepare('SELECT * FROM incident_events WHERE incident_id = ? ORDER BY created_at ASC').all(incidentId) as any[];
    return rows.map(r => ({
      id: r.id,
      incidentId: r.incident_id,
      eventType: r.event_type,
      description: r.description,
      metadataJson: r.metadata_json,
      createdAt: r.created_at
    }));
  }

  public addRelationship(rel: Omit<IncidentRelationship, 'createdAt'> & { createdAt?: string }): IncidentRelationship {
    const now = rel.createdAt || new Date().toISOString();
    const status = rel.status || 'CONFIRMED';
    const explanation = rel.explanation || '';

    const stmt = this.db.prepare(`
      INSERT INTO incident_relationships (
        id, source_incident_id, target_incident_id, relationship_type, 
        similarity_score, status, source_action_id, explanation, confirmed_by, confirmed_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_incident_id, target_incident_id) DO UPDATE SET
        relationship_type = excluded.relationship_type,
        similarity_score = excluded.similarity_score,
        status = excluded.status,
        source_action_id = excluded.source_action_id,
        explanation = excluded.explanation,
        confirmed_by = excluded.confirmed_by,
        confirmed_at = excluded.confirmed_at
    `);
    stmt.run(
      rel.id,
      rel.sourceIncidentId,
      rel.targetIncidentId,
      rel.relationshipType,
      rel.similarityScore,
      status,
      rel.sourceActionId || null,
      explanation,
      rel.confirmedBy || null,
      rel.confirmedAt || null,
      now
    );

    return {
      id: rel.id,
      sourceIncidentId: rel.sourceIncidentId,
      targetIncidentId: rel.targetIncidentId,
      relationshipType: rel.relationshipType,
      similarityScore: rel.similarityScore,
      status,
      sourceActionId: rel.sourceActionId,
      explanation,
      confirmedBy: rel.confirmedBy,
      confirmedAt: rel.confirmedAt,
      createdAt: now
    };
  }

  public updateRelationshipStatus(
    relationshipId: string, 
    status: 'CONFIRMED' | 'REJECTED', 
    confirmedBy: string = 'USER'
  ): IncidentRelationship {
    const now = new Date().toISOString();
    const row = this.db.prepare('SELECT * FROM incident_relationships WHERE id = ?').get(relationshipId) as any;
    if (!row) throw new Error(`Relationship ${relationshipId} not found`);

    this.db.prepare(`
      UPDATE incident_relationships
      SET status = ?, confirmed_by = ?, confirmed_at = ?
      WHERE id = ?
    `).run(status, confirmedBy, now, relationshipId);

    this.addEvent(
      row.source_incident_id, 
      'RELATIONSHIP_UPDATED', 
      `Relationship to ${row.target_incident_id} marked as ${status}`, 
      { relationshipId, status, confirmedBy }
    );

    const updated = this.db.prepare('SELECT * FROM incident_relationships WHERE id = ?').get(relationshipId) as any;
    return this.mapRelationshipRow(updated);
  }

  public addAnswer(answer: Omit<IncidentAnswer, 'createdAt'> & { isUnsure?: boolean }): IncidentAnswer {
    return this.appendAnswer(answer);
  }

  public addAction(action: Omit<IncidentAction, 'createdAt'> & { resultStatus?: string; resultDetails?: string }): IncidentAction {
    return this.appendAction(action);
  }

  public getRelationshipsForIncident(incidentId: string): IncidentRelationship[] {
    const rows = this.db.prepare(`
      SELECT * FROM incident_relationships 
      WHERE source_incident_id = ? OR target_incident_id = ?
      ORDER BY similarity_score DESC
    `).all(incidentId, incidentId) as any[];

    return rows.map(r => this.mapRelationshipRow(r));
  }

  public getIncidentGraph(incidentId: string): { nodes: Incident[]; edges: IncidentRelationship[] } {
    const visitedIncidentIds = new Set<string>();
    const queue: string[] = [incidentId];
    const edges: IncidentRelationship[] = [];
    const edgeMap = new Map<string, IncidentRelationship>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visitedIncidentIds.has(currentId)) continue;
      visitedIncidentIds.add(currentId);

      const incidentEdges = this.getRelationshipsForIncident(currentId);
      for (const edge of incidentEdges) {
        if (edge.status === 'REJECTED') continue; // Skip rejected edges from active graph
        if (!edgeMap.has(edge.id)) {
          edgeMap.set(edge.id, edge);
          edges.push(edge);
        }

        const neighborId = edge.sourceIncidentId === currentId ? edge.targetIncidentId : edge.sourceIncidentId;
        if (!visitedIncidentIds.has(neighborId)) {
          queue.push(neighborId);
        }
      }
    }

    const nodes: Incident[] = [];
    for (const id of visitedIncidentIds) {
      const inc = this.getIncidentById(id);
      if (inc) nodes.push(inc);
    }

    return { nodes, edges };
  }

  private mapRelationshipRow(r: any): IncidentRelationship {
    return {
      id: r.id,
      sourceIncidentId: r.source_incident_id,
      targetIncidentId: r.target_incident_id,
      relationshipType: r.relationship_type,
      similarityScore: r.similarity_score,
      status: r.status as any,
      sourceActionId: r.source_action_id || undefined,
      explanation: r.explanation || '',
      confirmedBy: r.confirmed_by || undefined,
      confirmedAt: r.confirmed_at || undefined,
      createdAt: r.created_at
    };
  }

  public getUserById(userId: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      department: row.department,
      isVip: Boolean(row.is_vip),
      createdAt: row.created_at
    };
  }

  public getDeviceById(deviceId: string): Device | null {
    const row = this.db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId) as any;
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      deviceType: row.device_type,
      os: row.os,
      serialNumber: row.serial_number,
      status: row.status,
      createdAt: row.created_at
    };
  }

  public getDashboardStats() {
    const all = this.getAllIncidents();
    const openIncidents = all.filter((inc) =>
      ['OPEN', 'TRIAGING', 'PENDING_USER_INPUT', 'IN_PROGRESS', 'REOPENED'].includes(inc.status)
    );
    const highCriticalIncidents = all.filter((inc) =>
      ['CRITICAL', 'P1_CRITICAL', 'HIGH', 'P2_HIGH'].includes(inc.priority.toUpperCase())
    );
    const recentlyResolvedIncidents = all
      .filter((inc) => inc.status === 'RESOLVED')
      .slice(0, 10);
    const escalatedIncidents = all.filter(
      (inc) => inc.status === 'ESCALATED' || (inc.escalationTier && inc.escalationTier !== 'NONE')
    );

    // Calculate real average resolution time
    const resolvedRows = this.db
      .prepare("SELECT created_at, resolved_at, updated_at FROM incidents WHERE status = 'RESOLVED'")
      .all() as any[];

    let avgResolutionTimeMinutes: number | null = null;
    if (resolvedRows.length > 0) {
      let totalMin = 0;
      resolvedRows.forEach((r) => {
        const start = new Date(r.created_at).getTime();
        const end = new Date(r.resolved_at || r.updated_at).getTime();
        const diff = Math.max(0, (end - start) / (1000 * 60));
        totalMin += diff;
      });
      avgResolutionTimeMinutes = Math.round(totalMin / resolvedRows.length);
    }

    // Dynamic recurring issue pattern detection
    const patternRows = this.db
      .prepare(`
        SELECT issue_type, category, COUNT(*) as count 
        FROM incidents 
        GROUP BY issue_type, category 
        HAVING COUNT(*) >= 1
        ORDER BY count DESC
      `)
      .all() as { issue_type: string; category: string; count: number }[];

    const recurringPatterns = patternRows.map((r) => ({
      issueType: r.issue_type,
      category: r.category,
      count: r.count
    }));

    // Relationship statistics
    const totalLinksRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM incident_relationships')
      .get() as any;
    const confirmedLinksRow = this.db
      .prepare("SELECT COUNT(*) as cnt FROM incident_relationships WHERE status = 'CONFIRMED'")
      .get() as any;
    const proposedLinksRow = this.db
      .prepare("SELECT COUNT(*) as cnt FROM incident_relationships WHERE status = 'PROPOSED'")
      .get() as any;

    return {
      totalIncidents: all.length,
      openCount: openIncidents.length,
      highCriticalCount: highCriticalIncidents.length,
      resolvedCount: recentlyResolvedIncidents.length,
      escalatedCount: escalatedIncidents.length,
      avgResolutionTimeMinutes,
      recurringPatterns,
      relationshipSummary: {
        totalLinks: totalLinksRow?.cnt || 0,
        confirmedCount: confirmedLinksRow?.cnt || 0,
        proposedCount: proposedLinksRow?.cnt || 0
      },
      openIncidents,
      highCriticalIncidents,
      recentlyResolvedIncidents,
      escalatedIncidents
    };
  }

  public recordRcaHumanDecision(
    incidentId: string,
    candidateId: string,
    decision: 'CONFIRMED' | 'REJECTED' | 'UNCERTAIN' | 'NONE',
    actorId: string = 'USER',
    notes?: string,
    aiConfidenceAtDecision: number = 0,
    evidenceSnapshot: any[] = []
  ) {
    const now = new Date().toISOString();
    const id = `rca_dec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const snapshotJson = JSON.stringify(evidenceSnapshot || []);
    
    const stmt = this.db.prepare(`
      INSERT INTO rca_human_decisions (id, incident_id, candidate_id, decision, actor_id, notes, ai_confidence_at_decision, evidence_snapshot_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, incidentId, candidateId, decision, actorId, notes || null, aiConfidenceAtDecision, snapshotJson, now);
    this.addEvent(incidentId, 'RCA_DECISION_RECORDED', `RCA candidate ${candidateId} marked as ${decision} by ${actorId}`, { candidateId, decision, actorId, notes, aiConfidenceAtDecision });
    return { id, incidentId, candidateId, decision, actorId, notes, aiConfidenceAtDecision, evidenceSnapshot, createdAt: now };
  }

  public getRcaHumanDecisions(incidentId: string): { id: string; incidentId: string; candidateId: string; decision: 'CONFIRMED' | 'REJECTED' | 'UNCERTAIN' | 'NONE'; actorId: string; notes?: string; aiConfidenceAtDecision: number; evidenceSnapshot: any[]; createdAt: string }[] {
    const rows = this.db.prepare('SELECT * FROM rca_human_decisions WHERE incident_id = ? ORDER BY created_at ASC').all(incidentId) as any[];
    return rows.map(r => ({
      id: r.id,
      incidentId: r.incident_id,
      candidateId: r.candidate_id,
      decision: r.decision,
      actorId: r.actor_id,
      notes: r.notes || undefined,
      aiConfidenceAtDecision: r.ai_confidence_at_decision || 0,
      evidenceSnapshot: JSON.parse(r.evidence_snapshot_json || '[]'),
      createdAt: r.created_at
    }));
  }

  public recordRcaVerification(
    incidentId: string,
    candidateId: string,
    verificationTarget: string,
    result: 'CONFIRMED' | 'DISPROVED' | 'INCONCLUSIVE',
    notes?: string,
    actorId: string = 'USER'
  ) {
    const now = new Date().toISOString();
    const id = `rca_verif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const stmt = this.db.prepare(`
      INSERT INTO rca_verifications (id, incident_id, candidate_id, verification_target, result, notes, actor_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, incidentId, candidateId, verificationTarget, result, notes || null, actorId, now);
    this.addEvent(incidentId, 'RCA_VERIFICATION_RECORDED', `RCA candidate ${candidateId} verification outcome: ${result}`, { candidateId, verificationTarget, result, actorId, notes });
    return { id, incidentId, candidateId, verificationTarget, result, notes, actorId, createdAt: now };
  }

  public getRcaVerifications(incidentId: string): { id: string; incidentId: string; candidateId: string; verificationTarget: string; result: 'CONFIRMED' | 'DISPROVED' | 'INCONCLUSIVE'; notes?: string; actorId: string; createdAt: string }[] {
    const rows = this.db.prepare('SELECT * FROM rca_verifications WHERE incident_id = ? ORDER BY created_at ASC').all(incidentId) as any[];
    return rows.map(r => ({
      id: r.id,
      incidentId: r.incident_id,
      candidateId: r.candidate_id,
      verificationTarget: r.verification_target,
      result: r.result,
      notes: r.notes || undefined,
      actorId: r.actor_id,
      createdAt: r.created_at
    }));
  }

  private mapIncidentRow(row: any): Incident {
    return {
      id: row.id,
      ticketNumber: row.ticket_number,
      userId: row.user_id,
      deviceId: row.device_id || undefined,
      category: row.category,
      issueType: row.issue_type,
      priority: row.priority,
      status: row.status,
      summary: row.summary,
      description: row.description,
      resolution: row.resolution || undefined,
      escalationTier: row.escalation_tier || undefined,
      missingInfo: JSON.parse(row.missing_info || '[]'),
      recommendedNextStep: row.recommended_next_step,
      reasoning: row.reasoning,
      confidenceScore: row.confidence_score,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

