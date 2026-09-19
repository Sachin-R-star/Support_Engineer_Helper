import { IncidentCategory, KbIssueDefinition } from '../../models';

export interface SearchResultCandidate {
  issue_id: string;
  category: IncidentCategory;
  issue_type: string;
  user_friendly_label: string;
  short_explanation: string;
  confidence: number; // 0 to 100
  why_it_may_match: string;
}

export interface SearchOptions {
  limit?: number;
  minConfidenceThreshold?: number;
}

export interface ISearchProvider {
  search(query: string, options?: SearchOptions): SearchResultCandidate[];
}

export interface ISemanticSearchProvider extends ISearchProvider {
  embedQuery?(query: string): Promise<number[]>;
  searchVector?(vector: number[], options?: SearchOptions): Promise<SearchResultCandidate[]>;
}
