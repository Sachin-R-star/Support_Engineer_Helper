import { IncidentRepository, IncidentTimeline } from '../database/repositories/incidentRepo';
import { 
  Incident, 
  IncidentAnswer, 
  IncidentAction, 
  IncidentRelationship, 
  RelationshipType, 
  RelationshipStatus, 
  EscalationTier,
  IncidentCategory,
  HistoricalIncidentEvidence,
  RelevantMemoryContext
} from '../models';

export class MemoryService {
  private repo = new IncidentRepository();

  /**
   * Retrieves a pruned, compact context object containing only RELEVANT past incident evidence.
   * Irrelevant past incidents (e.g. password reset/printer queue when diagnosing VPN) are filtered out.
   * All retrieved items are explicitly marked with `isHistorical: true`.
   */
  public getRelevantMemoryContext(
    userId: string,
    currentCategory?: IncidentCategory,
    currentIssueType?: string,
    deviceId?: string,
    currentInput?: string
  ): RelevantMemoryContext {
    const allIncidents = this.repo.getAllIncidents(userId);
    const inputTokens = new Set((currentInput || '').toLowerCase().split(/\s+/).filter(t => t.length > 3));

    const scoredIncidents: HistoricalIncidentEvidence[] = [];
    const now = Date.now();

    for (const inc of allIncidents) {
      let score = 0;
      const reasons: string[] = [];

      // Factor 1: Domain/Issue Match (Category, IssueType, or Token Overlap)
      let domainScore = 0;
      if (currentIssueType && inc.issueType.toLowerCase() === currentIssueType.toLowerCase()) {
        domainScore += 0.45;
        reasons.push(`Matching issue type (${inc.issueType})`);
      } else if (currentCategory && inc.category === currentCategory) {
        domainScore += 0.30;
        reasons.push(`Matching category (${inc.category})`);
      }

      if (inputTokens.size > 0) {
        const text = `${inc.summary} ${inc.description}`.toLowerCase();
        let overlap = 0;
        for (const token of inputTokens) {
          if (text.includes(token)) overlap++;
        }
        if (overlap > 0) {
          const textScore = Math.min(0.25, (overlap / inputTokens.size) * 0.5);
          domainScore += textScore;
          reasons.push('Natural language text similarity');
        }
      }

      // Factor 2: Device match
      let deviceScore = 0;
      if (deviceId && inc.deviceId === deviceId) {
        deviceScore = 0.20;
        reasons.push('Same registered device');
      }

      // Factor 3: Recent timing (< 72 hours)
      let timingScore = 0;
      const incTime = new Date(inc.createdAt).getTime();
      const diffHours = (now - incTime) / (1000 * 60 * 60);
      if (diffHours >= 0 && diffHours <= 72) {
        timingScore = 0.15;
        reasons.push(`Recent incident (${Math.round(diffHours)}h ago)`);
      }

      // If diagnosing a specific category/issue, require domain relevance > 0
      if (domainScore === 0 && (currentCategory || currentIssueType)) {
        score = 0;
      } else {
        score = domainScore + deviceScore + timingScore;
      }

      // Relevance threshold: EXCLUDE anything below 0.35
      if (score >= 0.35) {
        const actions = this.repo.getActionsForIncident(inc.id);
        const executedActions = actions.map(act => ({
          actionType: act.actionType,
          description: act.description,
          resultStatus: (act as any).resultStatus || 'PENDING',
          resultDetails: (act as any).resultDetails || undefined,
          timestamp: act.createdAt
        }));

        scoredIncidents.push({
          incidentId: inc.id,
          ticketNumber: inc.ticketNumber,
          category: inc.category,
          issueType: inc.issueType,
          summary: inc.summary,
          resolution: (inc as any).resolution || undefined,
          executedActions,
          isHistorical: true,
          relevanceScore: Number(score.toFixed(2)),
          relevanceReason: reasons.join('; ')
        });
      }
    }

    // Sort descending by relevance score and take top 3
    scoredIncidents.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const relevantIncidents = scoredIncidents.slice(0, 3);

    // Identify recent causal actions executed within past 24 hours
    let hasPrecedingCausalAction = false;
    let precedingCausalActionSummary: string | undefined;

    const recentExecutedActions: { incidentTicket: string; description: string; resultStatus: string; timestamp: string }[] = [];

    for (const rel of relevantIncidents) {
      for (const act of rel.executedActions) {
        const actTime = new Date(act.timestamp).getTime();
        const diffHours = (now - actTime) / (1000 * 60 * 60);

        recentExecutedActions.push({
          incidentTicket: rel.ticketNumber,
          description: act.description,
          resultStatus: act.resultStatus,
          timestamp: act.timestamp
        });

        if (diffHours <= 24 && /reset|flush|restart|reinstall|update|config|clear/i.test(act.description)) {
          hasPrecedingCausalAction = true;
          precedingCausalActionSummary = `Action '${act.description}' on ticket ${rel.ticketNumber} executed ${Math.round(diffHours)}h prior (${act.resultStatus})`;
        }
      }
    }

    // Build compact cautious prompt context string
    let promptLines = `[HISTORICAL CONTEXT - Past Support History for User ${userId}]`;
    if (relevantIncidents.length === 0) {
      promptLines += '\nNo relevant past support incidents found.';
    } else {
      for (const inc of relevantIncidents) {
        promptLines += `\n- Historical Ticket ${inc.ticketNumber} [Score: ${inc.relevanceScore}]: ${inc.summary} (Status: ${inc.resolution ? 'RESOLVED' : 'OPEN'})`;
        if (inc.resolution) {
          promptLines += ` | Resolution: ${inc.resolution}`;
        }
        if (inc.executedActions.length > 0) {
          const actionText = inc.executedActions.map(a => `${a.description} (${a.resultStatus})`).join(', ');
          promptLines += ` | Executed Actions: ${actionText}`;
        }
      }
    }
    if (hasPrecedingCausalAction && precedingCausalActionSummary) {
      promptLines += `\nNote: Preceding action detected -> ${precedingCausalActionSummary}. Check if current issue is a downstream effect.`;
    }

    return {
      userId,
      deviceId,
      relevantIncidents,
      recentExecutedActions,
      hasPrecedingCausalAction,
      precedingCausalActionSummary,
      cautiousPromptContext: promptLines
    };
  }

  /**
   * Creates a new structured incident in the database.
   */
  public createIncident(incidentData: Omit<Incident, 'createdAt' | 'updatedAt'> & { resolution?: string; escalationTier?: EscalationTier }): Incident {
    return this.repo.createIncident(incidentData);
  }

  /**
   * Appends an answered question to an incident.
   */
  public appendAnswer(answerData: Omit<IncidentAnswer, 'createdAt'> & { isUnsure?: boolean }): IncidentAnswer {
    return this.repo.appendAnswer(answerData);
  }

  /**
   * Appends a troubleshooting action to an incident.
   */
  public appendAction(actionData: Omit<IncidentAction, 'createdAt'> & { resultStatus?: string; resultDetails?: string }): IncidentAction {
    return this.repo.appendAction(actionData);
  }

  /**
   * Records the outcome of a executed troubleshooting action.
   */
  public recordActionResult(actionId: string, resultStatus: 'SUCCESS' | 'FAILURE' | 'PARTIAL', resultDetails: string): IncidentAction {
    return this.repo.recordActionResult(actionId, resultStatus, resultDetails);
  }

  /**
   * Marks an incident as RESOLVED with a resolution summary.
   */
  public resolveIncident(incidentId: string, resolution: string): Incident {
    return this.repo.resolveIncident(incidentId, resolution);
  }

  /**
   * Reopens a previously resolved incident with a reason.
   */
  public reopenIncident(incidentId: string, reason: string): Incident {
    return this.repo.reopenIncident(incidentId, reason);
  }

  /**
   * Retrieves the full chronological timeline and details of an incident.
   */
  public getIncidentTimeline(incidentId: string): IncidentTimeline {
    return this.repo.getIncidentTimeline(incidentId);
  }

  /**
   * Retrieves past incidents for a specific user to maintain contextual continuity.
   */
  public getUserIncidentHistory(userId: string): Incident[] {
    return this.repo.getAllIncidents(userId);
  }

  /**
   * Searches historical incidents and finds related incidents based on symptom/text overlap.
   */
  public findRelatedIncidents(
    userId: string,
    query: string,
    issueType: string
  ): { incident: Incident; similarityScore: number; relationshipType: RelationshipType }[] {
    const allIncidents = this.repo.getAllIncidents(); // fetch recent incidents
    const queryTokens = new Set(query.toLowerCase().split(/\s+/));

    const matches: { incident: Incident; similarityScore: number; relationshipType: RelationshipType }[] = [];

    for (const inc of allIncidents) {
      let score = 0;

      // Match 1: Same issue type
      if (inc.issueType.toLowerCase() === issueType.toLowerCase()) {
        score += 0.45;
      }

      // Match 2: Same user experiencing recurring fault
      if (inc.userId === userId) {
        score += 0.25;
      }

      // Match 3: Text token overlap in summary/description
      const targetTokens = `${inc.summary} ${inc.description}`.toLowerCase().split(/\s+/);
      let overlap = 0;
      for (const token of queryTokens) {
        if (token.length > 3 && targetTokens.includes(token)) {
          overlap++;
        }
      }
      if (queryTokens.size > 0) {
        score += Math.min(0.30, (overlap / queryTokens.size) * 0.5);
      }

      if (score >= 0.40) {
        const relType: RelationshipType = score >= 0.85 ? 'DUPLICATE' : 'RELATED';
        matches.push({
          incident: inc,
          similarityScore: Number(score.toFixed(2)),
          relationshipType: relType
        });
      }
    }

    // Sort by similarity descending
    matches.sort((a, b) => b.similarityScore - a.similarityScore);
    return matches.slice(0, 5); // top matches
  }

  /**
   * Links a new incident to a historical incident in the database.
   */
  public linkIncidents(
    sourceId: string,
    targetId: string,
    relationshipType: RelationshipType,
    similarityScore: number,
    status: RelationshipStatus = 'CONFIRMED',
    explanation: string = '',
    sourceActionId?: string
  ): IncidentRelationship {
    return this.repo.addRelationship({
      id: `rel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sourceIncidentId: sourceId,
      targetIncidentId: targetId,
      relationshipType,
      similarityScore,
      status,
      explanation,
      sourceActionId
    });
  }

  public confirmRelationship(relationshipId: string, confirmedBy: string = 'USER'): IncidentRelationship {
    return this.repo.updateRelationshipStatus(relationshipId, 'CONFIRMED', confirmedBy);
  }

  public rejectRelationship(relationshipId: string, confirmedBy: string = 'USER'): IncidentRelationship {
    return this.repo.updateRelationshipStatus(relationshipId, 'REJECTED', confirmedBy);
  }
}

