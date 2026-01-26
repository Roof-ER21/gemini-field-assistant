/**
 * Citation Enforcer - Automatically adds citations if AI forgets
 * This is a fallback mechanism to ensure citations always appear
 */

import { SearchResult } from './knowledgeService';

/**
 * Check if AI response has proper citations
 * @param text AI response text
 * @returns true if text has [1], [2], [3] citations
 */
export function hasCitations(text: string): boolean {
  const citationPattern = /\[\d+\]/;
  return citationPattern.test(text);
}

/**
 * Count how many citations should be present based on sources
 * @param sources Source documents array
 * @returns Expected number of citations
 */
export function getExpectedCitationCount(sources: SearchResult[]): number {
  return sources.length;
}

/**
 * Calculate relevance score between text and document content
 * @param text Text to match against
 * @param docContent Document content to search
 * @param docName Document name for keyword matching
 * @returns Relevance score (0-100)
 */
function calculateRelevance(text: string, docContent: string, docName: string): number {
  const textLower = text.toLowerCase();
  const contentLower = docContent.toLowerCase();
  const nameLower = docName.toLowerCase();
  let score = 0;

  // Check for key terms in text that match document content
  const keyTermPatterns = [
    { pattern: /IRC\s*R?\d+(\.\d+)?/gi, weight: 20 },      // IRC codes
    { pattern: /MHIC/gi, weight: 15 },                     // Maryland license
    { pattern: /GAF|CertainTeed/gi, weight: 15 },          // Manufacturers
    { pattern: /matching|uniform appearance/gi, weight: 15 }, // Key concepts
    { pattern: /maryland|virginia|pennsylvania|va|md|pa/gi, weight: 10 }, // States
    { pattern: /permit|code|requirement|compliance/gi, weight: 10 }, // Compliance terms
    { pattern: /warranty|replacement|repair/gi, weight: 10 }, // Action terms
    { pattern: /brittle|age|condition/gi, weight: 10 },    // Condition terms
  ];

  // Score based on term matches between text and document
  for (const { pattern, weight } of keyTermPatterns) {
    const textMatches = textLower.match(pattern) || [];
    const docMatches = contentLower.match(pattern) || nameLower.match(pattern) || [];

    // If both text and doc have the term, add weight
    if (textMatches.length > 0 && docMatches.length > 0) {
      score += weight;
    }
  }

  // Bonus for document name appearing in text
  const nameWords = nameLower.split(/[\s-_]+/).filter(w => w.length > 3);
  for (const word of nameWords) {
    if (textLower.includes(word)) {
      score += 5;
    }
  }

  return Math.min(score, 100);
}

/**
 * Find the best matching citation for a piece of text
 * @param text Text to find citation for
 * @param sources Available source documents
 * @returns Best citation index (1-based) and its score
 */
function findBestCitation(text: string, sources: SearchResult[]): { index: number; score: number } {
  if (sources.length === 0) {
    return { index: 1, score: 0 };
  }

  let bestIndex = 1;
  let bestScore = 0;

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const score = calculateRelevance(text, source.content, source.document.name);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i + 1; // 1-based index for citations
    }
  }

  return { index: bestIndex, score: bestScore };
}

/**
 * Intelligently add citations to text if AI forgot them
 * Uses content analysis to match text with relevant documents
 *
 * @param text AI response without citations
 * @param sources Source documents
 * @returns Text with citations added
 */
export function enforceCitations(text: string, sources: SearchResult[]): string {
  // If no sources, return as-is
  if (sources.length === 0) {
    return text;
  }

  // If already has citations, return as-is (AI did its job!)
  if (hasCitations(text)) {
    console.log('[Citation Enforcer] ✓ AI already included citations - no enforcement needed');
    return text;
  }

  console.log('[Citation Enforcer] AI forgot citations - adding them with smart matching');

  // Split into paragraphs for analysis
  const paragraphs = text.split(/\n\n+/);

  if (paragraphs.length === 0) {
    return text;
  }

  // Track which sources have been cited
  const citedSources = new Set<number>();
  const enhancedParagraphs: string[] = [];

  for (const paragraph of paragraphs) {
    // Skip short paragraphs (likely headers or single-line items)
    if (paragraph.length < 50) {
      enhancedParagraphs.push(paragraph);
      continue;
    }

    // Find best matching citation for this paragraph
    const { index, score } = findBestCitation(paragraph, sources);

    // Only add citation if relevance score is high enough
    if (score >= 15) {
      // Add citation at end of first sentence or end of paragraph
      const enhanced = paragraph.replace(/([.!?])\s*$/, ` [${index}]$1`);
      enhancedParagraphs.push(enhanced);
      citedSources.add(index);
    } else {
      enhancedParagraphs.push(paragraph);
    }
  }

  // If we haven't cited any sources yet, add the most relevant one to the first substantial paragraph
  if (citedSources.size === 0 && enhancedParagraphs.length > 0) {
    for (let i = 0; i < enhancedParagraphs.length; i++) {
      if (enhancedParagraphs[i].length > 50) {
        const { index } = findBestCitation(enhancedParagraphs[i], sources);
        enhancedParagraphs[i] = enhancedParagraphs[i].replace(/([.!?])\s*$/, ` [${index}]$1`);
        break;
      }
    }
  }

  console.log(`[Citation Enforcer] Added citations for ${citedSources.size} source(s)`);
  return enhancedParagraphs.join('\n\n');
}

/**
 * Extract keywords from document name and category
 */
function extractKeywords(docName: string, category: string): string[] {
  const keywords: string[] = [];

  // Common patterns in document names
  const patterns = [
    /IRC\s+R?\d+(\.\d+)?/gi,  // IRC R908.3
    /MHIC/gi,                   // MHIC
    /GAF/gi,                    // GAF
    /Maryland|Virginia|Pennsylvania/gi,  // States
    /matching|requirement|code|guideline/gi,  // Key terms
  ];

  patterns.forEach(pattern => {
    const matches = docName.match(pattern);
    if (matches) {
      keywords.push(...matches);
    }
  });

  // Add category if meaningful
  if (category && category !== 'General') {
    keywords.push(category);
  }

  // Extract significant words from document name (3+ chars)
  const words = docName
    .split(/[\s-_]+/)
    .filter(w => w.length >= 3 && !/^(the|and|for|with)$/i.test(w));

  keywords.push(...words.slice(0, 3)); // Take top 3 words

  return [...new Set(keywords)]; // Remove duplicates
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Smart citation validator - checks if citations make sense
 * @param text Text with citations
 * @param sources Source documents
 * @returns Validation result with suggestions
 */
export function validateCitations(
  text: string,
  sources: SearchResult[]
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Extract all citations from text
  const citations = text.match(/\[(\d+)\]/g) || [];
  const citationNumbers = citations.map(c => parseInt(c.match(/\d+/)?.[0] || '0'));

  // Check if citations are within valid range
  const maxCitation = Math.max(...citationNumbers);
  if (maxCitation > sources.length) {
    issues.push(`Citation [${maxCitation}] exceeds available sources (${sources.length})`);
  }

  // Check if all sources are cited at least once
  for (let i = 1; i <= sources.length; i++) {
    if (!citationNumbers.includes(i)) {
      issues.push(`Source ${i} (${sources[i-1].document.name}) is never cited`);
    }
  }

  // Check for citation density (should have at least 1 citation per 2 sentences)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const expectedMinCitations = Math.floor(sentences.length / 2);
  if (citations.length < expectedMinCitations) {
    issues.push(
      `Low citation density: ${citations.length} citations for ${sentences.length} sentences ` +
      `(expected at least ${expectedMinCitations})`
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
