import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { TriageService } from '../services/triageService';

const router = Router();
const triageService = new TriageService();

const StartSessionSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  query: z.string().min(1, 'Initial query string is required'),
  deviceId: z.string().optional()
});

const SelectIssueSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  issueTypeId: z.string().min(1, 'Issue Type ID is required')
});

const AnswerQuestionSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  questionId: z.string().min(1, 'Question ID is required'),
  answerValue: z.string().min(1, 'Answer Value is required'),
  isUnsure: z.boolean().optional()
});

const GoBackSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required')
});

const FinalizeSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required')
});

// POST /api/triage/start
router.post('/start', (req: Request, res: Response) => {
  try {
    const body = StartSessionSchema.parse(req.body);
    const session = triageService.startSession(body.userId, body.query, body.deviceId);
    return res.status(200).json({ success: true, session });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

// POST /api/triage/select-issue
router.post('/select-issue', (req: Request, res: Response) => {
  try {
    const body = SelectIssueSchema.parse(req.body);
    const session = triageService.selectCandidateIssue(body.sessionId, body.issueTypeId);
    return res.status(200).json({ success: true, session });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

// POST /api/triage/answer
router.post('/answer', (req: Request, res: Response) => {
  try {
    const body = AnswerQuestionSchema.parse(req.body);
    const session = triageService.processAnswer(
      body.sessionId, 
      body.questionId, 
      body.answerValue,
      body.isUnsure
    );
    return res.status(200).json({ success: true, session });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

// POST /api/triage/back
router.post('/back', (req: Request, res: Response) => {
  try {
    const body = GoBackSchema.parse(req.body);
    const session = triageService.goBack(body.sessionId);
    return res.status(200).json({ success: true, session });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

// POST /api/triage/finalize
router.post('/finalize', (req: Request, res: Response) => {
  try {
    const body = FinalizeSchema.parse(req.body);
    const session = triageService.getSession(body.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    const finalized = triageService.finalizeSession(session);
    return res.status(200).json({ success: true, session: finalized });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

// GET /api/triage/session/:sessionId
router.get('/session/:sessionId', (req: Request, res: Response) => {
  const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const session = triageService.getSession(sessionId);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  return res.status(200).json({ success: true, session });
});

// GET /api/triage/decision-trace/:sessionId
router.get('/decision-trace/:sessionId', (req: Request, res: Response) => {
  const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const session = triageService.getSession(sessionId);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  return res.status(200).json({ success: true, decisionTrace: session.decisionTrace || null });
});

// GET /api/triage/adaptive-step/:sessionId
router.get('/adaptive-step/:sessionId', (req: Request, res: Response) => {
  const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const session = triageService.getSession(sessionId);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  return res.status(200).json({ success: true, adaptiveStep: session.adaptiveStep || null });
});

export default router;
