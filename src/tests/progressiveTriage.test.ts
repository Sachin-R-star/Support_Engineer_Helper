import { describe, it, expect, beforeEach } from 'vitest';
import { TriageService } from '../backend/services/triageService';
import { QuestionEngine } from '../backend/services/questionEngine';
import { DatabaseService } from '../backend/database/db';

describe('Progressive Triage State Machine & Branching Test Suite', () => {
  let triageService: TriageService;

  beforeEach(() => {
    DatabaseService.seedDefaults();
    triageService = new TriageService();
  });

  it('1. Progressive Question Selection: never repeats already answered questions', () => {
    const session = triageService.startSession('usr_eng_02', 'GlobalProtect VPN gateway timeout');
    expect(session.currentStep).toBe('PROGRESSIVE_QUESTION');
    expect(session.currentQuestion).toBeDefined();

    const q1Id = session.currentQuestion!.id;
    const sessionStep2 = triageService.processAnswer(session.sessionId, q1Id, 'public_ok');

    if (sessionStep2.currentQuestion) {
      expect(sessionStep2.currentQuestion.id).not.toBe(q1Id);
    }
  });

  it('2. Branching Question Logic: skips questions failing prerequisite conditions', () => {
    // Hardware BSOD Issue: q_hw_power has options: 'boot_crash', 'no_power', 'black_screen'
    // q_hw_stop_code has prerequisite: q_hw_power = 'boot_crash'
    const session = triageService.startSession('usr_exec_01', 'MacBook won\'t turn on or boot');
    const bsodIssue = session.candidateIssues.find(c => c.issueTypeId === 'kb_dev_bsod_01');

    if (bsodIssue) {
      const state = triageService.selectCandidateIssue(session.sessionId, 'kb_dev_bsod_01');
      expect(state.currentQuestion?.id).toBe('q_hw_power');

      // Answer q_hw_power with 'no_power' (which does NOT satisfy q_hw_stop_code prerequisite 'boot_crash')
      const state2 = triageService.processAnswer(state.sessionId, 'q_hw_power', 'no_power');

      // QuestionEngine must skip q_hw_stop_code because prerequisite is not met!
      if (state2.currentQuestion) {
        expect(state2.currentQuestion.id).not.toBe('q_hw_stop_code');
      }
    }
  });

  it('3. Back Navigation: reverts to previous question and restores state & evidence', () => {
    const session = triageService.startSession('usr_eng_02', 'GlobalProtect VPN gateway timeout');
    const q1Id = session.currentQuestion!.id;

    // Answer Q1
    const stateQ2 = triageService.processAnswer(session.sessionId, q1Id, 'public_ok');
    expect(Object.keys(stateQ2.answers)).toContain(q1Id);
    expect(stateQ2.questionHistory.length).toBeGreaterThanOrEqual(1);

    // Press Back
    const stateReverted = triageService.goBack(session.sessionId);
    expect(Object.keys(stateReverted.answers)).not.toContain(q1Id);
    expect(stateReverted.evidence.some(e => e.sourceQuestionId === q1Id)).toBe(false);
  });

  it('4. "I Don\'t Know" Handling: processes UNSURE answer smoothly without breaking state', () => {
    const session = triageService.startSession('usr_eng_02', 'GlobalProtect VPN gateway timeout');
    const q1Id = session.currentQuestion!.id;

    // Answer with UNSURE
    const state2 = triageService.processAnswer(session.sessionId, q1Id, 'UNSURE', true);

    expect(state2.answers[q1Id].isUnsure).toBe(true);
    expect(state2.answers[q1Id].answerValue).toBe('UNSURE');
    expect(state2.confidence).toBeGreaterThan(0);
  });

  it('5. Diagnosis Readiness: stops progressive questioning when confidence threshold is reached', () => {
    const session = triageService.startSession('usr_exec_01', 'Swollen laptop battery swelling hot');
    
    // Answering battery_swollen triggers safety hazard confidence boost
    const q1Id = session.currentQuestion?.id || 'q_battery_phys';
    const finalState = triageService.processAnswer(session.sessionId, q1Id, 'battery_swollen');

    expect(finalState.currentStep).toBe('TRIAGE_COMPLETE');
    expect(finalState.finalTriageResult).toBeDefined();
    expect(finalState.finalTriageResult?.priority).toBe('P1_CRITICAL');
  });
});
