import { IncidentRepository } from '../database/repositories/incidentRepo';
import { Incident, IncidentRelationship, RelationshipType, RelationshipStatus } from '../models';

export interface SuggestedRelationship {
  relationshipId: string;
  sourceIncidentId: string;
  targetIncidentId: string;
  relationshipType: RelationshipType;
  confidenceScore: number;
  status: RelationshipStatus;
  sourceActionId?: string;
  explanation: string;
  cautiousReasoning: string;
}

export class IncidentGraphService {
  private repo = new IncidentRepository();

  /**
   * Analyzes a newly created or updated incident against historical user/device incidents 
   * to detect potential relationships, follow-ups, or causal links.
   * NEVER claims absolute causation as fact without explicit evidence; uses cautious language.
   */
  public detectPotentialRelationships(newIncident: Incident): SuggestedRelationship[] {
    const historicalIncidents = this.repo.getAllIncidents(newIncident.userId)
      .filter(inc => inc.id !== newIncident.id);

    const suggestions: SuggestedRelationship[] = [];
    const newCreatedTime = new Date(newIncident.createdAt).getTime();

    for (const pastInc of historicalIncidents) {
      const pastCreatedTime = new Date(pastInc.createdAt).getTime();
      const pastUpdatedTime = new Date(pastInc.updatedAt).getTime();
      const diffHours = (newCreatedTime - pastUpdatedTime) / (1000 * 60 * 60);

      // We only consider past incidents created/updated before or slightly around newIncident
      if (diffHours < -1) continue; // Skip future incidents

      const pastActions = this.repo.getActionsForIncident(pastInc.id);

      // Check Causal Actions (Network Reset, Spooler Restart, Driver Install, Password Change, Config Update)
      let causalActionMatch = pastActions.find(act => 
        /reset|flush|restart|reinstall|update|config|reboot|clear|change|password|modify|switch|install/i.test(act.description)
      );

      // Scenario A: Possible Causal Relationship (e.g., Network reset -> VPN disconnect, Password change -> Outlook re-prompt)
      if (
        (pastInc.category === 'NETWORK' && newIncident.category === 'NETWORK') ||
        (pastInc.category === 'NETWORK' && newIncident.issueType.includes('vpn')) ||
        (pastInc.category === 'ACCOUNT' && newIncident.category === 'APPLICATION') ||
        (pastInc.category === 'ACCOUNT' && newIncident.category === 'ACCOUNT') ||
        (pastInc.category === 'DEVICE' && newIncident.category === 'APPLICATION')
      ) {
        if (causalActionMatch && Math.abs(diffHours) <= 24) {
          const relId = `rel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const explanation = `New issue '${newIncident.summary}' occurred shortly after troubleshooting action '${causalActionMatch.description}' on incident ${pastInc.ticketNumber}.`;
          
          suggestions.push({
            relationshipId: relId,
            sourceIncidentId: newIncident.id,
            targetIncidentId: pastInc.id,
            relationshipType: 'POSSIBLY_CAUSED_BY',
            confidenceScore: 0.75,
            status: 'PROPOSED',
            sourceActionId: causalActionMatch.id,
            explanation,
            cautiousReasoning: `Possibly caused by previous troubleshooting action on ${pastInc.ticketNumber}. Re-check configuration before confirming.`
          });
          continue;
        }
      }

      // Scenario B: Follow-up or Reopened (Same issue type or explicit follow-up within 48h)
      if (pastInc.issueType === newIncident.issueType && Math.abs(diffHours) <= 48) {
        const relId = `rel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const isResolved = pastInc.status === 'RESOLVED';
        const relType: RelationshipType = isResolved ? 'REOPENED_FROM' : 'FOLLOW_UP_TO';
        
        suggestions.push({
          relationshipId: relId,
          sourceIncidentId: newIncident.id,
          targetIncidentId: pastInc.id,
          relationshipType: relType,
          confidenceScore: 0.85,
          status: 'PROPOSED',
          explanation: `New issue matches recurring pattern of past incident ${pastInc.ticketNumber}.`,
          cautiousReasoning: `Possibly related recurring issue or follow-up to ticket ${pastInc.ticketNumber}.`
        });
        continue;
      }

      // Scenario C: Same Device & Category (General Related)
      if (pastInc.deviceId && pastInc.deviceId === newIncident.deviceId && Math.abs(diffHours) <= 72) {
        const relId = `rel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        suggestions.push({
          relationshipId: relId,
          sourceIncidentId: newIncident.id,
          targetIncidentId: pastInc.id,
          relationshipType: 'RELATED_TO',
          confidenceScore: 0.60,
          status: 'PROPOSED',
          explanation: `Both incidents occurred on the same registered device (${pastInc.deviceId}).`,
          cautiousReasoning: `Possibly related device fault or environment change.`
        });
      }
    }

    return suggestions;
  }

  /**
   * Persists a suggested or manually created relationship with status 'PROPOSED' or 'CONFIRMED'.
   */
  public linkIncidents(
    sourceIncidentId: string,
    targetIncidentId: string,
    relationshipType: RelationshipType,
    similarityScore: number,
    status: RelationshipStatus = 'CONFIRMED',
    explanation: string = '',
    sourceActionId?: string
  ): IncidentRelationship {
    const id = `rel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    return this.repo.addRelationship({
      id,
      sourceIncidentId,
      targetIncidentId,
      relationshipType,
      similarityScore,
      status,
      sourceActionId,
      explanation
    });
  }

  /**
   * Confirms a proposed relationship (User or Support Agent validation).
   */
  public confirmRelationship(relationshipId: string, actorId: string = 'USER'): IncidentRelationship {
    return this.repo.updateRelationshipStatus(relationshipId, 'CONFIRMED', actorId);
  }

  /**
   * Rejects a proposed relationship (User or Support Agent explicit rejection).
   */
  public rejectRelationship(relationshipId: string, actorId: string = 'USER'): IncidentRelationship {
    return this.repo.updateRelationshipStatus(relationshipId, 'REJECTED', actorId);
  }

  /**
   * Retrieves the full active graph (nodes and non-rejected edges) connected to an incident.
   */
  public getIncidentGraph(incidentId: string): { nodes: Incident[]; edges: IncidentRelationship[] } {
    return this.repo.getIncidentGraph(incidentId);
  }

  /**
   * Retrieves chronological sequence of linked incidents forming an issue chain.
   */
  public getIncidentChain(incidentId: string): Incident[] {
    const graph = this.getIncidentGraph(incidentId);
    // Sort nodes chronologically by created_at
    return graph.nodes.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
}
