import { knowledgeService, SearchResult } from './knowledgeService';

export interface RAGContext {
  query: string;
  sources: SearchResult[];
  enhancedPrompt: string;
}

/**
 * RAG Service - Retrieval Augmented Generation
 * Enhances chat queries with relevant knowledge base documents
 */
export const ragService = {
  /**
   * Build RAG context for a user query
   * @param query User's question
   * @param topK Number of top documents to retrieve (default: 5)
   * @returns RAG context with sources and enhanced prompt
   */
  async buildRAGContext(query: string, topK: number = 5): Promise<RAGContext> {
    try {
      // Search for relevant documents
      const sources = await knowledgeService.searchDocuments(query, topK);

      // Build enhanced prompt with context
      const enhancedPrompt = this.buildEnhancedPrompt(query, sources);

      return {
        query,
        sources,
        enhancedPrompt
      };
    } catch (error) {
      console.error('Error building RAG context:', error);
      // Fallback to original query if RAG fails
      return {
        query,
        sources: [],
        enhancedPrompt: query
      };
    }
  },

  /**
   * Build enhanced prompt with document context
   */
  buildEnhancedPrompt(query: string, sources: SearchResult[]): string {
    if (sources.length === 0) {
      // No relevant documents found, use general knowledge
      return `USER QUESTION: ${query}

[Note: No specific documents found in the knowledge base for this query. Please answer based on general roofing sales knowledge, and let the user know this isn't from the document library.]

Please provide your answer:`;
    }

    // Build context section with relevant documents
    let contextSection = 'RELEVANT KNOWLEDGE BASE DOCUMENTS:\n\n';

    sources.forEach((source, index) => {
      const docNum = index + 1;
      contextSection += `[Document ${docNum}]: ${source.document.name}\n`;
      contextSection += `Category: ${source.document.category}\n`;
      contextSection += `Content:\n${source.content}\n`;
      contextSection += `${'='.repeat(80)}\n\n`;
    });

    // Build the enhanced prompt with personality-aligned instructions
    const enhancedPrompt = `${contextSection}

USER QUESTION: ${query}

RESPONSE GUIDELINES:
- Answer based on the knowledge base documents above
- Cite documents naturally (e.g., "According to the GAF Installation Manual..." or "I found this in our Sales Script Library...")
- Be conversational and helpful - avoid robotic language
- If documents don't fully answer the question, supplement with general knowledge and mention that clearly
- Be specific and actionable - these are busy sales professionals who need practical guidance
- Use bullet points or numbered lists for clarity when appropriate
- Offer to pull up related information if it might be helpful

Please provide your answer:`;

    return enhancedPrompt;
  },

  /**
   * Format sources for display in chat
   */
  formatSourcesCitation(sources: SearchResult[]): string {
    if (sources.length === 0) {
      return '';
    }

    let citation = '\n\n---\nSources:\n';
    sources.forEach((source, index) => {
      citation += `${index + 1}. ${source.document.name} (${source.document.category})\n`;
    });

    return citation;
  },

  /**
   * Check if query is likely to benefit from RAG
   */
  shouldUseRAG(query: string): boolean {
    const queryLower = query.toLowerCase();

    // Keywords that suggest RAG would be helpful
    const ragKeywords = [
      'script', 'pitch', 'email', 'template', 'insurance', 
      'claim', 'agreement', 'contract', 'warranty', 'gaf',
      'training', 'process', 'how to', 'what is', 'tell me about',
      'adjuster', 'repair', 'inspection', 'estimate', 'customer'
    ];

    // Check if query contains any RAG-relevant keywords
    return ragKeywords.some(keyword => queryLower.includes(keyword));
  }
};
