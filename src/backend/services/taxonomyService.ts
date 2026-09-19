import { KbIssueDefinition } from '../models';
import { UniversalSearchEngine } from './search/searchEngine';
import { SearchResultCandidate } from './search/ISearchProvider';

export class TaxonomyService {
  private static searchEngine: UniversalSearchEngine = new UniversalSearchEngine();

  public static getTaxonomy(): KbIssueDefinition[] {
    this.searchEngine.reloadCatalog();
    return (this.searchEngine as any).issueCatalog;
  }

  public static findIssueTypeById(id: string): KbIssueDefinition | undefined {
    const kb = this.getTaxonomy();
    return kb.find(t => t.id === id || t.issue_type === id);
  }

  /**
   * Delegates query matching to the Universal Search Engine.
   * Guaranteed never to dead-end.
   */
  public static matchCandidatesFromQuery(query: string): { issueType: KbIssueDefinition; confidence: number; matchReason: string }[] {
    const searchResults: SearchResultCandidate[] = this.searchEngine.search(query, { limit: 5 });

    return searchResults.map(res => {
      const kbDef = this.findIssueTypeById(res.issue_id) || this.getTaxonomy()[0];
      return {
        issueType: kbDef,
        confidence: res.confidence,
        matchReason: res.why_it_may_match
      };
    });
  }

  public static search(query: string): SearchResultCandidate[] {
    return this.searchEngine.search(query);
  }
}
