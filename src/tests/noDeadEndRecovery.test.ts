import { describe, it, expect, beforeEach } from 'vitest';
import { RecoveryEngine } from '../backend/services/recoveryEngine';
import { TriageService } from '../backend/services/triageService';
import { TaxonomyService } from '../backend/services/taxonomyService';
import { DatabaseService } from '../backend/database/db';

describe('No-Dead-End Recovery Engine Test Suite', () => {
  let triageService: TriageService;

  beforeEach(() => {
    DatabaseService.getDb();
    DatabaseService.seedDefaults();
    triageService = new TriageService();
  });

  it('1. Empty Input: Triggers EMPTY_INPUT recovery payload with broader category options', () => {
    const reason = RecoveryEngine.detectDeadEndScenario('');
    expect(reason).toBe('EMPTY_INPUT');

    const state = triageService.startSession('usr_exec_01', '   ');
    expect(state.recoveryPayload).toBeDefined();
    expect(state.recoveryPayload?.reasonCode).toBe('EMPTY_INPUT');
    expect(state.recoveryPayload?.userMessage).toContain('No issue description was entered');
    expect(state.recoveryPayload?.broaderCategories.length).toBe(5);
    expect(state.currentStep).toBe('AMBIGUITY_SELECTION');
  });

  it('2. Nonsense / Gibberish Input: Triggers NONSENSE_INPUT recovery payload', () => {
    const reason1 = RecoveryEngine.detectDeadEndScenario('asdfghjkl qwertyuiop');
    expect(reason1).toBe('NONSENSE_INPUT');

    const reason2 = RecoveryEngine.detectDeadEndScenario('12345!@#$%^');
    expect(reason2).toBe('NONSENSE_INPUT');

    const state = triageService.startSession('usr_exec_01', 'asdfghjkl qwertyuiop');
    expect(state.recoveryPayload).toBeDefined();
    expect(state.recoveryPayload?.reasonCode).toBe('NONSENSE_INPUT');
    expect(state.recoveryPayload?.userMessage).toContain('couldn\'t recognize specific IT terms');
  });

  it('3. Unrelated Off-Topic Input: Triggers UNRELATED_INPUT recovery payload', () => {
    const reason = RecoveryEngine.detectDeadEndScenario('What is the weather in Tokyo today?');
    expect(reason).toBe('UNRELATED_INPUT');

    const state = triageService.startSession('usr_exec_01', 'Tell me a joke');
    expect(state.recoveryPayload).toBeDefined();
    expect(state.recoveryPayload?.reasonCode).toBe('UNRELATED_INPUT');
    expect(state.recoveryPayload?.userMessage).toContain('helps with workplace tech');
  });

  it('4. Extremely Vague Input: Triggers EXTREMELY_VAGUE recovery payload', () => {
    const reason1 = RecoveryEngine.detectDeadEndScenario('help');
    expect(reason1).toBe('EXTREMELY_VAGUE');

    const reason2 = RecoveryEngine.detectDeadEndScenario('it broke');
    expect(reason2).toBe('EXTREMELY_VAGUE');

    const state = triageService.startSession('usr_exec_01', 'it broke');
    expect(state.recoveryPayload).toBeDefined();
    expect(state.recoveryPayload?.reasonCode).toBe('EXTREMELY_VAGUE');
    expect(state.recoveryPayload?.highInfoClarificationQuestion).toBeDefined();
  });

  it('5. Low Confidence Classification: Returns broader issue choices and clarification question', () => {
    const state = triageService.startSession('usr_exec_01', 'unusual system latency on peripheral device');
    expect(state.recoveryPayload).toBeDefined();
    expect(['LOW_CONFIDENCE', 'AMBIGUOUS_CHOICES', 'NO_KB_MATCH']).toContain(state.recoveryPayload?.reasonCode);
    expect(state.recoveryPayload?.suggestedOptions.some(o => o.actionType === 'SELECT_CATEGORY')).toBe(true);
  });

  it('6. No Knowledge-Base Match: Route search fallback to "Something else / None of these"', () => {
    const candidates = TaxonomyService.matchCandidatesFromQuery('completely unlisted obscure hardware failure zzz123');
    expect(candidates.length).toBeGreaterThan(0);
    
    const fallbackCandidate = candidates.find(c => c.issueType.id === 'kb_oth_general_99' || c.issueType.display_name.includes('Something else'));
    expect(fallbackCandidate).toBeDefined();
    expect(fallbackCandidate?.confidence).toBeGreaterThan(0);
  });

  it('7. Contradictory Answers: Triggers CONTRADICTORY_ANSWERS recovery payload with human escalation suggestion', () => {
    const state = triageService.startSession('usr_exec_01', 'VPN connection drops');
    
    // Simulate user answering contradictory facts:
    // Fact A: "No internet access at all"
    // Fact B: "Public web works fine"
    triageService.processAnswer(state.sessionId, 'q_net_scope', 'no_internet_at_all');
    const updatedState = triageService.processAnswer(state.sessionId, 'q_vpn_status', 'public_ok');

    expect(updatedState.recoveryPayload).toBeDefined();
    expect(updatedState.recoveryPayload?.reasonCode).toBe('CONTRADICTORY_ANSWERS');
    expect(updatedState.recoveryPayload?.userMessage).toContain('conflicting details');
    expect(updatedState.recoveryPayload?.recommendedHumanEscalation).toBe(true);
  });

  it('8. Human Support Escalation: Provides option to connect to human IT Helpdesk agent', () => {
    const payload = RecoveryEngine.buildRecoveryPayload('CONTRADICTORY_ANSWERS', 'conflicting input');
    expect(payload.recommendedHumanEscalation).toBe(true);

    const humanOption = payload.suggestedOptions.find(o => o.actionType === 'ESCALATE_HUMAN');
    expect(humanOption).toBeDefined();
    expect(humanOption?.label).toContain('IT Helpdesk Agent');
  });
});
