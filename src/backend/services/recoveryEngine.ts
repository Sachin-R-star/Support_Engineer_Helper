import { 
  RecoveryReasonCode, 
  NoDeadEndRecoveryPayload, 
  RecoveryOption, 
  IncidentCategory,
  KbDiagnosticQuestion,
  TriageAnswer
} from '../models';

export class RecoveryEngine {
  private static UNRELATED_KEYWORDS = [
    'weather', 'joke', 'recipe', 'cake', 'chocolate', 'food', 'cook', 'sports', 'football', 'cricket', 'movie', 
    'song', 'restaurant', 'pizza', 'capital of', 'tell me a story', 'who won'
  ];

  private static EXTREMELY_VAGUE_TERMS = [
    'help', 'it broke', 'problem', 'issue', 'broken', 'not working', 
    'error', 'fix it', 'something wrong', 'bad', 'fault', 'acting weird', 'weird', 'acting slow'
  ];

  /**
   * Analyzes input string, candidate count, confidence, and answers to detect dead-end conditions.
   * Returns a specific RecoveryReasonCode or null if input is normal.
   */
  public static detectDeadEndScenario(
    input: string, 
    candidateCount: number = 0, 
    topConfidence: number = 0,
    answers?: Record<string, TriageAnswer>
  ): RecoveryReasonCode | null {
    const trimmed = (input || '').trim();

    // 1. Empty Input
    if (trimmed.length === 0) {
      return 'EMPTY_INPUT';
    }

    const lower = trimmed.toLowerCase();

    // 2. Nonsense / Gibberish Input
    // Check keyboard smashes (asdf, qwerty), no vowels in tokens > 3 chars, or high symbol density
    const hasKeyboardSmash = /asdf|qwerty|zxcv|dfgh|ghjkl|12345|!@#\$/i.test(lower);
    const tokens = lower.split(/\s+/);
    const hasGibberishToken = tokens.some(t => t.length >= 4 && !/[aeiouy]/i.test(t) && /^[a-z]+$/i.test(t));
    const symbolDensity = (trimmed.replace(/[a-zA-Z0-9\s]/g, '').length) / trimmed.length;

    if (hasKeyboardSmash || hasGibberishToken || symbolDensity > 0.35 || /^[^a-zA-Z0-9]+$/.test(trimmed)) {
      return 'NONSENSE_INPUT';
    }

    // 3. Unrelated / Off-topic Input
    if (RecoveryEngine.UNRELATED_KEYWORDS.some(k => lower.includes(k))) {
      return 'UNRELATED_INPUT';
    }

    // 4. Contradictory Answers Check
    if (answers) {
      const values = Object.values(answers).map(a => a.answerValue);
      if (values.includes('no_internet_at_all') && (values.includes('public_ok') || values.includes('connected_on_wifi'))) {
        return 'CONTRADICTORY_ANSWERS';
      }
      if (values.includes('account_active') && values.includes('creds_exposed_locked')) {
        return 'CONTRADICTORY_ANSWERS';
      }
    }

    // 5. Extremely Vague Input
    if (trimmed.length <= 30 && RecoveryEngine.EXTREMELY_VAGUE_TERMS.some(term => lower.includes(term))) {
      // Only treat as extremely vague if no specific hardware, software, or network noun token is present
      const hasSpecificNoun = /wifi|wi-fi|vpn|outlook|excel|teams|password|battery|screen|monitor|dock|printer|bsod|blue screen|internet/i.test(lower);
      if (!hasSpecificNoun) {
        return 'EXTREMELY_VAGUE';
      }
    }

    // 6. No Knowledge Base Match
    if (candidateCount === 0) {
      return 'NO_KB_MATCH';
    }

    // 7. Low Confidence Classification
    if (topConfidence < 40) {
      return 'LOW_CONFIDENCE';
    }

    // 8. Ambiguous Choices (multiple candidates with low confidence)
    if (candidateCount > 1 && topConfidence < 65) {
      return 'AMBIGUOUS_CHOICES';
    }

    return null;
  }

  /**
   * Constructs a structured NoDeadEndRecoveryPayload to guide the user without ever dead-ending.
   */
  public static buildRecoveryPayload(
    reasonCode: RecoveryReasonCode,
    originalInput: string = ''
  ): NoDeadEndRecoveryPayload {
    const broaderCategories: { category: IncidentCategory; label: string; description: string }[] = [
      { category: 'NETWORK', label: 'Network & Connectivity', description: 'Wi-Fi, VPN, Internet access, or local network speeds' },
      { category: 'ACCOUNT', label: 'Account & Password', description: 'Password reset, account lockout, MFA, or SSO login' },
      { category: 'APPLICATION', label: 'Applications & Software', description: 'Outlook, Teams, Office, CRM, or app crashes' },
      { category: 'DEVICE', label: 'Computer & Hardware', description: 'Laptop battery, BSOD, slow computer, or monitor/dock' },
      { category: 'OTHER', label: 'General / Something Else', description: 'Other IT equipment, peripherals, or unlisted requests' }
    ];

    let userMessage = 'We want to make sure your IT request is handled quickly. Please select a category below or describe the problem in more detail.';
    let recommendedHumanEscalation = false;

    switch (reasonCode) {
      case 'EMPTY_INPUT':
        userMessage = 'No issue description was entered. Please choose your IT area below or type a description.';
        break;
      case 'NONSENSE_INPUT':
        userMessage = 'We couldn\'t recognize specific IT terms in your query. Please select the primary area of your problem below.';
        break;
      case 'UNRELATED_INPUT':
        userMessage = 'The IT Assistant helps with workplace tech, accounts, and hardware. Please choose an IT category below or describe your tech problem.';
        break;
      case 'EXTREMELY_VAGUE':
        userMessage = 'Your request is very brief. To help us diagnose this accurately, please select an IT category or provide a bit more detail.';
        break;
      case 'CONTRADICTORY_ANSWERS':
        userMessage = 'We noticed conflicting details in the answers provided. Please clarify the primary issue area below or re-select the category.';
        recommendedHumanEscalation = true;
        break;
      case 'NO_KB_MATCH':
      case 'LOW_CONFIDENCE':
        userMessage = 'We could not match your exact phrase to a specific automated playbook. Please pick the closest category below.';
        break;
      case 'AMBIGUOUS_CHOICES':
        userMessage = 'Multiple IT categories match your request. Please select the exact issue type from the options below.';
        break;
    }

    const suggestedOptions: RecoveryOption[] = [
      {
        id: 'rec_opt_select_cat',
        label: 'Select Category',
        description: 'Pick from top-level IT support categories',
        actionType: 'SELECT_CATEGORY'
      },
      {
        id: 'rec_opt_free_text',
        label: 'Describe in Own Words',
        description: 'Provide more context or error message text',
        actionType: 'FREE_TEXT'
      },
      {
        id: 'rec_opt_something_else',
        label: 'Something else / None of these',
        description: 'Submit as general IT support ticket',
        actionType: 'SELECT_CATEGORY',
        targetCategoryId: 'OTHER'
      },
      {
        id: 'rec_opt_human_escalate',
        label: 'Connect with IT Helpdesk Agent',
        description: 'Escalate to human support engineer',
        actionType: 'ESCALATE_HUMAN'
      }
    ];

    const highInfoClarificationQuestion: KbDiagnosticQuestion = {
      id: 'q_recovery_high_info_clarification',
      question_text: 'What component or service is primarily affected?',
      answer_type: 'SINGLE_CHOICE',
      options: [
        { label: 'Internet / Network / VPN', value: 'NETWORK' },
        { label: 'Login / Password / Account', value: 'ACCOUNT' },
        { label: 'Software / Email / App Crash', value: 'APPLICATION' },
        { label: 'Computer Hardware / Screen / Power', value: 'DEVICE' },
        { label: 'Other / Not Sure', value: 'OTHER' }
      ]
    };

    return {
      isRecoveryActive: true,
      reasonCode,
      userMessage,
      broaderCategories,
      suggestedOptions,
      highInfoClarificationQuestion,
      allowFreeTextRefinement: true,
      recommendedHumanEscalation
    };
  }
}
