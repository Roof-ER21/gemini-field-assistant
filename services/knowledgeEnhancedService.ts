/**
 * Enhanced Knowledge Service
 * Provides advanced features: full-text search, history, favorites, sharing
 */

import { knowledgeService, Document, DocumentContent, SearchResult } from './knowledgeService';

interface DocumentHistory {
  documentPath: string;
  viewedAt: Date;
  viewCount: number;
}

interface DocumentBookmark {
  documentPath: string;
  bookmarkedAt: Date;
  note?: string;
}

interface SearchOptions {
  searchInContent?: boolean;
  category?: string;
  limit?: number;
}

export class EnhancedKnowledgeService {
  private static STORAGE_KEYS = {
    HISTORY: 'knowledge_history',
    FAVORITES: 'knowledge_favorites',
    PREFERENCES: 'knowledge_preferences',
    GO_TO: 'knowledge_go_to'
  };

  /**
   * Full-text search across document titles and content
   */
  async searchDocuments(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const {
      searchInContent = true,
      category,
      limit = 20
    } = options;

    if (!query.trim()) {
      return [];
    }

    const allDocs = await knowledgeService.getDocumentIndex();
    const searchQuery = query.toLowerCase();
    const results: SearchResult[] = [];

    // Filter by category if specified
    const docsToSearch = category
      ? allDocs.filter(doc => doc.category === category)
      : allDocs;

    for (const doc of docsToSearch) {
      let relevance = 0;
      let snippet = '';

      // Search in document name (higher weight)
      if (doc.name.toLowerCase().includes(searchQuery)) {
        relevance += 10;
        snippet = doc.name;
      }

      // Search in category
      if (doc.category?.toLowerCase().includes(searchQuery)) {
        relevance += 5;
      }

      // Search in content if enabled
      if (searchInContent && relevance < 15) {
        try {
          const content = await knowledgeService.loadDocument(doc.path);
          const contentLower = content.content.toLowerCase();

          if (contentLower.includes(searchQuery)) {
            // Find the context around the match
            const index = contentLower.indexOf(searchQuery);
            const start = Math.max(0, index - 100);
            const end = Math.min(content.content.length, index + 100);
            snippet = '...' + content.content.substring(start, end) + '...';
            relevance += 3;

            // Count occurrences for better ranking
            const occurrences = (contentLower.match(new RegExp(searchQuery, 'g')) || []).length;
            relevance += Math.min(occurrences, 5);
          }
        } catch (error) {
          console.warn(`Could not search content of ${doc.name}:`, error);
        }
      }

      if (relevance > 0) {
        results.push({
          document: doc,
          relevance,
          score: relevance, // Alias for relevance to match SearchResult type
          snippet: snippet || doc.category || 'No preview available'
        });
      }
    }

    // Sort by relevance and limit results
    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  /**
   * Track document view in history
   */
  trackDocumentView(documentPath: string): void {
    const history = this.getHistory();
    const existing = history.find(h => h.documentPath === documentPath);

    if (existing) {
      existing.viewedAt = new Date();
      existing.viewCount++;
    } else {
      history.unshift({
        documentPath,
        viewedAt: new Date(),
        viewCount: 1
      });
    }

    // Keep only last 50 items
    const trimmedHistory = history.slice(0, 50);
    this.saveHistory(trimmedHistory);
  }

  /**
   * Get document view history
   */
  getHistory(): DocumentHistory[] {
    try {
      const stored = localStorage.getItem(EnhancedKnowledgeService.STORAGE_KEYS.HISTORY);
      if (!stored) return [];

      const history = JSON.parse(stored);
      return history.map((h: any) => ({
        ...h,
        viewedAt: new Date(h.viewedAt)
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get recently viewed documents
   */
  async getRecentDocuments(limit: number = 10): Promise<Document[]> {
    const history = this.getHistory();
    const allDocs = await knowledgeService.getDocumentIndex();

    return history
      .slice(0, limit)
      .map(h => allDocs.find(d => d.path === h.documentPath))
      .filter((d): d is Document => d !== undefined);
  }

  /**
   * Add document to favorites
   */
  addToFavorites(documentPath: string, note?: string): void {
    const favorites = this.getFavorites();

    // Check if already favorited
    if (favorites.some(f => f.documentPath === documentPath)) {
      return;
    }

    favorites.unshift({
      documentPath,
      bookmarkedAt: new Date(),
      note
    });

    this.saveFavorites(favorites);
  }

  /**
   * Remove document from favorites
   */
  removeFromFavorites(documentPath: string): void {
    const favorites = this.getFavorites().filter(f => f.documentPath !== documentPath);
    this.saveFavorites(favorites);
  }

  /**
   * Check if document is favorited
   */
  isFavorited(documentPath: string): boolean {
    return this.getFavorites().some(f => f.documentPath === documentPath);
  }

  /**
   * Get all favorite documents
   */
  async getFavoriteDocuments(): Promise<Document[]> {
    const favorites = this.getFavorites();
    const allDocs = await knowledgeService.getDocumentIndex();

    return favorites
      .map(f => allDocs.find(d => d.path === f.documentPath))
      .filter((d): d is Document => d !== undefined);
  }

  /**
   * Go-To collection management (pinned quick-access docs)
   */
  addToGoTo(documentPath: string): void {
    const items = this.getGoTo();
    if (!items.includes(documentPath)) {
      items.unshift(documentPath);
      this.saveGoTo(items);
    }
  }

  removeFromGoTo(documentPath: string): void {
    const items = this.getGoTo().filter(p => p !== documentPath);
    this.saveGoTo(items);
  }

  isGoTo(documentPath: string): boolean {
    return this.getGoTo().includes(documentPath);
  }

  getGoTo(): string[] {
    try {
      const raw = localStorage.getItem(EnhancedKnowledgeService.STORAGE_KEYS.GO_TO);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveGoTo(items: string[]): void {
    try {
      localStorage.setItem(EnhancedKnowledgeService.STORAGE_KEYS.GO_TO, JSON.stringify(items.slice(0, 50)));
    } catch {}
  }

  async getGoToDocuments(): Promise<Document[]> {
    const paths = this.getGoTo();
    const allDocs = await knowledgeService.getDocumentIndex();
    const map = new Map(allDocs.map(d => [d.path, d] as const));
    return paths.map(p => map.get(p)).filter((d): d is Document => !!d);
  }

  /**
   * Get favorites list
   */
  getFavorites(): DocumentBookmark[] {
    try {
      const stored = localStorage.getItem(EnhancedKnowledgeService.STORAGE_KEYS.FAVORITES);
      if (!stored) return [];

      const favorites = JSON.parse(stored);
      return favorites.map((f: any) => ({
        ...f,
        bookmarkedAt: new Date(f.bookmarkedAt)
      }));
    } catch {
      return [];
    }
  }

  /**
   * Generate shareable link to document
   */
  generateShareLink(documentPath: string): string {
    const baseUrl = window.location.origin;
    const encodedPath = encodeURIComponent(documentPath);
    return `${baseUrl}/knowledge?doc=${encodedPath}`;
  }

  /**
   * Parse document path from URL
   */
  parseDocumentFromUrl(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('doc');
  }

  /**
   * Extract table of contents from markdown
   */
  extractTableOfContents(content: string): { level: number; text: string; id: string }[] {
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const toc: { level: number; text: string; id: string }[] = [];
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      toc.push({ level, text, id });
    }

    return toc;
  }

  /**
   * Get all unique categories
   */
  async getCategories(): Promise<string[]> {
    const docs = await knowledgeService.getDocumentIndex();
    const categories = new Set(docs.map(d => d.category).filter((c): c is string => !!c));
    return Array.from(categories).sort();
  }

  /**
   * Clear all history
   */
  clearHistory(): void {
    localStorage.removeItem(EnhancedKnowledgeService.STORAGE_KEYS.HISTORY);
  }

  /**
   * Clear all favorites
   */
  clearFavorites(): void {
    localStorage.removeItem(EnhancedKnowledgeService.STORAGE_KEYS.FAVORITES);
  }

  // Private helper methods
  private saveHistory(history: DocumentHistory[]): void {
    try {
      localStorage.setItem(
        EnhancedKnowledgeService.STORAGE_KEYS.HISTORY,
        JSON.stringify(history)
      );
    } catch (error) {
      console.error('Failed to save history:', error);
    }
  }

  private saveFavorites(favorites: DocumentBookmark[]): void {
    try {
      localStorage.setItem(
        EnhancedKnowledgeService.STORAGE_KEYS.FAVORITES,
        JSON.stringify(favorites)
      );
    } catch (error) {
      console.error('Failed to save favorites:', error);
    }
  }
}

// Export singleton instance
export const enhancedKnowledgeService = new EnhancedKnowledgeService();
