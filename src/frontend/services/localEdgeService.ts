import {
  TriageSession,
  CandidateIssue,
  TaxonomyQuestion,
  IncidentRecord,
  TimelineEvent,
  IncidentGraphPayload,
  IncidentDetailResponse,
  DashboardStats,
  IncidentCategory,
  AdaptiveStepPayload,
  HybridDecisionTrace,
  FinalTriageResult,
  IncidentPriority,
  RelationshipType
} from '../types/triage';
import rawKbData from '../../backend/data/knowledgeBase.json';

interface KbItem {
  id: string;
  category: string;
  subdomain: string;
  issue_type: string;
  display_name: string;
  description: string;
  keywords: string[];
  example_user_phrases?: string[];
  required_information?: string[];
  diagnostic_questions: {
    id: string;
    question_text: string;
    explanation?: string;
    options: { label: string; value: string; priority_signal?: string }[];
  }[];
  troubleshooting_steps: string[];
  priority_signals?: {
    p1_conditions?: string[];
    p2_conditions?: string[];
    p3_conditions?: string[];
    p4_conditions?: string[];
  };
  escalation_conditions?: string[];
  related_issue_types?: string[];
}

const kbData: KbItem[] = rawKbData as KbItem[];

const STORAGE_INCIDENTS_KEY = 'edge_mode_incidents_v1';

export class LocalEdgeService {
  private static sessions: Map<string, TriageSession> = new Map();

  private static getStoredIncidents(): IncidentRecord[] {
    try {
      const stored = localStorage.getItem(STORAGE_INCIDENTS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Ignore localStorage read issues
    }

    const defaultIncidents: IncidentRecord[] = [
      {
        id: 'inc_edge_101',
        ticketNumber: 'INC-2026-8801',
        userId: 'usr_exec_01',
        deviceId: 'dev_mac_01',
        category: 'NETWORK',
        issueType: 'VPN Gateway Timeout / Disconnect',
        priority: 'P2_HIGH',
        status: 'RESOLVED',
        summary: 'VPN connection fails after 2FA auth prompt',
        description: 'GlobalProtect VPN gateway timeout on US-East node. Cleared local DNS cache and refreshed auth certificates.',
        resolution: 'Cleared local DNS cache and updated regional gateway tokens.',
        escalationTier: 'NONE',
        missingInfo: [],
        recommendedNextStep: 'Clear DNS cache and flush GlobalProtect auth tokens via self-service script.',
        reasoning: 'Matched past resolution for GlobalProtect US-East regional gateway timeout.',
        confidenceScore: 95,
        createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
        updatedAt: new Date(Date.now() - 3600000 * 24).toISOString()
      },
      {
        id: 'inc_edge_102',
        ticketNumber: 'INC-2026-8802',
        userId: 'usr_eng_02',
        deviceId: 'dev_win_02',
        category: 'ACCOUNT',
        issueType: 'SSO Account Lockout / Password Reset',
        priority: 'P3_MEDIUM',
        status: 'RESOLVED',
        summary: 'Account locked out after password expiry',
        description: 'Active Directory lockout triggered by expired Windows corporate password.',
        resolution: 'Executive self-service portal unlock completed.',
        escalationTier: 'NONE',
        missingInfo: [],
        recommendedNextStep: 'Direct user to id.enterprise.com/reset self-service unlock portal.',
        reasoning: 'Standard account lockout resolved via automated AD credential refresh.',
        confidenceScore: 90,
        createdAt: new Date(Date.now() - 3600000 * 20).toISOString(),
        updatedAt: new Date(Date.now() - 3600000 * 18).toISOString()
      }
    ];

    try {
      localStorage.setItem(STORAGE_INCIDENTS_KEY, JSON.stringify(defaultIncidents));
    } catch {
      // Ignore
    }

    return defaultIncidents;
  }

  private static saveIncidents(incidents: IncidentRecord[]) {
    try {
      localStorage.setItem(STORAGE_INCIDENTS_KEY, JSON.stringify(incidents));
    } catch {
      // Ignore
    }
  }

  public static startTriage(userId: string, query: string, deviceId = 'dev_mac_01'): TriageSession {
    const sessionId = `edge_sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const qLower = query.toLowerCase();

    // Match candidates based on keywords and text similarity
    const candidatesWithScore = kbData.map(item => {
      let score = 20;

      // Category matching
      if (qLower.includes(item.category.toLowerCase())) score += 25;

      // Keyword matching
      for (const kw of item.keywords) {
        if (qLower.includes(kw.toLowerCase())) {
          score += 35;
        }
      }

      // Display name match
      if (qLower.includes(item.display_name.toLowerCase())) score += 40;

      // Example phrases match
      if (item.example_user_phrases) {
        for (const phrase of item.example_user_phrases) {
          if (qLower.includes(phrase.toLowerCase()) || phrase.toLowerCase().includes(qLower)) {
            score += 30;
          }
        }
      }

      // Special heuristics
      if ((qLower.includes('500') || qLower.includes('api') || qLower.includes('server') || qLower.includes('crash')) && item.category === 'APPLICATION') {
        score += 45;
      }
      if ((qLower.includes('slow') || qLower.includes('freeze') || qLower.includes('hang') || qLower.includes('bsod')) && item.category === 'DEVICE') {
        score += 40;
      }
      if ((qLower.includes('wifi') || qLower.includes('internet') || qLower.includes('vpn') || qLower.includes('gateway')) && item.category === 'NETWORK') {
        score += 40;
      }
      if ((qLower.includes('login') || qLower.includes('password') || qLower.includes('lockout') || qLower.includes('sso')) && item.category === 'ACCOUNT') {
        score += 45;
      }

      const boundedConfidence = Math.min(Math.max(score, 25), 95);
      return {
        item,
        confidence: boundedConfidence,
        matchReason: `Semantic keyword match for "${query}" against ${item.display_name} (${boundedConfidence}% confidence)`
      };
    }).sort((a, b) => b.confidence - a.confidence);

    const topCandidate = candidatesWithScore[0];
    const candidateIssues: CandidateIssue[] = candidatesWithScore.slice(0, 4).map(c => ({
      issueTypeId: c.item.id,
      issueTypeName: c.item.display_name,
      category: c.item.category as IncidentCategory,
      confidence: c.confidence,
      matchReason: c.matchReason
    }));

    // If confidence is solid, progress straight to first diagnostic question
    const isHighConfidence = topCandidate.confidence >= 35 && topCandidate.item.id !== 'kb_oth_general_99';
    const selectedItem = isHighConfidence ? topCandidate.item : null;

    let currentQuestion: TaxonomyQuestion | undefined;
    if (selectedItem && selectedItem.diagnostic_questions.length > 0) {
      const q = selectedItem.diagnostic_questions[0];
      currentQuestion = {
        id: q.id,
        question_text: q.question_text,
        explanation: q.explanation,
        options: [
          ...q.options.map(o => ({ label: o.label, value: o.value, priority_signal: o.priority_signal })),
          { label: "I don't know / Not sure", value: 'UNSURE' }
        ]
      };
    }

    const adaptiveStep: AdaptiveStepPayload | undefined = currentQuestion ? {
      selectedStepId: currentQuestion.id,
      type: 'QUESTION',
      title: currentQuestion.question_text,
      question: currentQuestion,
      score: 85,
      rationale: `Adaptive diagnostic question selected to isolate root cause for ${selectedItem?.display_name}.`,
      hypothesesDistinguished: [selectedItem?.display_name || 'General IT Issue'],
      evidenceUsed: [`Initial query: "${query}"`],
      alternativesConsidered: [
        { id: 'alt_1', title: 'Alternative symptom verification', score: 65, type: 'QUESTION' }
      ],
      scoringBreakdown: {
        hypothesisDiscrimination: 40,
        relevance: 35,
        safetyBonus: 20,
        userEffortPenalty: 10,
        repetitionPenalty: 0,
        prerequisitePenalty: 0,
        finalScore: 85
      },
      confidenceBand: 'HIGH'
    } : undefined;

    const decisionTrace: HybridDecisionTrace = {
      sessionId,
      timestamp: new Date().toISOString(),
      retrievedKbCandidateIds: candidateIssues.map(c => c.issueTypeId),
      aiSelectedCandidateId: topCandidate.item.id,
      aiInterpretation: `Matched candidate "${topCandidate.item.display_name}" (${topCandidate.item.id}) via edge heuristic model.`,
      extractedFacts: [`User query: "${query}"`, `userId: ${userId}`, `deviceId: ${deviceId}`],
      deterministicRulesApplied: ['Edge Rule: Non-dead-ending progressive taxonomy traversal active.'],
      groundingValidationPassed: true,
      groundingViolations: [],
      finalDecisionCandidateId: topCandidate.item.id,
      confidenceBand: isHighConfidence ? 'HIGH' : 'LOW',
      fallbackTriggered: !isHighConfidence,
      decisionBreakdown: {
        deterministicEvidence: candidateIssues.map(c => `[KB Candidate] ${c.issueTypeName} (${c.issueTypeId}) - ${c.confidence}% match`),
        aiContribution: `Edge Decision Engine processed query with ${topCandidate.confidence}% confidence.`,
        ruleOverrides: ['No critical overrides triggered.'],
        finalDecision: `Selected candidate ${topCandidate.item.display_name}`
      }
    };

    const session: TriageSession = {
      sessionId,
      userId,
      deviceId,
      currentStep: isHighConfidence ? 'PROGRESSIVE_QUESTION' : 'AMBIGUITY_SELECTION',
      originalInput: query,
      candidateIssues,
      selectedIssue: selectedItem ? {
        id: selectedItem.id,
        display_name: selectedItem.display_name,
        category: selectedItem.category as IncidentCategory,
        issue_type: selectedItem.issue_type
      } : undefined,
      answers: {},
      questionHistory: currentQuestion ? [currentQuestion.id] : [],
      currentQuestion,
      confidence: topCandidate.confidence,
      decisionTrace,
      adaptiveStep,
      recoveryPayload: !isHighConfidence ? {
        isRecoveryActive: true,
        reasonCode: 'LOW_CONFIDENCE',
        userMessage: 'We matched your query to multiple potential domains. Please select the most relevant scenario below.',
        broaderCategories: [
          { category: 'APPLICATION', label: 'Applications & Software', description: 'API, Cloud Services, CRM, or app crashes' },
          { category: 'NETWORK', label: 'Network & Connectivity', description: 'Wi-Fi, VPN, Internet access, or gateways' },
          { category: 'ACCOUNT', label: 'Account & Password', description: 'SSO login, MFA, or identity access' },
          { category: 'DEVICE', label: 'Computer & Hardware', description: 'Laptop battery, BSOD, or system freezes' },
          { category: 'OTHER', label: 'General / Something Else', description: 'General IT assistance' }
        ],
        suggestedOptions: [
          { id: 'opt_1', label: 'Select Category', description: 'Choose closest IT category', actionType: 'SELECT_CATEGORY' },
          { id: 'opt_2', label: 'Describe in Own Words', description: 'Refine error description', actionType: 'FREE_TEXT' }
        ],
        allowFreeTextRefinement: true,
        recommendedHumanEscalation: false
      } : undefined
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  public static selectCandidate(sessionId: string, issueTypeId: string): TriageSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found in Edge store');

    const item = kbData.find(k => k.id === issueTypeId) || kbData[0];
    session.selectedIssue = {
      id: item.id,
      display_name: item.display_name,
      category: item.category as IncidentCategory,
      issue_type: item.issue_type
    };

    session.currentStep = 'PROGRESSIVE_QUESTION';
    if (item.diagnostic_questions.length > 0) {
      const q = item.diagnostic_questions[0];
      session.currentQuestion = {
        id: q.id,
        question_text: q.question_text,
        explanation: q.explanation,
        options: [
          ...q.options.map(o => ({ label: o.label, value: o.value, priority_signal: o.priority_signal })),
          { label: "I don't know / Not sure", value: 'UNSURE' }
        ]
      };
      session.questionHistory = [q.id];
      session.adaptiveStep = {
        selectedStepId: q.id,
        type: 'QUESTION',
        title: q.question_text,
        question: session.currentQuestion,
        score: 85,
        rationale: `Selected diagnostic question for ${item.display_name}.`,
        hypothesesDistinguished: [item.display_name],
        evidenceUsed: [`User chosen category: ${item.display_name}`],
        alternativesConsidered: [
          { id: 'alt_1', title: 'Alternative symptom verification', score: 65, type: 'QUESTION' }
        ],
        scoringBreakdown: { hypothesisDiscrimination: 40, relevance: 35, safetyBonus: 20, userEffortPenalty: 10, repetitionPenalty: 0, prerequisitePenalty: 0, finalScore: 85 },
        confidenceBand: 'HIGH'
      };
    }

    this.sessions.set(sessionId, session);
    return session;
  }

  public static answerQuestion(
    sessionId: string,
    questionId: string,
    answerValue: string,
    isUnsure = false
  ): TriageSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found in Edge store');

    const currentQText = session.currentQuestion?.question_text || questionId;
    session.answers[questionId] = {
      questionId,
      questionText: currentQText,
      answerValue,
      isUnsure,
      timestamp: new Date().toISOString()
    };

    const item = kbData.find(k => k.id === session.selectedIssue?.id) || kbData[0];
    const currentIndex = item.diagnostic_questions.findIndex(q => q.id === questionId);
    const nextQuestion = item.diagnostic_questions[currentIndex + 1];

    if (nextQuestion && currentIndex < 2) {
      session.currentQuestion = {
        id: nextQuestion.id,
        question_text: nextQuestion.question_text,
        explanation: nextQuestion.explanation,
        options: [
          ...nextQuestion.options.map(o => ({ label: o.label, value: o.value, priority_signal: o.priority_signal })),
          { label: "I don't know / Not sure", value: 'UNSURE' }
        ]
      };
      session.questionHistory.push(nextQuestion.id);
      session.adaptiveStep = {
        selectedStepId: nextQuestion.id,
        type: 'QUESTION',
        title: nextQuestion.question_text,
        question: session.currentQuestion,
        score: 90,
        rationale: `Follow-up diagnostic question to narrow down specific sub-type.`,
        hypothesesDistinguished: [item.display_name],
        evidenceUsed: Object.values(session.answers).map(a => `${a.questionText}: ${a.answerValue}`),
        alternativesConsidered: [
          { id: 'alt_2', title: 'Secondary diagnostic check', score: 70, type: 'QUESTION' }
        ],
        scoringBreakdown: { hypothesisDiscrimination: 45, relevance: 35, safetyBonus: 20, userEffortPenalty: 10, repetitionPenalty: 0, prerequisitePenalty: 0, finalScore: 90 },
        confidenceBand: 'HIGH'
      };
    } else {
      // Finalize Triage Session!
      this.finalizeSession(session, item);
    }

    this.sessions.set(sessionId, session);
    return session;
  }

  private static finalizeSession(session: TriageSession, item: KbItem) {
    session.currentStep = 'TRIAGE_COMPLETE';
    session.currentQuestion = undefined;

    // Calculate priority
    let priority: IncidentPriority = 'P3_MEDIUM';
    const isVip = session.userId.includes('exec') || session.userId.includes('vip');
    const answersList = Object.values(session.answers);
    const hasCriticalAnswer = answersList.some(a => a.answerValue.includes('exposed') || a.answerValue.includes('p1') || a.answerValue.includes('outage'));

    if (isVip || hasCriticalAnswer) {
      priority = 'P1_CRITICAL';
    } else if (item.category === 'NETWORK' || item.category === 'ACCOUNT') {
      priority = 'P2_HIGH';
    }

    const recAction = item.troubleshooting_steps[0] || 'Escalate to Tier 2 IT Infrastructure Support.';
    const finalConfidence = Math.min(Math.max(session.confidence + (answersList.length * 15), 65), 98);

    const ticketNumber = `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const newIncident: IncidentRecord = {
      id: `inc_${Date.now()}`,
      ticketNumber,
      userId: session.userId,
      deviceId: session.deviceId,
      category: item.category as IncidentCategory,
      issueType: item.display_name,
      priority,
      status: 'OPEN',
      summary: session.originalInput,
      description: `Automated progressive triage completed for user ${session.userId}. Diagnosis: ${item.display_name}.`,
      missingInfo: [],
      recommendedNextStep: recAction,
      reasoning: `Classified as ${item.display_name} under ${item.category} with ${finalConfidence}% diagnostic confidence.`,
      confidenceScore: finalConfidence,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const stored = this.getStoredIncidents();
    stored.unshift(newIncident);
    this.saveIncidents(stored);

    const finalResult: FinalTriageResult = {
      ticketNumber,
      category: item.category as IncidentCategory,
      issueType: item.display_name,
      priority,
      missingInformation: [],
      recommendedNextStep: recAction,
      reasoning: `Root cause identified as ${item.display_name}. Validated via progressive answers. Priority: ${priority}.`,
      confidence: finalConfidence,
      recommendation: {
        action: recAction,
        reason: 'Automated diagnostic validation matched verified enterprise playbook.',
        expected_result: 'Restores standard system operability and connectivity.',
        fallback_action: 'Escalate to Tier 2 Support with full session audit trace.',
        escalation: {
          recommended: priority === 'P1_CRITICAL',
          tier: priority === 'P1_CRITICAL' ? 'TIER_2' : 'NONE',
          reason: priority === 'P1_CRITICAL' ? 'Executive VIP SLA policy trigger' : 'Standard resolution flow'
        },
        confidence: finalConfidence
      },
      linkedIncidents: [
        {
          incidentId: 'inc_edge_101',
          ticketNumber: 'INC-2026-8801',
          relationshipType: 'OCCURRED_AFTER',
          similarityScore: 0.88
        }
      ]
    };

    session.finalTriageResult = finalResult;
    session.confidence = finalConfidence;
  }

  public static goBack(sessionId: string): TriageSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found in Edge store');

    if (session.currentStep === 'PROGRESSIVE_QUESTION') {
      session.currentStep = 'AMBIGUITY_SELECTION';
      session.currentQuestion = undefined;
    }

    this.sessions.set(sessionId, session);
    return session;
  }

  public static fetchIncidents(userId?: string): IncidentRecord[] {
    const list = this.getStoredIncidents();
    if (userId) {
      return list.filter(i => i.userId === userId);
    }
    return list;
  }

  public static fetchIncidentDetails(id: string): IncidentDetailResponse {
    const incidents = this.getStoredIncidents();
    const inc = incidents.find(i => i.id === id || i.ticketNumber === id) || incidents[0];

    return {
      success: true,
      incident: inc,
      user: {
        id: inc.userId,
        name: inc.userId.includes('exec') ? 'Alex Morgan (VIP)' : 'Sam Lee',
        email: inc.userId.includes('exec') ? 'alex.morgan@enterprise.com' : 'sam.lee@enterprise.com',
        role: 'VIP_USER',
        department: 'Executive Office',
        isVip: inc.userId.includes('exec')
      },
      device: {
        id: inc.deviceId || 'dev_mac_01',
        name: 'Alex-MacBookPro16',
        deviceType: 'LAPTOP',
        os: 'macOS Sequoia 15.1',
        serialNumber: 'C02FX911MD6R',
        status: 'ACTIVE'
      },
      answers: [],
      actions: [
        {
          id: 'act_1',
          incidentId: inc.id,
          actionType: 'DIAGNOSTIC_VERIFY',
          description: inc.recommendedNextStep,
          performer: 'SYSTEM',
          resultStatus: 'SUCCESS',
          createdAt: inc.createdAt
        }
      ],
      relationships: [
        {
          id: 'rel_1',
          sourceIncidentId: inc.id,
          targetIncidentId: 'inc_edge_101',
          relationshipType: 'RELATED_TO',
          similarityScore: 0.89,
          status: 'CONFIRMED',
          explanation: 'Identical network stack gateway signature match.',
          createdAt: inc.createdAt
        }
      ]
    };
  }

  public static fetchDashboardStats(): DashboardStats {
    const incidents = this.getStoredIncidents();
    const openIncidents = incidents.filter(i => i.status === 'OPEN');
    const resolvedIncidents = incidents.filter(i => i.status === 'RESOLVED');
    const highCriticalIncidents = incidents.filter(
      i => i.priority === 'P1_CRITICAL' || i.priority === 'P2_HIGH' || i.priority === 'CRITICAL' || i.priority === 'HIGH'
    );

    return {
      totalIncidents: incidents.length,
      openCount: openIncidents.length,
      highCriticalCount: highCriticalIncidents.length,
      resolvedCount: resolvedIncidents.length,
      escalatedCount: 0,
      avgResolutionTimeMinutes: 14.2,
      recurringPatterns: [
        { issueType: 'VPN Gateway Timeout / Disconnect', category: 'NETWORK', count: 2 },
        { issueType: 'SSO Account Lockout', category: 'ACCOUNT', count: 1 }
      ],
      relationshipSummary: {
        totalLinks: 2,
        confirmedCount: 2,
        proposedCount: 0
      },
      openIncidents,
      highCriticalIncidents,
      recentlyResolvedIncidents: resolvedIncidents.slice(0, 5),
      escalatedIncidents: []
    };
  }

  public static fetchIncidentTimeline(id: string): TimelineEvent[] {
    const incidents = this.getStoredIncidents();
    const inc = incidents.find(i => i.id === id || i.ticketNumber === id) || incidents[0];

    return [
      {
        id: 'ev_1',
        incidentId: inc.id,
        eventType: 'TRIAGE_STARTED',
        description: `User reported issue: "${inc.summary}"`,
        actor: 'USER',
        createdAt: inc.createdAt
      },
      {
        id: 'ev_2',
        incidentId: inc.id,
        eventType: 'DIAGNOSTIC_COMPLETED',
        description: `Automated progressive diagnosis completed with ${inc.confidenceScore}% confidence.`,
        actor: 'SYSTEM',
        createdAt: inc.createdAt
      },
      {
        id: 'ev_3',
        incidentId: inc.id,
        eventType: 'ACTION_RECOMMENDED',
        description: `Recommended action: ${inc.recommendedNextStep}`,
        actor: 'AI_DIAGNOSTIC_ENGINE',
        createdAt: inc.updatedAt || inc.createdAt
      }
    ];
  }

  public static fetchIncidentGraph(id: string): IncidentGraphPayload {
    const incidents = this.getStoredIncidents();
    const current = incidents.find(i => i.id === id || i.ticketNumber === id) || incidents[0];

    return {
      nodes: [
        {
          id: current.id,
          ticketNumber: current.ticketNumber,
          category: current.category,
          issueType: current.issueType,
          priority: current.priority,
          status: current.status,
          summary: current.summary
        },
        {
          id: 'inc_edge_101',
          ticketNumber: 'INC-2026-8801',
          category: 'NETWORK',
          issueType: 'VPN Gateway Timeout / Disconnect',
          priority: 'P2_HIGH',
          status: 'RESOLVED',
          summary: 'VPN Gateway Timeout / Disconnect'
        }
      ],
      edges: [
        {
          id: 'edge_1',
          source: current.id,
          target: 'inc_edge_101',
          relationshipType: 'RELATED_TO',
          status: 'CONFIRMED',
          similarityScore: 0.89,
          explanation: 'Identical network stack signature match.'
        }
      ]
    };
  }

  public static fetchIncidentChain(id: string): IncidentRecord[] {
    return this.getStoredIncidents().slice(0, 3);
  }

  public static reopenIncident(id: string, reason: string): IncidentRecord {
    const list = this.getStoredIncidents();
    const found = list.find(i => i.id === id || i.ticketNumber === id);
    if (found) {
      found.status = 'OPEN';
      found.updatedAt = new Date().toISOString();
      this.saveIncidents(list);
      return found;
    }
    throw new Error('Incident not found');
  }

  public static resolveIncident(id: string, resolution: string): IncidentRecord {
    const list = this.getStoredIncidents();
    const found = list.find(i => i.id === id || i.ticketNumber === id);
    if (found) {
      found.status = 'RESOLVED';
      found.resolution = resolution;
      found.updatedAt = new Date().toISOString();
      this.saveIncidents(list);
      return found;
    }
    throw new Error('Incident not found');
  }

  public static confirmRelationship(relId: string): any {
    return { id: relId, status: 'CONFIRMED' };
  }

  public static rejectRelationship(relId: string): any {
    return { id: relId, status: 'REJECTED' };
  }

  public static linkIncidents(sourceId: string, targetId: string, relationshipType: string): any {
    const relType = (relationshipType as RelationshipType) || 'RELATED_TO';
    return { id: `rel_${Date.now()}`, sourceIncidentId: sourceId, targetIncidentId: targetId, relationshipType: relType, status: 'CONFIRMED' };
  }

  public static appendAction(incidentId: string, actionType: string, description: string): any {
    return { id: `act_${Date.now()}`, incidentId, actionType, description, performer: 'USER', resultStatus: 'PENDING', createdAt: new Date().toISOString() };
  }

  public static recordActionResult(incidentId: string, actionId: string, resultStatus: string, resultDetails: string): any {
    return { id: actionId, incidentId, resultStatus, resultDetails, updatedAt: new Date().toISOString() };
  }

  public static verifyActionResult(incidentId: string, actionDescription: string, resultStatus: string, userNotes?: string): any {
    const list = this.getStoredIncidents();
    const found = list.find(i => i.id === incidentId || i.ticketNumber === incidentId);
    if (found && resultStatus === 'YES_RESOLVED') {
      found.status = 'RESOLVED';
      found.resolution = actionDescription;
      this.saveIncidents(list);
    }
    return { success: true, incidentId, status: found?.status || 'OPEN', resultStatus, userNotes };
  }

  public static fetchRca(incidentId: string): any {
    const incidents = this.getStoredIncidents();
    const inc = incidents.find(i => i.id === incidentId || i.ticketNumber === incidentId) || incidents[0];

    return {
      incidentId: inc.id,
      ticketNumber: inc.ticketNumber,
      category: inc.category,
      issueType: inc.issueType,
      confidenceScore: inc.confidenceScore,
      currentDiagnosis: inc.issueType,
      possibleRootCauses: [
        {
          candidate_id: 'rca_hyp_1',
          title: `${inc.issueType} Configuration Mismatch`,
          description: `Diagnostic signatures indicate localized protocol timeout and session token invalidation.`,
          confidence: inc.confidenceScore,
          supporting_evidence: [
            { id: 'ev_1', description: 'User input reported active disruption', source: 'user_triage', confidence: 95 }
          ],
          contradicting_evidence: [],
          missing_evidence: [],
          source: 'knowledge_base',
          governance_state: 'UNDER_REVIEW',
          human_decision: 'NONE'
        }
      ],
      rejectedCandidates: [],
      generatedAt: new Date().toISOString()
    };
  }

  public static recordRcaDecision(incidentId: string, candidateId: string, decision: string, notes?: string): any {
    return { success: true, incidentId, candidateId, decision, notes };
  }

  public static verifyRcaHypothesis(incidentId: string, candidateId: string, result: string, notes?: string): any {
    return { success: true, incidentId, candidateId, result, notes };
  }

  public static searchIssues(query: string): any[] {
    const q = query.toLowerCase();
    return kbData
      .filter(k => k.display_name.toLowerCase().includes(q) || k.keywords.some(kw => kw.toLowerCase().includes(q)))
      .map(k => ({
        issueTypeId: k.id,
        issueTypeName: k.display_name,
        category: k.category,
        confidence: 85
      }));
  }
}
