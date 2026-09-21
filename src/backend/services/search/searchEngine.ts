import { ISearchProvider, SearchOptions, SearchResultCandidate } from './ISearchProvider';
import { KbValidator } from '../kbValidator';
import { TextNormalizer } from './normalizer';
import { FuzzyMatcher } from './fuzzyMatcher';
import { KbIssueDefinition, IncidentCategory } from '../../models';

export class UniversalSearchEngine implements ISearchProvider {
  private issueCatalog: KbIssueDefinition[] = [];

  constructor() {
    this.reloadCatalog();
  }

  public reloadCatalog(): void {
    const { definitions } = KbValidator.loadAndValidateFromFile();
    this.issueCatalog = definitions;
  }

  /**
   * Main Search Method: Converts any input into a ranked list of plausible KB issue candidates.
   * CORE RULE: NEVER returns an empty list or dead-end error message.
   */
  public search(query: string, options?: SearchOptions): SearchResultCandidate[] {
    const limit = options?.limit || 5;
    const cleanQuery = query.trim();

    // 1. Handle Empty Query case
    if (!cleanQuery) {
      return this.generateCategoryFallbackOptions('Empty query provided - showing broad IT domain options.');
    }

    const { originalTokens, expandedTokens } = TextNormalizer.getExpandedTokens(cleanQuery);
    const normalizedQuery = TextNormalizer.normalize(cleanQuery);
    const negatedConcepts = TextNormalizer.detectNegatedConcepts(cleanQuery);

    const scoredCandidates: { candidate: SearchResultCandidate; score: number }[] = [];

    // 2. Score each Issue Definition in the Validated Knowledge Base
    for (const issue of this.issueCatalog) {
      // Do not match fallback issue directly in loop
      if (issue.id === 'kb_oth_general_99' || issue.issue_type === 'other_general_it') {
        continue;
      }

      let score = 0;
      const matchReasons: string[] = [];

      // Explicit Negation Signal Penalty
      const isVpnIssue = issue.id === 'kb_net_vpn_01' || issue.keywords.includes('vpn') || issue.issue_type.includes('vpn');
      const isBsodIssue = issue.id === 'kb_dev_bsod_01' || issue.issue_type === 'hardware_bsod_kernel_panic';

      if (negatedConcepts.has('vpn') && isVpnIssue) {
        // Explicit user negation: "not using a VPN" -> zero out score for VPN candidates
        continue;
      }

      if (negatedConcepts.has('blue screen') && isBsodIssue) {
        // Explicit user negation: "not a blue screen" -> zero out score for BSOD candidates
        continue;
      }

      // A. Exact Phrase Match in example_user_phrases (+55 points)
      for (const phrase of issue.example_user_phrases) {
        const normPhrase = TextNormalizer.normalize(phrase);
        if (normalizedQuery.includes(normPhrase) || (normPhrase.length >= 10 && normalizedQuery.includes(normPhrase.substring(0, 15)))) {
          score += 55;
          matchReasons.push(`Exact phrase match: "${phrase}"`);
          break;
        }
      }

      // B. Exact Phrase / Term match in display_name or description (+35 points)
      const normDisplayName = TextNormalizer.normalize(issue.display_name);
      if (normalizedQuery.includes(normDisplayName) || normDisplayName.includes(normalizedQuery)) {
        score += 35;
        matchReasons.push(`Matched title: "${issue.display_name}"`);
      }

      // C. Keyword & Synonym Tokens matching (+20 points per hit, deduplicated by concept group)
      const issueKeywords = issue.keywords.map(k => TextNormalizer.normalize(k));
      let keywordHits = 0;
      const matchedKwSet = new Set<string>();
      const matchedConceptGroups = new Set<string>();

      for (const kw of issueKeywords) {
        if (matchedKwSet.has(kw)) continue;
        const kwWords = kw.split(' ').filter(w => w.length > 0);

        if (kwWords.length > 1) {
          // Multi-word phrase keyword: ALL component words must be matched
          const allWordsMatch = kwWords.every(w =>
            expandedTokens.some(qToken =>
              qToken === w || (qToken.length >= 4 && (w.includes(qToken) || qToken.includes(w) || FuzzyMatcher.isFuzzyMatch(qToken, w, 0.70)))
            )
          );
          if (allWordsMatch) {
            keywordHits++;
            matchedKwSet.add(kw);
            matchReasons.push(`Matched phrase keyword: "${kw}"`);
          }
        } else {
          // Single-word keyword: check token equality, stem prefix or fuzzy token hit
          for (const qToken of expandedTokens) {
            const conceptGroup = TextNormalizer.getConceptGroupForTerm(qToken);
            if (matchedConceptGroups.has(conceptGroup)) {
              // Deduplicate scoring: single query concept hit counts at most ONCE
              continue;
            }

            if (kw === qToken || (qToken.length >= 3 && (kw === qToken || qToken.startsWith(kw) || kw.startsWith(qToken)))) {
              const domainIndicators = new Set(['mfa', 'printer', 'phishing', 'outlook', 'excel', 'wifi', 'spooler', 'onedrive', 'camera', 'bsod']);
              const isDomainKey = domainIndicators.has(kw) || domainIndicators.has(qToken);
              keywordHits += isDomainKey ? 2 : 1;
              matchedKwSet.add(kw);
              matchedConceptGroups.add(conceptGroup);
              matchReasons.push(`Matched keyword: "${kw}"`);
              break;
            }
          }
        }
      }
      score += keywordHits * 20;

      // D. Fuzzy Match for misspellings / typos (+25 points)
      if (keywordHits === 0) {
        for (const qToken of originalTokens) {
          if (qToken.length >= 4) { // Only fuzzy match tokens >= 4 chars
            for (const kw of issueKeywords) {
              if (FuzzyMatcher.isFuzzyMatch(qToken, kw, 0.70)) {
                score += 25;
                matchReasons.push(`Fuzzy typo match: "${qToken}" -> "${kw}"`);
              }
            }
          }
        }
      }

      // E. Subdomain / Category token hit (+15 points)
      const normSubdomain = TextNormalizer.normalize(issue.subdomain);
      const normCategory = TextNormalizer.normalize(issue.category);
      if (normalizedQuery.includes(normSubdomain) || (normCategory.length > 3 && normalizedQuery.includes(normCategory))) {
        score += 15;
        matchReasons.push(`Category/Subdomain hit: ${issue.category} (${issue.subdomain})`);
      }

      // Normalize final score to confidence percentage (0 to 98)
      if (score > 0) {
        const confidence = Math.min(98, Math.max(30, score));

        // Refine display title to ensure freeze/performance is not labeled as BSOD
        const displayLabel = (issue.id === 'kb_dev_bsod_01' && !/blue screen|bsod|stop code|kernel panic/i.test(normalizedQuery))
          ? 'Workstation System Freeze / Performance Hang'
          : issue.display_name;

        scoredCandidates.push({
          candidate: {
            issue_id: issue.id,
            category: issue.category,
            issue_type: issue.issue_type,
            user_friendly_label: displayLabel,
            short_explanation: issue.description,
            confidence,
            why_it_may_match: matchReasons.slice(0, 2).join('; ') || 'Matched keywords in KB entry'
          },
          score: confidence
        });
      }
    }

    // Sort by confidence descending
    scoredCandidates.sort((a, b) => b.score - a.score);

    const results: SearchResultCandidate[] = scoredCandidates.map(c => c.candidate);

    // 3. Low Confidence / Unrelated / Ambiguous Query handling:
    // If top candidate confidence < 40%, inject category-level broad options
    if (results.length === 0 || results[0].confidence < 40) {
      const fallbackOptions = this.generateCategoryFallbackOptions(
        `Input "${cleanQuery}" is ambiguous or unmapped - showing category-level options.`
      );
      // Prepend any weak matches after fallback category candidates
      return [...fallbackOptions, ...results].slice(0, limit);
    }

    // 4. Always append the "Something else / None of these" fallback candidate path
    const fallbackPathCandidate: SearchResultCandidate = {
      issue_id: 'kb_oth_general_99',
      category: 'OTHER',
      issue_type: 'other_general_it',
      user_friendly_label: 'Something else / None of these',
      short_explanation: 'Select if none of the candidate options match your IT issue.',
      confidence: 10,
      why_it_may_match: 'Universal fallback route ensuring non-dead-ending triage.'
    };

    const finalResults = results.slice(0, limit - 1);
    finalResults.push(fallbackPathCandidate);

    return finalResults;
  }

  /**
   * Generates broad category-level candidate options when query is vague, empty, or low confidence.
   */
  private generateCategoryFallbackOptions(reason: string): SearchResultCandidate[] {
    const categories: { category: IncidentCategory; label: string; issueId: string; issueType: string; desc: string }[] = [
      {
        category: 'ACCOUNT',
        label: 'Account Access & Password Issue',
        issueId: 'kb_acc_lockout_01',
        issueType: 'account_lockout_sso',
        desc: 'Select for login problems, password resets, MFA errors, or account lockouts.'
      },
      {
        category: 'NETWORK',
        label: 'Corporate Network & Wi-Fi Connectivity',
        issueId: 'kb_net_wifi_02',
        issueType: 'wifi_captive_portal_failure',
        desc: 'Select for Wi-Fi errors, captive portal prompts, or local network outages.'
      },
      {
        category: 'DEVICE',
        label: 'Hardware & Workstation Fault',
        issueId: 'kb_dev_bsod_01',
        issueType: 'hardware_bsod_kernel_panic',
        desc: 'Select for system freezes, crashes, battery drain, or printer issues.'
      },
      {
        category: 'APPLICATION',
        label: 'Software Application Error',
        issueId: 'kb_app_office_03',
        issueType: 'office_license_activation_error',
        desc: 'Select for Outlook, Office 365, OneDrive, or enterprise software crashes.'
      },
      {
        category: 'OTHER',
        label: 'Something else / None of these',
        issueId: 'kb_oth_general_99',
        issueType: 'other_general_it',
        desc: 'General IT support routing path for unlisted issues.'
      }
    ];

    return categories.map(cat => ({
      issue_id: cat.issueId,
      category: cat.category,
      issue_type: cat.issueType,
      user_friendly_label: cat.label,
      short_explanation: cat.desc,
      confidence: 30,
      why_it_may_match: reason
    }));
  }
}

