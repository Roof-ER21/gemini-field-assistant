/**
 * Memory Service
 * Handles user memory extraction, storage, and retrieval
 * Enables Susan 21 to remember facts, preferences, and patterns across sessions
 */

import { getApiBaseUrl } from './config';
import { authService } from './authService';

// ============================================================================
// TYPES
// ============================================================================

export type MemoryType = 'fact' | 'preference' | 'pattern' | 'outcome' | 'context';
export type MemorySourceType = 'conversation' | 'explicit' | 'inferred' | 'feedback';
export type MemoryCategory =
  | 'insurer'
  | 'state'
  | 'damage_type'
  | 'style'
  | 'job'
  | 'communication'
  | 'expertise'
  | 'workflow'
  | 'company'
  | 'general';

export interface UserMemory {
  id: string;
  user_id: string;
  memory_type: MemoryType;
  category: MemoryCategory | string;
  key: string;
  value: string;
  confidence: number;
  source_type?: MemorySourceType;
  source_session_id?: string;
  source_message_id?: string;
  times_referenced: number;
  times_helpful: number;
  times_incorrect: number;
  created_at: string;
  last_accessed: string;
  last_updated: string;
  expires_at?: string;
}

export interface ConversationSummary {
  id: string;
  user_id: string;
  session_id: string;
  summary: string;
  key_facts: string[];
  decisions_reached: string[];
  open_questions: string[];
  action_items: string[];
  topics: string[];
  insurers_mentioned: string[];
  states_mentioned: string[];
  job_numbers_mentioned: string[];
  message_count: number;
  user_sentiment?: string;
  conversation_start?: string;
  conversation_end?: string;
  created_at: string;
}

export interface Message {
  id?: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp?: string | Date;
}

export interface ExtractedMemory {
  memory_type: MemoryType;
  category: MemoryCategory | string;
  key: string;
  value: string;
  confidence: number;
  source_type: MemorySourceType;
}

// ============================================================================
// MEMORY EXTRACTION PATTERNS
// ============================================================================

const EXTRACTION_PATTERNS = {
  // State patterns
  state: {
    patterns: [
      /\b(?:i(?:'m| am)|we(?:'re| are)|working) (?:in|from|based in) (virginia|maryland|pennsylvania|va|md|pa)\b/gi,
      /\b(?:my|our) (?:state|territory|area) (?:is|=) (virginia|maryland|pennsylvania|va|md|pa)\b/gi,
      /\b(virginia|maryland|pennsylvania|va|md|pa) (?:rep|territory|market|area)\b/gi,
    ],
    type: 'fact' as MemoryType,
    category: 'state' as MemoryCategory,
    key: 'primary_state',
    confidence: 0.9,
  },

  // Insurance company preferences
  insurer: {
    patterns: [
      /\b(?:i|we) (?:mostly|usually|often|frequently|primarily) (?:work with|deal with|handle|get) (state farm|usaa|allstate|liberty mutual|nationwide|farmers|progressive|geico|travelers|erie|amica)\b/gi,
      /\b(?:most of )?(?:my|our) claims (?:are|come from) (state farm|usaa|allstate|liberty mutual|nationwide|farmers|progressive|geico|travelers|erie|amica)\b/gi,
    ],
    type: 'fact' as MemoryType,
    category: 'insurer' as MemoryCategory,
    key: 'common_insurer',
    confidence: 0.85,
  },

  // Communication preferences
  response_style: {
    patterns: [
      /\b(?:i|we) (?:prefer|like|want) (?:short|brief|concise|detailed|thorough|comprehensive) (?:responses?|answers?)\b/gi,
      /\b(?:keep it|be) (?:short|brief|concise|detailed)\b/gi,
      /\b(?:give me|i need) (?:the|more) (?:short version|details?|full|complete)\b/gi,
    ],
    type: 'preference' as MemoryType,
    category: 'style' as MemoryCategory,
    key: 'response_style',
    confidence: 0.8,
  },

  // Company information
  company: {
    patterns: [
      /\b(?:my|our) company (?:is|=|:) ([a-zA-Z0-9\s&]+(?:roofing|construction|exteriors|contractors?))\b/gi,
      /\b(?:i|we) (?:work for|represent|am with|are with) ([a-zA-Z0-9\s&]+(?:roofing|construction|exteriors|contractors?))\b/gi,
    ],
    type: 'fact' as MemoryType,
    category: 'company' as MemoryCategory,
    key: 'company_name',
    confidence: 0.9,
  },

  // Expertise level indicators
  expertise: {
    patterns: [
      /\b(?:i(?:'m| am)|we(?:'re| are)) (?:new|just starting|a rookie|learning|experienced|veteran|senior)\b/gi,
      /\b(?:been doing this|in the business|selling roofs?) for (\d+) years?\b/gi,
    ],
    type: 'fact' as MemoryType,
    category: 'expertise' as MemoryCategory,
    key: 'experience_level',
    confidence: 0.85,
  },

  // Workflow patterns
  workflow: {
    patterns: [
      /\b(?:i|we) (?:always|usually|typically|never) (use|send|include|skip|avoid) (?:the )?([a-zA-Z\s]+(?:form|email|template|document|agreement))\b/gi,
    ],
    type: 'pattern' as MemoryType,
    category: 'workflow' as MemoryCategory,
    key: 'workflow_habit',
    confidence: 0.75,
  },

  // Job-related facts
  job_context: {
    patterns: [
      /\bjob (?:number |#)?(\d{4}-\d{4})/gi,
      /\b(?:working on|handling|looking at) (?:job |#)?(\d{4}-\d{4})/gi,
    ],
    type: 'context' as MemoryType,
    category: 'job' as MemoryCategory,
    key: 'mentioned_job',
    confidence: 0.95,
  },
};

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

class MemoryService {
  private static instance: MemoryService;
  private apiBaseUrl: string;
  private useLocalStorage: boolean = true;
  private memoryCache: Map<string, UserMemory[]> = new Map();

  private constructor() {
    this.apiBaseUrl = getApiBaseUrl();
    this.checkApiConnection();
  }

  static getInstance(): MemoryService {
    if (!MemoryService.instance) {
      MemoryService.instance = new MemoryService();
    }
    return MemoryService.instance;
  }

  private getAuthEmail(): string | null {
    const user = authService.getCurrentUser();
    return user?.email?.toLowerCase() || null;
  }

  private getHeaders(): HeadersInit {
    const email = this.getAuthEmail();
    return {
      'Content-Type': 'application/json',
      ...(email ? { 'x-user-email': email } : {}),
    };
  }

  private async checkApiConnection(): Promise<void> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/health`);
      if (response.ok) {
        this.useLocalStorage = false;
        console.log('[MemoryService] ✅ Connected to backend API');
      }
    } catch {
      console.log('[MemoryService] ⚠️ Using localStorage fallback');
      this.useLocalStorage = true;
    }
  }

  // ============================================================================
  // MEMORY EXTRACTION
  // ============================================================================

  /**
   * Extract memories from a conversation
   */
  extractMemoriesFromConversation(
    messages: Message[],
    sessionId?: string
  ): ExtractedMemory[] {
    const memories: ExtractedMemory[] = [];
    const seenKeys = new Set<string>();

    // Only process user messages for memory extraction
    const userMessages = messages.filter(m => m.sender === 'user');
    const fullText = userMessages.map(m => m.text).join(' ');

    for (const [patternName, config] of Object.entries(EXTRACTION_PATTERNS)) {
      for (const pattern of config.patterns) {
        const matches = Array.from(fullText.matchAll(pattern));

        for (const match of matches) {
          const extractedValue = match[1]?.trim();
          if (!extractedValue) continue;

          // Normalize state abbreviations
          let normalizedValue = extractedValue;
          if (config.category === 'state') {
            normalizedValue = this.normalizeState(extractedValue);
          }

          const memoryKey = `${config.key}_${normalizedValue}`.toLowerCase();

          // Skip if we've already extracted this memory
          if (seenKeys.has(memoryKey)) continue;
          seenKeys.add(memoryKey);

          memories.push({
            memory_type: config.type,
            category: config.category,
            key: config.key,
            value: normalizedValue,
            confidence: config.confidence,
            source_type: 'conversation',
          });
        }
      }
    }

    console.log(`[MemoryService] Extracted ${memories.length} memories from conversation`);
    return memories;
  }

  /**
   * Normalize state names to abbreviations
   */
  private normalizeState(state: string): string {
    const stateMap: Record<string, string> = {
      'virginia': 'VA',
      'maryland': 'MD',
      'pennsylvania': 'PA',
      'va': 'VA',
      'md': 'MD',
      'pa': 'PA',
    };
    return stateMap[state.toLowerCase()] || state.toUpperCase();
  }

  // ============================================================================
  // MEMORY STORAGE
  // ============================================================================

  /**
   * Save extracted memories to storage
   */
  async saveMemories(
    memories: ExtractedMemory[],
    sessionId?: string
  ): Promise<void> {
    const email = this.getAuthEmail();
    if (!email) {
      console.warn('[MemoryService] No authenticated user, skipping memory save');
      return;
    }

    if (this.useLocalStorage) {
      this.saveMemoriesLocally(memories, sessionId);
      return;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/memory`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          memories: memories.map(m => ({
            ...m,
            source_session_id: sessionId,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save memories');
      }

      console.log(`[MemoryService] Saved ${memories.length} memories to database`);
    } catch (error) {
      console.error('[MemoryService] API error, saving locally:', error);
      this.saveMemoriesLocally(memories, sessionId);
    }
  }

  private saveMemoriesLocally(memories: ExtractedMemory[], sessionId?: string): void {
    const email = this.getAuthEmail();
    if (!email) return;

    const storageKey = `user_memories_${email}`;
    const existing = this.getMemoriesFromLocalStorage(email);

    for (const memory of memories) {
      const existingIndex = existing.findIndex(
        m => m.memory_type === memory.memory_type &&
             m.category === memory.category &&
             m.key === memory.key
      );

      const newMemory: UserMemory = {
        id: crypto.randomUUID(),
        user_id: email,
        memory_type: memory.memory_type,
        category: memory.category,
        key: memory.key,
        value: memory.value,
        confidence: memory.confidence,
        source_type: memory.source_type,
        source_session_id: sessionId,
        times_referenced: 0,
        times_helpful: 0,
        times_incorrect: 0,
        created_at: new Date().toISOString(),
        last_accessed: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        // Update existing memory if new confidence is higher
        if (memory.confidence >= existing[existingIndex].confidence) {
          existing[existingIndex] = {
            ...existing[existingIndex],
            value: memory.value,
            confidence: memory.confidence,
            last_updated: new Date().toISOString(),
          };
        }
      } else {
        existing.push(newMemory);
      }
    }

    localStorage.setItem(storageKey, JSON.stringify(existing));
    this.memoryCache.set(email, existing);
  }

  private getMemoriesFromLocalStorage(email: string): UserMemory[] {
    try {
      const data = localStorage.getItem(`user_memories_${email}`);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  // ============================================================================
  // MEMORY RETRIEVAL
  // ============================================================================

  /**
   * Get relevant memories for a query
   */
  async getRelevantMemories(
    query: string,
    limit: number = 10
  ): Promise<UserMemory[]> {
    const email = this.getAuthEmail();
    if (!email) return [];

    if (this.useLocalStorage) {
      return this.getRelevantMemoriesLocally(query, limit);
    }

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/memory/relevant?query=${encodeURIComponent(query)}&limit=${limit}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch memories');
      }

      const memories = await response.json();
      return memories;
    } catch (error) {
      console.error('[MemoryService] API error, using local:', error);
      return this.getRelevantMemoriesLocally(query, limit);
    }
  }

  private getRelevantMemoriesLocally(query: string, limit: number): UserMemory[] {
    const email = this.getAuthEmail();
    if (!email) return [];

    const memories = this.getMemoriesFromLocalStorage(email);
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    // Score memories by relevance
    const scored = memories.map(memory => {
      let score = 0;

      // Check if query mentions the memory's value or category
      if (queryLower.includes(memory.value.toLowerCase())) {
        score += 10;
      }
      if (queryLower.includes(memory.category.toLowerCase())) {
        score += 5;
      }

      // Check for keyword matches
      const memoryWords = `${memory.key} ${memory.value} ${memory.category}`.toLowerCase().split(/\s+/);
      for (const queryWord of queryWords) {
        if (memoryWords.some(mw => mw.includes(queryWord))) {
          score += 2;
        }
      }

      // Boost by confidence and usage
      score *= memory.confidence;
      score += memory.times_helpful * 0.5;
      score -= memory.times_incorrect * 1;

      return { memory, score };
    });

    // Sort by score and return top results
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.memory);
  }

  /**
   * Get all user memories for context building
   */
  async getAllUserMemories(limit: number = 20): Promise<UserMemory[]> {
    const email = this.getAuthEmail();
    if (!email) return [];

    if (this.useLocalStorage) {
      const memories = this.getMemoriesFromLocalStorage(email);
      return memories
        .filter(m => m.confidence >= 0.7)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, limit);
    }

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/memory?limit=${limit}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch memories');
      }

      return await response.json();
    } catch (error) {
      console.error('[MemoryService] API error:', error);
      return this.getMemoriesFromLocalStorage(email).slice(0, limit);
    }
  }

  // ============================================================================
  // CONTEXT BUILDING
  // ============================================================================

  /**
   * Build a context string from user memories for the system prompt
   */
  async buildUserContext(): Promise<string> {
    const memories = await this.getAllUserMemories(15);

    if (memories.length === 0) {
      return '';
    }

    // Group memories by type
    const grouped: Record<string, UserMemory[]> = {};
    for (const memory of memories) {
      const type = memory.memory_type;
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(memory);
    }

    let context = '\n[USER MEMORY CONTEXT]\nWhat you know about this user:\n';

    // Facts first (most important)
    if (grouped.fact) {
      for (const m of grouped.fact) {
        context += `- ${this.formatMemoryForContext(m)}\n`;
      }
    }

    // Then preferences
    if (grouped.preference) {
      context += '\nPreferences:\n';
      for (const m of grouped.preference) {
        context += `- ${this.formatMemoryForContext(m)}\n`;
      }
    }

    // Then patterns
    if (grouped.pattern) {
      context += '\nObserved patterns:\n';
      for (const m of grouped.pattern) {
        context += `- ${this.formatMemoryForContext(m)}\n`;
      }
    }

    // Then outcomes (if any)
    if (grouped.outcome) {
      context += '\nPast outcomes:\n';
      for (const m of grouped.outcome) {
        context += `- ${this.formatMemoryForContext(m)}\n`;
      }
    }

    return context;
  }

  private formatMemoryForContext(memory: UserMemory): string {
    const categoryLabels: Record<string, string> = {
      state: 'Works in',
      insurer: 'Common insurer',
      company: 'Company',
      expertise: 'Experience',
      style: 'Prefers',
      workflow: 'Workflow',
      job: 'Job context',
    };

    const label = categoryLabels[memory.category] || memory.category;
    return `${label}: ${memory.value}`;
  }

  // ============================================================================
  // MEMORY FEEDBACK
  // ============================================================================

  /**
   * Update memory confidence based on feedback
   */
  async updateMemoryFeedback(
    memoryId: string,
    feedback: 'helpful' | 'incorrect' | 'outdated'
  ): Promise<void> {
    if (this.useLocalStorage) {
      this.updateMemoryFeedbackLocally(memoryId, feedback);
      return;
    }

    try {
      await fetch(`${this.apiBaseUrl}/memory/${memoryId}/feedback`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ feedback }),
      });
    } catch (error) {
      console.error('[MemoryService] Error updating feedback:', error);
      this.updateMemoryFeedbackLocally(memoryId, feedback);
    }
  }

  private updateMemoryFeedbackLocally(memoryId: string, feedback: string): void {
    const email = this.getAuthEmail();
    if (!email) return;

    const memories = this.getMemoriesFromLocalStorage(email);
    const memory = memories.find(m => m.id === memoryId);

    if (memory) {
      if (feedback === 'helpful') {
        memory.times_helpful++;
        memory.confidence = Math.min(1, memory.confidence + 0.1);
      } else if (feedback === 'incorrect') {
        memory.times_incorrect++;
        memory.confidence = Math.max(0, memory.confidence - 0.3);
      } else if (feedback === 'outdated') {
        memory.confidence = Math.max(0, memory.confidence - 0.2);
      }
      memory.last_updated = new Date().toISOString();

      localStorage.setItem(`user_memories_${email}`, JSON.stringify(memories));
    }
  }

  /**
   * Delete a specific memory
   */
  async deleteMemory(memoryId: string): Promise<void> {
    if (this.useLocalStorage) {
      const email = this.getAuthEmail();
      if (!email) return;

      const memories = this.getMemoriesFromLocalStorage(email);
      const filtered = memories.filter(m => m.id !== memoryId);
      localStorage.setItem(`user_memories_${email}`, JSON.stringify(filtered));
      return;
    }

    try {
      await fetch(`${this.apiBaseUrl}/memory/${memoryId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
    } catch (error) {
      console.error('[MemoryService] Error deleting memory:', error);
    }
  }

  // ============================================================================
  // CONVERSATION SUMMARIES
  // ============================================================================

  /**
   * Save a conversation summary
   */
  async saveConversationSummary(
    sessionId: string,
    summary: Partial<ConversationSummary>
  ): Promise<void> {
    const email = this.getAuthEmail();
    if (!email) return;

    if (this.useLocalStorage) {
      const storageKey = `conversation_summaries_${email}`;
      const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');

      const summaryRecord: ConversationSummary = {
        id: crypto.randomUUID(),
        user_id: email,
        session_id: sessionId,
        summary: summary.summary || '',
        key_facts: summary.key_facts || [],
        decisions_reached: summary.decisions_reached || [],
        open_questions: summary.open_questions || [],
        action_items: summary.action_items || [],
        topics: summary.topics || [],
        insurers_mentioned: summary.insurers_mentioned || [],
        states_mentioned: summary.states_mentioned || [],
        job_numbers_mentioned: summary.job_numbers_mentioned || [],
        message_count: summary.message_count || 0,
        user_sentiment: summary.user_sentiment,
        conversation_start: summary.conversation_start,
        conversation_end: summary.conversation_end,
        created_at: new Date().toISOString(),
      };

      // Update or add
      const existingIndex = existing.findIndex((s: ConversationSummary) => s.session_id === sessionId);
      if (existingIndex >= 0) {
        existing[existingIndex] = summaryRecord;
      } else {
        existing.unshift(summaryRecord);
      }

      // Keep last 50 summaries
      localStorage.setItem(storageKey, JSON.stringify(existing.slice(0, 50)));
      return;
    }

    try {
      await fetch(`${this.apiBaseUrl}/memory/summaries`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ session_id: sessionId, ...summary }),
      });
    } catch (error) {
      console.error('[MemoryService] Error saving summary:', error);
    }
  }

  /**
   * Get conversation summaries for context
   */
  async getConversationSummaries(limit: number = 5): Promise<ConversationSummary[]> {
    const email = this.getAuthEmail();
    if (!email) return [];

    if (this.useLocalStorage) {
      const storageKey = `conversation_summaries_${email}`;
      const summaries = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return summaries.slice(0, limit);
    }

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/memory/summaries?limit=${limit}`,
        { headers: this.getHeaders() }
      );
      return response.ok ? await response.json() : [];
    } catch {
      return [];
    }
  }
}

// Export singleton instance
export const memoryService = MemoryService.getInstance();
export default memoryService;
