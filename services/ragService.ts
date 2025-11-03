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
   * Build RAG context for a user query with state-awareness
   * @param query User's question
   * @param topK Number of top documents to retrieve (default: 5)
   * @param selectedState Optional state code (VA, MD, PA) for state-specific search boosting
   * @returns RAG context with sources and enhanced prompt
   */
  async buildRAGContext(query: string, topK: number = 5, selectedState?: string): Promise<RAGContext> {
    try {
      // Search for relevant documents with state-awareness
      const sources = await knowledgeService.searchDocuments(query, topK, selectedState);

      // Build enhanced prompt with context
      const enhancedPrompt = this.buildEnhancedPrompt(query, sources, selectedState);

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
   * Build enhanced prompt with document context and state-specific guidance
   */
  buildEnhancedPrompt(query: string, sources: SearchResult[], selectedState?: string): string {
    if (sources.length === 0) {
      // No relevant documents found, use general knowledge
      return `USER QUESTION: ${query}

[Note: No specific documents found in the knowledge base for this query. Please answer based on general roofing sales knowledge, and let the user know this isn't from the document library.]

Please provide your answer:`;
    }

    // ⚠️ CRITICAL: Put citation instructions FIRST so AI sees them immediately
    const citationInstructions = `🔴 CRITICAL INSTRUCTION - READ THIS FIRST 🔴

MANDATORY CITATION FORMAT:
You MUST cite sources using [1], [2], [3] for EVERY fact from the documents below.

Examples of CORRECT citations:
✅ "IRC R908.3 requires matching [1]"
✅ "Maryland mandates full replacement [2]"
✅ "According to GAF guidelines [3], storm damage must be documented"

Examples of INCORRECT citations (DO NOT DO THIS):
❌ "IRC R908.3 requires matching" (missing citation)
❌ "According to Document 1" (use [1] instead)
❌ "[MHIC-Matching-Requirement]" (use [2] instead)

RULES:
- [1] refers to Document 1, [2] refers to Document 2, [3] refers to Document 3
- Place citation IMMEDIATELY after each fact
- Multiple citations for combined info: "IRC R908.3 requires matching [1] with 89% success [2]"
- If you don't cite a fact, the user won't be able to verify it

${'='.repeat(80)}

`;

    // Build context section with relevant documents
    let contextSection = 'RELEVANT KNOWLEDGE BASE DOCUMENTS:\n\n';

    sources.forEach((source, index) => {
      const docNum = index + 1;
      contextSection += `[Document ${docNum}]: ${source.document.name}\n`;
      contextSection += `Path: ${source.document.path}\n`;
      contextSection += `Category: ${source.document.category}\n`;
      contextSection += `Content:\n${source.content}\n`;
      contextSection += `${'='.repeat(80)}\n\n`;
    });

    // Add state-specific or tri-state guidance
    let stateGuidance = '';
    if (selectedState) {
      const stateRules: Record<string, string> = {
        'MD': `**MARYLAND-SPECIFIC RULES (CRITICAL):**
- Maryland REQUIRES insurance companies to account for matching (IRC R908.3)
- Use matching arguments AGGRESSIVELY in MD claims
- Insurance must pay for full replacement if matching is impossible
- This is your strongest argument in Maryland`,
        'VA': `**VIRGINIA-SPECIFIC RULES (CRITICAL):**
- Virginia does NOT require matching UNLESS the policy has a matching endorsement
- DO NOT use matching arguments in VA without confirming matching endorsement exists
- Instead, use: Repairability arguments, differing dimensions, missed storm damage
- Focus on brittleness tests and repair attempt documentation`,
        'PA': `**PENNSYLVANIA-SPECIFIC RULES (CRITICAL):**
- Pennsylvania does NOT require matching UNLESS the policy has a matching endorsement
- DO NOT use matching arguments in PA without confirming matching endorsement exists
- Instead, use: Permit denials (very effective), repairability, differing dimensions
- Focus on township requirements and building code compliance`
      };

      stateGuidance = stateRules[selectedState] || '';
      if (stateGuidance) {
        stateGuidance = `\n\n${stateGuidance}\n`;
      }
    } else {
      // No state selected: enforce generic, tri-state safe guidance
      stateGuidance = `\n\n**TRI-STATE GUIDANCE (NO STATE SELECTED):**\n- Do NOT assume a state. Provide guidance that applies across VA, MD, and PA.\n- When rules differ by state, clearly call out the differences per state.\n- Do NOT use Maryland-only matching arguments unless the user confirms MD.\n- Prefer universal items (repairability, documentation, clear photos, code-compliant methods).\n`;
    }

    // Build the enhanced prompt with citation instructions FIRST
    const enhancedPrompt = `${citationInstructions}${contextSection}

USER QUESTION: ${query}
${selectedState ? `\nCURRENT STATE: ${selectedState}` : ''}${stateGuidance}

RESPONSE GUIDELINES:
- Answer based on the knowledge base documents above
- **REMEMBER: Cite EVERY fact with [1], [2], or [3]** (See citation rules at top)
- **Apply state-specific rules above** - MD uses matching, VA/PA use repairability unless endorsement exists
- Be conversational and helpful - avoid robotic language
- If documents don't fully answer the question, supplement with general knowledge and mention that clearly
- Be specific and actionable - these are busy sales professionals who need practical guidance
- Use bullet points or numbered lists for clarity when appropriate
- Keep paragraphs SHORT (1-3 sentences max) with line breaks between them

REMINDER: Every factual claim needs a [1], [2], or [3] citation. This is MANDATORY.

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
      'adjuster', 'repair', 'inspection', 'estimate', 'customer',
      'code', 'codes', 'building', 'irc', 'virginia', 'maryland', 'pennsylvania',
      'va', 'md', 'pa', 'matching', 'requirement', 'document', 'show me',
      'give me', 'find', 'search', 'license', 'certification', 'guideline'
    ];

    // Check if query contains any RAG-relevant keywords
    return ragKeywords.some(keyword => queryLower.includes(keyword));
  }
};
