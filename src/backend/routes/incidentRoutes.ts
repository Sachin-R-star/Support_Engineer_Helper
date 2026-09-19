import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { IncidentRepository } from '../database/repositories/incidentRepo';
import { MemoryService } from '../services/memoryService';
import { IncidentGraphService } from '../services/incidentGraphService';
import { TriageService } from '../services/triageService';
import { RcaEngine } from '../services/rcaEngine';

const router = Router();
const repo = new IncidentRepository();
const memoryService = new MemoryService();
const graphService = new IncidentGraphService();
const triageService = new TriageService();

const CreateIncidentSchema = z.object({
  id: z.string().min(1),
  ticketNumber: z.string().min(1),
  userId: z.string().min(1),
  deviceId: z.string().optional(),
  category: z.enum(['NETWORK', 'ACCOUNT', 'APPLICATION', 'DEVICE', 'OTHER']),
  issueType: z.string().min(1),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'REOPENED', 'ESCALATED']).optional(),
  summary: z.string().min(1),
  description: z.string().min(1),
  resolution: z.string().optional(),
  escalationTier: z.enum(['NONE', 'TIER_1', 'TIER_2', 'TIER_3', 'VENDOR']).optional(),
  missingInfo: z.array(z.string()).default([]),
  recommendedNextStep: z.string().min(1),
  reasoning: z.string().min(1),
  confidenceScore: z.number().min(0).max(1)
});

const AppendAnswerSchema = z.object({
  id: z.string().optional(),
  questionId: z.string().min(1),
  questionText: z.string().min(1),
  answerValue: z.string().min(1),
  isUnsure: z.boolean().optional()
});

const AppendActionSchema = z.object({
  id: z.string().optional(),
  actionType: z.string().min(1),
  description: z.string().min(1),
  resultStatus: z.enum(['PENDING', 'SUCCESS', 'FAILURE', 'PARTIAL']).optional(),
  resultDetails: z.string().optional(),
  performer: z.enum(['USER', 'AGENT', 'SYSTEM'])
});

const RecordResultSchema = z.object({
  resultStatus: z.enum(['SUCCESS', 'FAILURE', 'PARTIAL']),
  resultDetails: z.string().min(1)
});

const ResolveIncidentSchema = z.object({
  resolution: z.string().min(1, 'Resolution details required')
});

const ReopenIncidentSchema = z.object({
  reason: z.string().min(1, 'Reopen reason required')
});

const LinkIncidentSchema = z.object({
  targetIncidentId: z.string().min(1, 'Target Incident ID required'),
  relationshipType: z.enum([
    'RELATED_TO', 'FOLLOW_UP_TO', 'OCCURRED_AFTER', 
    'POSSIBLY_CAUSED_BY', 'REOPENED_FROM', 'RESOLVED_BY', 
    'DUPLICATE', 'RELATED', 'PARENT', 'CHILD'
  ]),
  similarityScore: z.number().min(0).max(1),
  status: z.enum(['PROPOSED', 'CONFIRMED', 'REJECTED']).optional(),
  explanation: z.string().optional(),
  sourceActionId: z.string().optional()
});

const ConfirmRejectSchema = z.object({
  actorId: z.string().optional().default('USER')
});

// GET /api/incidents/dashboard/stats
router.get('/dashboard/stats', (req: Request, res: Response) => {
  try {
    const stats = repo.getDashboardStats();
    return res.status(200).json({ success: true, stats });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || error });
  }
});

// GET /api/incidents
router.get('/', (req: Request, res: Response) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  const incidents = repo.getAllIncidents(userId);
  return res.status(200).json({ success: true, count: incidents.length, incidents });
});

// GET /api/incidents/relevant
router.get('/relevant', (req: Request, res: Response) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
  const query = typeof req.query.query === 'string' ? req.query.query : '';
  const issueType = typeof req.query.issueType === 'string' ? req.query.issueType : '';

  const results = memoryService.findRelatedIncidents(userId, query, issueType);
  return res.status(200).json({ success: true, matches: results });
});

// POST /api/incidents
router.post('/', (req: Request, res: Response) => {
  try {
    const data = CreateIncidentSchema.parse(req.body);
    const incident = memoryService.createIncident({
      ...data,
      status: data.status || 'OPEN'
    });
    return res.status(201).json({ success: true, incident });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

// GET /api/incidents/:id
router.get('/:id', (req: Request, res: Response) => {
  const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const incident = repo.getIncidentById(incidentId);
  if (!incident) {
    return res.status(404).json({ success: false, error: 'Incident not found' });
  }

  const answers = repo.getAnswersForIncident(incident.id);
  const actions = repo.getActionsForIncident(incident.id);
  const relationships = repo.getRelationshipsForIncident(incident.id);
  const user = repo.getUserById(incident.userId);
  const device = incident.deviceId ? repo.getDeviceById(incident.deviceId) : null;

  return res.status(200).json({
    success: true,
    incident,
    user,
    device,
    answers,
    actions,
    relationships
  });
});

// GET /api/incidents/:id/timeline
router.get('/:id/timeline', (req: Request, res: Response) => {
  try {
    const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const timeline = memoryService.getIncidentTimeline(incidentId);
    return res.status(200).json({ success: true, timeline });
  } catch (error: any) {
    return res.status(404).json({ success: false, error: error.message || error });
  }
});

// GET /api/incidents/:id/graph
router.get('/:id/graph', (req: Request, res: Response) => {
  try {
    const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const graph = graphService.getIncidentGraph(incidentId);
    return res.status(200).json({ success: true, graph });
  } catch (error: any) {
    return res.status(404).json({ success: false, error: error.message || error });
  }
});

// GET /api/incidents/:id/chain
router.get('/:id/chain', (req: Request, res: Response) => {
  try {
    const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const chain = graphService.getIncidentChain(incidentId);
    return res.status(200).json({ success: true, chain });
  } catch (error: any) {
    return res.status(404).json({ success: false, error: error.message || error });
  }
});

// POST /api/incidents/:id/relationships/suggest
router.post('/:id/relationships/suggest', (req: Request, res: Response) => {
  try {
    const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const incident = repo.getIncidentById(incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found`);

    const suggestions = graphService.detectPotentialRelationships(incident);
    return res.status(200).json({ success: true, suggestions });
  } catch (error: any) {
    return res.status(404).json({ success: false, error: error.message || error });
  }
});

// POST /api/incidents/relationships/:relationshipId/confirm
router.post('/relationships/:relationshipId/confirm', (req: Request, res: Response) => {
  try {
    const relId = Array.isArray(req.params.relationshipId) ? req.params.relationshipId[0] : req.params.relationshipId;
    const body = ConfirmRejectSchema.parse(req.body || {});
    const rel = graphService.confirmRelationship(relId, body.actorId);
    return res.status(200).json({ success: true, relationship: rel });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

// POST /api/incidents/relationships/:relationshipId/reject
router.post('/relationships/:relationshipId/reject', (req: Request, res: Response) => {
  try {
    const relId = Array.isArray(req.params.relationshipId) ? req.params.relationshipId[0] : req.params.relationshipId;
    const body = ConfirmRejectSchema.parse(req.body || {});
    const rel = graphService.rejectRelationship(relId, body.actorId);
    return res.status(200).json({ success: true, relationship: rel });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

// POST /api/incidents/:id/answers
router.post('/:id/answers', (req: Request, res: Response) => {
  try {
    const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = AppendAnswerSchema.parse(req.body);
    const answerId = body.id || `ans_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    
    const answer = memoryService.appendAnswer({
      id: answerId,
      incidentId,
      questionId: body.questionId,
      questionText: body.questionText,
      answerValue: body.answerValue,
      isUnsure: body.isUnsure
    });

    return res.status(201).json({ success: true, answer });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

// POST /api/incidents/:id/actions
router.post('/:id/actions', (req: Request, res: Response) => {
  try {
    const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = AppendActionSchema.parse(req.body);
    const actionId = body.id || `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const action = memoryService.appendAction({
      id: actionId,
      incidentId,
      actionType: body.actionType as any,
      description: body.description,
      resultStatus: body.resultStatus,
      resultDetails: body.resultDetails,
      performer: body.performer
    });

    return res.status(201).json({ success: true, action });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

// POST /api/incidents/:id/actions/:actionId/result
router.post('/:id/actions/:actionId/result', (req: Request, res: Response) => {
  try {
    const actionId = Array.isArray(req.params.actionId) ? req.params.actionId[0] : req.params.actionId;
    const body = RecordResultSchema.parse(req.body);

    const action = memoryService.recordActionResult(actionId, body.resultStatus, body.resultDetails);
    return res.status(200).json({ success: true, action });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

// POST /api/incidents/:id/resolve
router.post('/:id/resolve', (req: Request, res: Response) => {
  try {
    const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = ResolveIncidentSchema.parse(req.body);

    const incident = memoryService.resolveIncident(incidentId, body.resolution);
    return res.status(200).json({ success: true, incident });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

// POST /api/incidents/:id/reopen
router.post('/:id/reopen', (req: Request, res: Response) => {
  try {
    const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = ReopenIncidentSchema.parse(req.body);

    const incident = memoryService.reopenIncident(incidentId, body.reason);
    return res.status(200).json({ success: true, incident });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

const VerifyActionSchema = z.object({
  actionId: z.string().optional(),
  actionDescription: z.string().min(1, 'Action description required'),
  resultStatus: z.enum(['YES_RESOLVED', 'NO_FAILED', 'PARTIALLY_RESOLVED', 'SOMETHING_CHANGED', 'PENDING']),
  userNotes: z.string().optional(),
  evidenceAfterAction: z.record(z.string(), z.string()).optional()
});

// POST /api/incidents/:id/verify-action
router.post('/:id/verify-action', (req: Request, res: Response) => {
  try {
    const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = VerifyActionSchema.parse(req.body);
    const result = triageService.verifyActionResult({
      incidentId,
      actionId: body.actionId,
      actionDescription: body.actionDescription,
      resultStatus: body.resultStatus,
      userNotes: body.userNotes,
      evidenceAfterAction: body.evidenceAfterAction
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

// POST /api/incidents/:id/link
router.post('/:id/link', (req: Request, res: Response) => {
  try {
    const body = LinkIncidentSchema.parse(req.body);
    const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const rel = graphService.linkIncidents(
      incidentId,
      body.targetIncidentId,
      body.relationshipType,
      body.similarityScore,
      body.status || 'CONFIRMED',
      body.explanation || '',
      body.sourceActionId
    );
    return res.status(200).json({ success: true, relationship: rel });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

const RcaDecisionSchema = z.object({
  candidateId: z.string().min(1, 'Candidate ID is required'),
  decision: z.enum(['CONFIRMED', 'REJECTED', 'UNCERTAIN', 'NONE']),
  notes: z.string().optional(),
  overrideReason: z.string().optional(),
  actorId: z.string().optional().default('USER')
});

const RcaVerifyHypothesisSchema = z.object({
  candidateId: z.string().min(1, 'Candidate ID is required'),
  result: z.enum(['CONFIRMED', 'DISPROVED', 'INCONCLUSIVE']),
  notes: z.string().optional(),
  actorId: z.string().optional().default('USER')
});

// GET /api/incidents/:id/rca
router.get('/:id/rca', (req: Request, res: Response) => {
  try {
    const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const rca = RcaEngine.generateRca(incidentId);
    return res.status(200).json({ success: true, rca });
  } catch (error: any) {
    return res.status(404).json({ success: false, error: error.message || error });
  }
});

// POST /api/incidents/:id/rca/decide
router.post('/:id/rca/decide', (req: Request, res: Response) => {
  try {
    const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = RcaDecisionSchema.parse(req.body);
    const rca = RcaEngine.recordDecision(
      incidentId, 
      body.candidateId, 
      body.decision, 
      body.actorId, 
      body.notes, 
      body.overrideReason
    );
    return res.status(200).json({ success: true, rca });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

// POST /api/incidents/:id/rca/verify-hypothesis
router.post('/:id/rca/verify-hypothesis', (req: Request, res: Response) => {
  try {
    const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = RcaVerifyHypothesisSchema.parse(req.body);
    const rca = RcaEngine.recordVerification(
      incidentId,
      body.candidateId,
      body.result,
      body.notes,
      body.actorId
    );
    return res.status(200).json({ success: true, rca });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

export default router;

