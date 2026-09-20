import { describe, it, expect, beforeEach } from 'vitest';
import { TriageService } from '../backend/services/triageService';
import { DatabaseService } from '../backend/database/db';

describe('Screen Hanging & Freezing Follow-up Question Audit Test Suite', () => {
  let triageService: TriageService;

  beforeEach(() => {
    DatabaseService.seedDefaults();
    triageService = new TriageService();
  });

  it('1. "My laptop screen is hanging": asks symptom clarification question (not docking station charging)', () => {
    const session = triageService.startSession('usr_exec_01', 'My laptop screen is hanging');
    
    let activeState = session;
    if (session.currentStep === 'AMBIGUITY_SELECTION' && session.candidateIssues.length > 0) {
      const topCandidate = session.candidateIssues[0].issueTypeId;
      activeState = triageService.selectCandidateIssue(session.sessionId, topCandidate);
    }

    expect(activeState.currentStep).toBe('PROGRESSIVE_QUESTION');
    expect(activeState.currentQuestion).toBeDefined();

    const qText = activeState.currentQuestion!.question_text;
    
    // CRITICAL REQUIREMENT: Must NOT ask ungrounded question about docking station charging!
    expect(qText.toLowerCase()).not.toContain('docking station charging');
    expect(qText.toLowerCase()).not.toContain('power battery');

    // Should ask symptom clarification question
    expect(qText).toContain('Is the entire laptop frozen, or can you still move the mouse/cursor?');
  });

  it('2. "My laptop is completely frozen": asks symptom clarification question', () => {
    const session = triageService.startSession('usr_exec_01', 'My laptop is completely frozen');
    
    let activeState = session;
    if (session.currentStep === 'AMBIGUITY_SELECTION' && session.candidateIssues.length > 0) {
      const topCandidate = session.candidateIssues[0].issueTypeId;
      activeState = triageService.selectCandidateIssue(session.sessionId, topCandidate);
    }

    expect(activeState.currentStep).toBe('PROGRESSIVE_QUESTION');
    expect(activeState.currentQuestion).toBeDefined();

    const qText = activeState.currentQuestion!.question_text;
    expect(qText.toLowerCase()).not.toContain('docking station charging');
    expect(qText).toContain('Is the entire laptop frozen, or can you still move the mouse/cursor?');
  });

  it('3. "My screen is frozen but mouse still moves": asks symptom clarification question', () => {
    const session = triageService.startSession('usr_exec_01', 'My screen is frozen but mouse still moves');
    
    let activeState = session;
    if (session.currentStep === 'AMBIGUITY_SELECTION' && session.candidateIssues.length > 0) {
      const topCandidate = session.candidateIssues[0].issueTypeId;
      activeState = triageService.selectCandidateIssue(session.sessionId, topCandidate);
    }

    expect(activeState.currentStep).toBe('PROGRESSIVE_QUESTION');
    expect(activeState.currentQuestion).toBeDefined();

    const qText = activeState.currentQuestion!.question_text;
    expect(qText.toLowerCase()).not.toContain('docking station charging');
    expect(qText).toContain('Is the entire laptop frozen, or can you still move the mouse/cursor?');
  });

  it('4. "Laptop freezes when connected to docking station": permits docking context questions because component is grounded', () => {
    const session = triageService.startSession('usr_exec_01', 'Laptop freezes when connected to docking station');
    
    let activeState = session;
    if (session.currentStep === 'AMBIGUITY_SELECTION' && session.candidateIssues.length > 0) {
      const topCandidate = session.candidateIssues[0].issueTypeId;
      activeState = triageService.selectCandidateIssue(session.sessionId, topCandidate);
    }

    expect(activeState.currentStep).toBe('PROGRESSIVE_QUESTION');
    expect(activeState.currentQuestion).toBeDefined();

    const qText = activeState.currentQuestion!.question_text;
    expect(qText).toBeDefined();
    expect(qText.length).toBeGreaterThan(0);
  });
});
