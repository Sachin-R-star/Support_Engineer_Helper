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
    if (!id) return undefined;
    const kb = this.getTaxonomy();
    const clean = id.trim().toLowerCase();
    
    // 1. Direct exact match by id, issue_type, or display_name
    let found = kb.find(t => 
      t.id.toLowerCase() === clean || 
      t.issue_type.toLowerCase() === clean || 
      t.display_name.toLowerCase() === clean
    );
    if (found) return found;

    // 2. Partial containment match on display_name or issue_type
    found = kb.find(t => 
      clean.includes(t.display_name.toLowerCase()) || 
      t.display_name.toLowerCase().includes(clean) ||
      clean.includes(t.issue_type.toLowerCase())
    );
    if (found) return found;

    // 3. Domain keyword overlap match (e.g., refined display names like "Workstation System Freeze / Performance Hang")
    // Only check if clean contains spaces (multi-word display title, not an ID)
    if (clean.includes(' ')) {
      found = kb.find(t => {
        const dName = t.display_name.toLowerCase();
        const iType = t.issue_type.toLowerCase();
        if ((clean.includes('freeze') || clean.includes('bsod') || clean.includes('hang')) && (dName.includes('freeze') || dName.includes('bsod') || iType.includes('bsod'))) {
          return true;
        }
        if ((clean.includes('vpn') || clean.includes('gateway')) && (dName.includes('vpn') || iType.includes('vpn'))) {
          return true;
        }
        if ((clean.includes('lockout') || clean.includes('password') || clean.includes('account')) && (dName.includes('lockout') || dName.includes('password') || dName.includes('account'))) {
          return true;
        }
        if ((clean.includes('print') || clean.includes('spooler')) && (dName.includes('print') || dName.includes('spooler'))) {
          return true;
        }
        return false;
      });
      if (found) return found;
    }
  }

  public static getFallbackIssueType(): KbIssueDefinition {
    const kb = this.getTaxonomy();
    const general = kb.find(t => t.id === 'kb_oth_general_99' || t.issue_type === 'other_general_it');
    if (general) return general;
    return kb[kb.length - 1];
  }

  /**
   * Dynamically refines display names to preserve exact diagnostic meaning.
   * E.g. prevents a system freeze / app slowdown from being mislabeled as BSOD unless BSOD evidence is present.
   */
  public static getRefinedIssueDisplayName(
    issueDef: KbIssueDefinition,
    query?: string,
    answers?: Record<string, any> | any[]
  ): string {
    if (issueDef.id === 'kb_dev_bsod_01' || issueDef.issue_type === 'hardware_bsod_kernel_panic') {
      const qLower = (query || '').toLowerCase();
      const ansArray = Array.isArray(answers) ? answers : answers ? Object.values(answers) : [];
      const ansValues = ansArray.map(a => (typeof a === 'string' ? a : a?.answerValue || '').toLowerCase());

      const hasBsodSignal =
        /blue screen|bsod|stop code|kernel panic/i.test(qLower) ||
        ansValues.some(v => /bsod_reboot|bsod_critical|bsod_driver|bsod_ram/i.test(v));

      if (!hasBsodSignal) {
        return 'Workstation System Freeze / Performance Hang';
      }
    }

    return issueDef.display_name;
  }

  /**
   * Delegates query matching to the Universal Search Engine.
   * Guaranteed never to dead-end.
   */
  public static matchCandidatesFromQuery(query: string): { issueType: KbIssueDefinition; confidence: number; matchReason: string }[] {
    const searchResults: SearchResultCandidate[] = this.searchEngine.search(query, { limit: 5 });

    return searchResults.map(res => {
      const kbDef = this.findIssueTypeById(res.issue_id) || this.getFallbackIssueType();
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
