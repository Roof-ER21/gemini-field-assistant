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
 * Intelligently add citations to text if AI forgot them
 * This analyzes the text and adds [1], [2], [3] after factual statements
 *
 * @param text AI response without citations
 * @param sources Source documents
 * @returns Text with citations added
 */
export function enforceCitations(text: string, sources: SearchResult[]): string {
  // If already has citations, return as-is
  if (hasCitations(text)) {
    return text;
  }

  // If no sources, return as-is
  if (sources.length === 0) {
    return text;
  }

  console.log('[Citation Enforcer] AI forgot citations - adding them automatically');

  // Strategy: Add citations after sentences that mention document content
  let enhancedText = text;

  sources.forEach((source, index) => {
    const citationNum = index + 1;
    const docName = source.document.name;
    const category = source.document.category;

    // Extract key phrases from document name
    const keywords = extractKeywords(docName, category);

    // For each keyword, add citation after first mention
    keywords.forEach(keyword => {
      const pattern = new RegExp(
        `(${escapeRegex(keyword)}[^.!?]*[.!?])(?!.*\\[\\d+\\])`,
        'i'
      );

      enhancedText = enhancedText.replace(pattern, (match) => {
        // Check if this sentence already has a citation
        if (/\[\d+\]/.test(match)) {
          return match;
        }
        // Add citation before the ending punctuation
        return match.replace(/([.!?])$/, ` [${citationNum}]$1`);
      });
    });
  });

  // If still no citations added, add a generic one at the end of first paragraph
  if (!hasCitations(enhancedText)) {
    const firstParagraphEnd = enhancedText.search(/\n\n|$/);
    if (firstParagraphEnd > 0) {
      enhancedText =
        enhancedText.slice(0, firstParagraphEnd) +
        ` [1]` +
        enhancedText.slice(firstParagraphEnd);
    }
  }

  return enhancedText;
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
