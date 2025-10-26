/**
 * Semantic Search Utility using TF-IDF (Term Frequency-Inverse Document Frequency)
 *
 * This provides better search results than simple keyword matching by understanding
 * semantic similarity between queries and documents.
 */

export interface SearchableItem {
  id: string;
  text: string;
  metadata?: Record<string, any>;
}

export interface SearchResult<T> {
  item: T;
  score: number;
  matchedTerms: string[];
}

class SemanticSearchEngine {
  private documents: Map<string, SearchableItem> = new Map();
  private termFrequency: Map<string, Map<string, number>> = new Map();
  private inverseDocumentFrequency: Map<string, number> = new Map();
  private totalDocs = 0;

  /**
   * Tokenize and normalize text
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter(term => term.length > 2) // Filter short words
      .filter(term => !this.isStopWord(term)); // Remove stop words
  }

  /**
   * Common stop words to ignore
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'a', 'an', 'is', 'was', 'are', 'were', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'should', 'could', 'may', 'might', 'must',
      'can', 'this', 'that', 'these', 'those', 'it', 'its', 'from'
    ]);
    return stopWords.has(word);
  }

  /**
   * Calculate term frequency for a document
   */
  private calculateTermFrequency(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    const totalTerms = tokens.length;

    for (const term of tokens) {
      tf.set(term, (tf.get(term) || 0) + 1);
    }

    // Normalize by total terms
    for (const [term, count] of tf.entries()) {
      tf.set(term, count / totalTerms);
    }

    return tf;
  }

  /**
   * Calculate inverse document frequency
   */
  private calculateIDF(): void {
    this.inverseDocumentFrequency.clear();
    const allTerms = new Set<string>();

    // Collect all unique terms
    for (const [, tf] of this.termFrequency) {
      for (const term of tf.keys()) {
        allTerms.add(term);
      }
    }

    // Calculate IDF for each term
    for (const term of allTerms) {
      let docsWithTerm = 0;
      for (const [, tf] of this.termFrequency) {
        if (tf.has(term)) {
          docsWithTerm++;
        }
      }

      // IDF = log(total docs / docs with term)
      const idf = Math.log((this.totalDocs + 1) / (docsWithTerm + 1));
      this.inverseDocumentFrequency.set(term, idf);
    }
  }

  /**
   * Index documents for semantic search
   */
  indexDocuments(items: SearchableItem[]): void {
    this.documents.clear();
    this.termFrequency.clear();
    this.totalDocs = items.length;

    for (const item of items) {
      this.documents.set(item.id, item);
      const tokens = this.tokenize(item.text);
      const tf = this.calculateTermFrequency(tokens);
      this.termFrequency.set(item.id, tf);
    }

    this.calculateIDF();
  }

  /**
   * Calculate cosine similarity between two TF-IDF vectors
   */
  private cosineSimilarity(
    queryTF: Map<string, number>,
    docTF: Map<string, number>
  ): { score: number; matchedTerms: string[] } {
    let dotProduct = 0;
    let queryMagnitude = 0;
    let docMagnitude = 0;
    const matchedTerms: string[] = [];

    const allTerms = new Set([...queryTF.keys(), ...docTF.keys()]);

    for (const term of allTerms) {
      const queryWeight = (queryTF.get(term) || 0) * (this.inverseDocumentFrequency.get(term) || 0);
      const docWeight = (docTF.get(term) || 0) * (this.inverseDocumentFrequency.get(term) || 0);

      if (queryWeight > 0 && docWeight > 0) {
        matchedTerms.push(term);
      }

      dotProduct += queryWeight * docWeight;
      queryMagnitude += queryWeight * queryWeight;
      docMagnitude += docWeight * docWeight;
    }

    if (queryMagnitude === 0 || docMagnitude === 0) {
      return { score: 0, matchedTerms: [] };
    }

    const score = dotProduct / (Math.sqrt(queryMagnitude) * Math.sqrt(docMagnitude));
    return { score, matchedTerms };
  }

  /**
   * Search for documents matching the query
   */
  search<T extends SearchableItem>(
    query: string,
    options: {
      minScore?: number;
      maxResults?: number;
    } = {}
  ): SearchResult<T>[] {
    const { minScore = 0.1, maxResults = 50 } = options;

    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) {
      return [];
    }

    const queryTF = this.calculateTermFrequency(queryTokens);
    const results: SearchResult<T>[] = [];

    for (const [docId, docTF] of this.termFrequency) {
      const { score, matchedTerms } = this.cosineSimilarity(queryTF, docTF);

      if (score >= minScore) {
        const item = this.documents.get(docId);
        if (item) {
          results.push({
            item: item as T,
            score,
            matchedTerms
          });
        }
      }
    }

    // Sort by score (descending) and limit results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  /**
   * Find similar documents to a given document
   */
  findSimilar<T extends SearchableItem>(
    documentId: string,
    options: {
      minScore?: number;
      maxResults?: number;
    } = {}
  ): SearchResult<T>[] {
    const { minScore = 0.1, maxResults = 5 } = options;

    const docTF = this.termFrequency.get(documentId);
    if (!docTF) {
      return [];
    }

    const results: SearchResult<T>[] = [];

    for (const [otherId, otherTF] of this.termFrequency) {
      if (otherId === documentId) continue;

      const { score, matchedTerms } = this.cosineSimilarity(docTF, otherTF);

      if (score >= minScore) {
        const item = this.documents.get(otherId);
        if (item) {
          results.push({
            item: item as T,
            score,
            matchedTerms
          });
        }
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  /**
   * Get statistics about the indexed corpus
   */
  getStats() {
    return {
      totalDocuments: this.totalDocs,
      totalUniqueTerms: this.inverseDocumentFrequency.size,
      averageTermsPerDocument:
        Array.from(this.termFrequency.values())
          .reduce((sum, tf) => sum + tf.size, 0) / this.totalDocs
    };
  }
}

// Export singleton instance
export const semanticSearch = new SemanticSearchEngine();
