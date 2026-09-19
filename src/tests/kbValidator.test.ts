import { describe, it, expect } from 'vitest';
import { KbValidator } from '../backend/services/kbValidator';
import { TaxonomyService } from '../backend/services/taxonomyService';
import { KbIssueDefinition } from '../backend/models';

describe('Knowledge Base Validation & Schema Test Suite', () => {
  it('validates knowledgeBase.json schema integrity and referential safety', () => {
    const { definitions, validation } = KbValidator.loadAndValidateFromFile();

    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(validation.totalDefinitions).toBeGreaterThanOrEqual(12);

    // Verify all allowed top-level categories are populated
    expect(validation.categoryDistribution.NETWORK).toBeGreaterThan(0);
    expect(validation.categoryDistribution.ACCOUNT).toBeGreaterThan(0);
    expect(validation.categoryDistribution.APPLICATION).toBeGreaterThan(0);
    expect(validation.categoryDistribution.DEVICE).toBeGreaterThan(0);
    expect(validation.categoryDistribution.OTHER).toBeGreaterThan(0);
  });

  it('detects duplicate IDs correctly', () => {
    const sample: KbIssueDefinition[] = [
      {
        id: 'dup_01',
        category: 'NETWORK',
        subdomain: 'VPN',
        issue_type: 'test_1',
        display_name: 'Test 1',
        description: 'Desc',
        keywords: ['test'],
        example_user_phrases: ['phrase'],
        required_information: [],
        diagnostic_questions: [],
        troubleshooting_steps: ['step'],
        priority_signals: {},
        escalation_conditions: [],
        related_issue_types: []
      },
      {
        id: 'dup_01',
        category: 'ACCOUNT',
        subdomain: 'ACCOUNT',
        issue_type: 'test_2',
        display_name: 'Test 2',
        description: 'Desc 2',
        keywords: ['test2'],
        example_user_phrases: ['phrase2'],
        required_information: [],
        diagnostic_questions: [],
        troubleshooting_steps: ['step2'],
        priority_signals: {},
        escalation_conditions: [],
        related_issue_types: []
      }
    ];

    const result = KbValidator.validate(sample);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('Duplicate issue ID'))).toBe(true);
  });

  it('ensures fallback path under OTHER category exists to prevent UI dead-ends', () => {
    const definitions = TaxonomyService.getTaxonomy();
    const fallback = definitions.find(d => d.category === 'OTHER' && (d.issue_type === 'other_general_it' || d.id.includes('general')));
    expect(fallback).toBeDefined();
    expect(fallback?.display_name).toContain('General IT');
  });

  it('converts unmapped user queries to fallback path without failing', () => {
    const matches = TaxonomyService.matchCandidatesFromQuery('xyz123 random nonsensical query');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some(m => m.issueType.category === 'OTHER')).toBe(true);
    expect(matches[0].matchReason).toContain('ambiguous or unmapped');
  });
});
