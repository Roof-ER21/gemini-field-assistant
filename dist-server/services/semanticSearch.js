/**
 * Semantic Search Utility using TF-IDF (Term Frequency-Inverse Document Frequency)
 *
 * This provides better search results than simple keyword matching by understanding
 * semantic similarity between queries and documents.
 */
class SemanticSearchEngine {
    documents = new Map();
    termFrequency = new Map();
    inverseDocumentFrequency = new Map();
    totalDocs = 0;
    /**
     * Tokenize and normalize text
     */
    tokenize(text) {
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
    isStopWord(word) {
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
    calculateTermFrequency(tokens) {
        const tf = new Map();
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
    calculateIDF() {
        this.inverseDocumentFrequency.clear();
        const allTerms = new Set();
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
    indexDocuments(items) {
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
    cosineSimilarity(queryTF, docTF) {
        let dotProduct = 0;
        let queryMagnitude = 0;
        let docMagnitude = 0;
        const matchedTerms = [];
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
    search(query, options = {}) {
        const { minScore = 0.1, maxResults = 50 } = options;
        const queryTokens = this.tokenize(query);
        if (queryTokens.length === 0) {
            return [];
        }
        const queryTF = this.calculateTermFrequency(queryTokens);
        const results = [];
        for (const [docId, docTF] of this.termFrequency) {
            const { score, matchedTerms } = this.cosineSimilarity(queryTF, docTF);
            if (score >= minScore) {
                const item = this.documents.get(docId);
                if (item) {
                    results.push({
                        item: item,
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
    findSimilar(documentId, options = {}) {
        const { minScore = 0.1, maxResults = 5 } = options;
        const docTF = this.termFrequency.get(documentId);
        if (!docTF) {
            return [];
        }
        const results = [];
        for (const [otherId, otherTF] of this.termFrequency) {
            if (otherId === documentId)
                continue;
            const { score, matchedTerms } = this.cosineSimilarity(docTF, otherTF);
            if (score >= minScore) {
                const item = this.documents.get(otherId);
                if (item) {
                    results.push({
                        item: item,
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
            averageTermsPerDocument: Array.from(this.termFrequency.values())
                .reduce((sum, tf) => sum + tf.size, 0) / this.totalDocs
        };
    }
}
// Export singleton instance
export const semanticSearch = new SemanticSearchEngine();
