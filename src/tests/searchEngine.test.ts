import { describe, it, expect } from 'vitest';
import { UniversalSearchEngine } from '../backend/services/search/searchEngine';
import { TextNormalizer } from '../backend/services/search/normalizer';
import { FuzzyMatcher } from '../backend/services/search/fuzzyMatcher';

describe('Universal IT Issue Search Engine Test Suite', () => {
  const searchEngine = new UniversalSearchEngine();

  it('1. Clear Query: matches precise KB issue definition with high confidence', () => {
    const results = searchEngine.search('GlobalProtect VPN gateway timeout on US-East');
    
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].issue_id).toBe('kb_net_vpn_01');
    expect(results[0].category).toBe('NETWORK');
    expect(results[0].confidence).toBeGreaterThanOrEqual(80);
    expect(results[0].why_it_may_match).toContain('Matched');
  });

  it('2. Vague Query: returns plausible candidate options and category alternatives without failing', () => {
    const results = searchEngine.search('broken internet');
    
    expect(results.length).toBeGreaterThan(0);
    const hasNetworkCandidate = results.some(r => r.category === 'NETWORK');
    expect(hasNetworkCandidate).toBe(true);
    // Ensure "Something else / None of these" is always present
    const hasFallback = results.some(r => r.issue_id === 'kb_oth_general_99');
    expect(hasFallback).toBe(true);
  });

  it('3. Typo Query: corrects misspellings using Levenshtein fuzzy matching', () => {
    // "blue skreen of deth" -> matches "blue screen / bsod"
    const resultsBsod = searchEngine.search('blue skreen of deth');
    expect(resultsBsod.length).toBeGreaterThan(0);
    expect(resultsBsod[0].issue_id).toBe('kb_dev_bsod_01');

    // "pasword locked" -> matches "account lockout"
    const resultsLockout = searchEngine.search('pasword locked out');
    expect(resultsLockout.length).toBeGreaterThan(0);
    expect(resultsLockout[0].issue_id).toBe('kb_acc_lockout_01');
  });

  it('4. Mixed-Language Query: maps non-English/multi-lingual phrases into correct KB domain', () => {
    // Spanish / English mix: "wifi no funciona"
    const resultsWifi = searchEngine.search('wifi no funciona');
    expect(resultsWifi.length).toBeGreaterThan(0);
    expect(resultsWifi.some(r => r.category === 'NETWORK')).toBe(true);

    // Spanish / English mix: "pantalla azul mi laptop cant login"
    const resultsMulti = searchEngine.search('pantalla azul mi laptop');
    expect(resultsMulti.length).toBeGreaterThan(0);
    expect(resultsMulti.some(r => r.issue_id === 'kb_dev_bsod_01')).toBe(true);
  });

  it('5. Empty Query: returns category-level options without dead-ending or crashing', () => {
    const resultsEmpty = searchEngine.search('');
    expect(resultsEmpty.length).toBeGreaterThanOrEqual(4);
    expect(resultsEmpty.some(r => r.issue_id === 'kb_oth_general_99')).toBe(true);

    const resultsWhitespace = searchEngine.search('   ');
    expect(resultsWhitespace.length).toBeGreaterThanOrEqual(4);
  });

  it('6. Unrelated / Nonsensical Query: routes cleanly to category-level options and fallback path', () => {
    const resultsUnrelated = searchEngine.search('recipe for chocolate cake asdfghjkl');
    
    expect(resultsUnrelated.length).toBeGreaterThan(0);
    // System must NEVER dead-end
    expect(resultsUnrelated.some(r => r.issue_id === 'kb_oth_general_99')).toBe(true);
  });

  it('7. Ambiguous Query: presents category options when confidence is low', () => {
    const resultsAmbiguous = searchEngine.search('access error');
    
    expect(resultsAmbiguous.length).toBeGreaterThan(0);
    const issueIds = resultsAmbiguous.map(r => r.issue_id);
    expect(issueIds).toContain('kb_oth_general_99');
  });

  it('verifies FuzzyMatcher Levenshtein distance calculations', () => {
    expect(FuzzyMatcher.similarityScore('skreen', 'screen')).toBeGreaterThan(0.80);
    expect(FuzzyMatcher.similarityScore('pasword', 'password')).toBeGreaterThan(0.80);
    expect(FuzzyMatcher.isFuzzyMatch('prnter', 'printer')).toBe(true);
  });

  it('verifies TextNormalizer tokenization and synonym expansion', () => {
    const { expandedTokens } = TextNormalizer.getExpandedTokens('cant log in to my email');
    expect(expandedTokens).toContain('login');
    expect(expandedTokens).toContain('email');
    expect(expandedTokens).toContain('outlook');
  });
});
