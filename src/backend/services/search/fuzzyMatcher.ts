export class FuzzyMatcher {
  /**
   * Calculates Levenshtein Distance between two strings.
   */
  public static levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Calculates normalized similarity score (0.0 to 1.0) based on Levenshtein distance.
   */
  public static similarityScore(a: string, b: string): number {
    const str1 = a.toLowerCase();
    const str2 = b.toLowerCase();

    if (str1 === str2) return 1.0;
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1.0;

    const distance = this.levenshteinDistance(str1, str2);
    return Number((1 - distance / maxLen).toFixed(3));
  }

  /**
   * Evaluates if a query token fuzzy-matches a target token with max 1-2 edit distance.
   */
  public static isFuzzyMatch(queryToken: string, targetToken: string, threshold = 0.70): boolean {
    if (Math.abs(queryToken.length - targetToken.length) > 3) return false;
    const score = this.similarityScore(queryToken, targetToken);
    return score >= threshold;
  }
}
