/**
 * Job Context Service
 * Handles job-conversation linking and context recall
 * Enables Susan 21 to remember past job discussions and decisions
 */

import { getApiBaseUrl } from './config';
import { authService } from './authService';
import { jobService } from './jobService';
import { Job } from '../types/job';

// ============================================================================
// TYPES
// ============================================================================

export interface JobConversationLink {
  id: string;
  job_id: string;
  summary_id: string;
  user_id: string;
  link_type: 'discussed' | 'created_from' | 'referenced';
  relevance_score: number;
  job_specific_decisions: string[];
  created_at: string;
}

export interface JobConversationSummary {
  session_id: string;
  summary: string;
  key_decisions: string[];
  timestamp: string;
  topics: string[];
}

export interface DetectedJobContext {
  job: Job;
  match_type: 'job_number' | 'customer_name' | 'address' | 'claim_number';
  match_text: string;
  confidence: number;
}

// ============================================================================
// JOB DETECTION PATTERNS
// ============================================================================

const JOB_DETECTION_PATTERNS = {
  // Job number patterns (e.g., 2024-0042, job #42, job 42)
  job_number: [
    /\bjob\s*(?:#|number|num)?\s*(\d{4}-\d{4})\b/gi,
    /\b(\d{4}-\d{4})\s*job\b/gi,
    /\bjob\s*(?:#|number|num)?\s*(\d{1,4})\b/gi,
    /\b#(\d{4}-\d{4})\b/gi,
  ],

  // Customer name patterns (more generic)
  customer_name: [
    /\b(?:customer|homeowner|client|mr\.?|mrs\.?|ms\.?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'s\s+(?:house|home|property|roof|job|claim)\b/g,
  ],

  // Address patterns
  address: [
    /\b(\d+\s+[A-Z][a-zA-Z\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|way|boulevard|blvd))\b/gi,
  ],

  // Claim number patterns
  claim_number: [
    /\bclaim\s*(?:#|number|num)?\s*([A-Z0-9-]+)\b/gi,
    /\b([A-Z]{2,3}-?\d{6,12})\b/g, // Common claim formats
  ],
};

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

class JobContextService {
  private static instance: JobContextService;
  private apiBaseUrl: string;
  private useLocalStorage: boolean = true;
  private jobSummaryCache: Map<string, JobConversationSummary[]> = new Map();

  private constructor() {
    this.apiBaseUrl = getApiBaseUrl();
    this.checkApiConnection();
  }

  static getInstance(): JobContextService {
    if (!JobContextService.instance) {
      JobContextService.instance = new JobContextService();
    }
    return JobContextService.instance;
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
        console.log('[JobContextService] ✅ Connected to backend API');
      }
    } catch {
      console.log('[JobContextService] ⚠️ Using localStorage fallback');
      this.useLocalStorage = true;
    }
  }

  // ============================================================================
  // JOB DETECTION
  // ============================================================================

  /**
   * Detect job mentions in a query and return matching job(s)
   */
  async detectJobMention(query: string): Promise<DetectedJobContext | null> {
    const email = this.getAuthEmail();
    if (!email) return null;

    // Get all user's jobs for matching
    const jobs = jobService.getAllJobs();
    if (jobs.length === 0) return null;

    const detections: DetectedJobContext[] = [];

    // Check for job number matches
    for (const pattern of JOB_DETECTION_PATTERNS.job_number) {
      const matches = Array.from(query.matchAll(pattern));
      for (const match of matches) {
        const jobNumberMatch = match[1];

        // Try to find exact match first
        let job = jobs.find(j =>
          j.jobNumber.toLowerCase() === jobNumberMatch.toLowerCase()
        );

        // If no exact match, try partial match (e.g., "42" matches "2024-0042")
        if (!job && /^\d{1,4}$/.test(jobNumberMatch)) {
          job = jobs.find(j =>
            j.jobNumber.endsWith(`-${jobNumberMatch.padStart(4, '0')}`)
          );
        }

        if (job) {
          detections.push({
            job,
            match_type: 'job_number',
            match_text: jobNumberMatch,
            confidence: 0.95,
          });
        }
      }
    }

    // Check for customer name matches
    for (const pattern of JOB_DETECTION_PATTERNS.customer_name) {
      const matches = Array.from(query.matchAll(pattern));
      for (const match of matches) {
        const customerName = match[1].toLowerCase();

        const job = jobs.find(j =>
          j.customer.name.toLowerCase().includes(customerName)
        );

        if (job) {
          detections.push({
            job,
            match_type: 'customer_name',
            match_text: match[1],
            confidence: 0.8,
          });
        }
      }
    }

    // Check for address matches
    for (const pattern of JOB_DETECTION_PATTERNS.address) {
      const matches = Array.from(query.matchAll(pattern));
      for (const match of matches) {
        const address = match[1].toLowerCase();

        const job = jobs.find(j =>
          j.property.address.toLowerCase().includes(address)
        );

        if (job) {
          detections.push({
            job,
            match_type: 'address',
            match_text: match[1],
            confidence: 0.85,
          });
        }
      }
    }

    // Check for claim number matches
    for (const pattern of JOB_DETECTION_PATTERNS.claim_number) {
      const matches = Array.from(query.matchAll(pattern));
      for (const match of matches) {
        const claimNumber = match[1].toLowerCase();

        const job = jobs.find(j =>
          j.insurance?.claimNumber?.toLowerCase().includes(claimNumber)
        );

        if (job) {
          detections.push({
            job,
            match_type: 'claim_number',
            match_text: match[1],
            confidence: 0.9,
          });
        }
      }
    }

    // Return highest confidence match
    if (detections.length === 0) return null;

    detections.sort((a, b) => b.confidence - a.confidence);
    return detections[0];
  }

  // ============================================================================
  // CONVERSATION HISTORY
  // ============================================================================

  /**
   * Get conversation history summaries for a job
   */
  async getJobConversationHistory(jobId: string): Promise<JobConversationSummary[]> {
    // Check cache first
    if (this.jobSummaryCache.has(jobId)) {
      return this.jobSummaryCache.get(jobId) || [];
    }

    if (this.useLocalStorage) {
      return this.getJobConversationHistoryLocally(jobId);
    }

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/jobs/${jobId}/conversations`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch job conversations');
      }

      const summaries = await response.json();
      this.jobSummaryCache.set(jobId, summaries);
      return summaries;
    } catch (error) {
      console.error('[JobContextService] API error:', error);
      return this.getJobConversationHistoryLocally(jobId);
    }
  }

  private getJobConversationHistoryLocally(jobId: string): JobConversationSummary[] {
    const email = this.getAuthEmail();
    if (!email) return [];

    try {
      const storageKey = `job_conversations_${email}`;
      const allLinks = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return allLinks[jobId] || [];
    } catch {
      return [];
    }
  }

  // ============================================================================
  // CONVERSATION LINKING
  // ============================================================================

  /**
   * Link a conversation summary to a job
   */
  async linkConversationToJob(
    sessionId: string,
    jobId: string,
    summary: string,
    keyDecisions?: string[],
    topics?: string[]
  ): Promise<void> {
    const email = this.getAuthEmail();
    if (!email) return;

    const conversationSummary: JobConversationSummary = {
      session_id: sessionId,
      summary,
      key_decisions: keyDecisions || [],
      timestamp: new Date().toISOString(),
      topics: topics || [],
    };

    if (this.useLocalStorage) {
      this.linkConversationLocallyy(jobId, conversationSummary);
      return;
    }

    try {
      await fetch(`${this.apiBaseUrl}/jobs/${jobId}/conversations`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          session_id: sessionId,
          summary,
          key_decisions: keyDecisions,
          topics,
        }),
      });

      // Update cache
      const cached = this.jobSummaryCache.get(jobId) || [];
      cached.unshift(conversationSummary);
      this.jobSummaryCache.set(jobId, cached.slice(0, 20));

      console.log(`[JobContextService] Linked conversation to job ${jobId}`);
    } catch (error) {
      console.error('[JobContextService] Error linking conversation:', error);
      this.linkConversationLocallyy(jobId, conversationSummary);
    }
  }

  private linkConversationLocallyy(jobId: string, summary: JobConversationSummary): void {
    const email = this.getAuthEmail();
    if (!email) return;

    try {
      const storageKey = `job_conversations_${email}`;
      const allLinks = JSON.parse(localStorage.getItem(storageKey) || '{}');

      if (!allLinks[jobId]) {
        allLinks[jobId] = [];
      }

      // Add to beginning, keep last 20
      allLinks[jobId].unshift(summary);
      allLinks[jobId] = allLinks[jobId].slice(0, 20);

      localStorage.setItem(storageKey, JSON.stringify(allLinks));

      // Update cache
      this.jobSummaryCache.set(jobId, allLinks[jobId]);
    } catch (error) {
      console.error('[JobContextService] Error saving locally:', error);
    }
  }

  /**
   * Automatically detect and link job context from messages
   */
  async autoLinkJobFromMessages(
    sessionId: string,
    messages: Array<{ sender: string; text: string }>,
    summary?: string
  ): Promise<Job | null> {
    // Combine all messages for detection
    const fullText = messages.map(m => m.text).join(' ');

    const detection = await this.detectJobMention(fullText);

    if (detection && detection.confidence >= 0.8) {
      // Extract topics from messages
      const topics = this.extractTopics(fullText);

      // Extract key decisions (look for action words)
      const decisions = this.extractDecisions(messages);

      await this.linkConversationToJob(
        sessionId,
        detection.job.id,
        summary || `Discussion about ${detection.match_type}: ${detection.match_text}`,
        decisions,
        topics
      );

      return detection.job;
    }

    return null;
  }

  private extractTopics(text: string): string[] {
    const topics: string[] = [];
    const textLower = text.toLowerCase();

    const topicPatterns: Record<string, RegExp> = {
      'insurance': /\b(insurance|claim|adjuster|coverage|deductible|supplement)\b/i,
      'inspection': /\b(inspection|inspect|assessment|evaluate)\b/i,
      'estimate': /\b(estimate|pricing|quote|cost|amount)\b/i,
      'damage': /\b(damage|hail|wind|storm|leak|missing)\b/i,
      'repair': /\b(repair|fix|replace|replacement)\b/i,
      'scheduling': /\b(schedule|appointment|date|time|when)\b/i,
      'documentation': /\b(document|photo|evidence|report)\b/i,
      'negotiation': /\b(negotiate|dispute|argue|fight|appeal)\b/i,
    };

    for (const [topic, pattern] of Object.entries(topicPatterns)) {
      if (pattern.test(textLower)) {
        topics.push(topic);
      }
    }

    return topics;
  }

  private extractDecisions(messages: Array<{ sender: string; text: string }>): string[] {
    const decisions: string[] = [];

    const decisionPatterns = [
      /\b(?:decided to|going to|will|let's|agreed to) ([^.!?]+)/gi,
      /\b(?:the plan is to|strategy is to) ([^.!?]+)/gi,
      /\b(?:next step[s]? (?:is|are|:)) ([^.!?]+)/gi,
    ];

    for (const message of messages) {
      for (const pattern of decisionPatterns) {
        const matches = Array.from(message.text.matchAll(pattern));
        for (const match of matches) {
          const decision = match[1].trim();
          if (decision.length > 10 && decision.length < 200) {
            decisions.push(decision);
          }
        }
      }
    }

    return decisions.slice(0, 5); // Keep top 5 decisions
  }

  // ============================================================================
  // CONTEXT BUILDING
  // ============================================================================

  /**
   * Build context string for a detected or specified job
   */
  async buildJobContext(job: Job): Promise<string> {
    let context = '\n[JOB CONTEXT]\n';
    context += `Active job: ${job.jobNumber} - ${job.title}\n`;

    // Basic job info
    context += `Customer: ${job.customer.name}`;
    if (job.customer.phone) context += ` (${job.customer.phone})`;
    context += '\n';

    context += `Property: ${job.property.address}, ${job.property.city}, ${job.property.state}\n`;
    context += `Status: ${job.status.replace(/_/g, ' ')}\n`;

    // Insurance info if available
    if (job.insurance?.company) {
      context += `Insurance: ${job.insurance.company}`;
      if (job.insurance.claimNumber) context += ` (Claim #${job.insurance.claimNumber})`;
      context += '\n';
    }

    // Damage info if available
    if (job.damage?.damageType) {
      context += `Damage: ${job.damage.damageType}`;
      if (job.damage.damageDate) context += ` (${job.damage.damageDate})`;
      context += '\n';
    }

    // Get conversation history for this job
    const conversationHistory = await this.getJobConversationHistory(job.id);

    if (conversationHistory.length > 0) {
      context += '\nPrevious discussions about this job:\n';

      // Show last 3 conversation summaries
      for (const conv of conversationHistory.slice(0, 3)) {
        context += `- ${conv.summary}`;
        if (conv.key_decisions.length > 0) {
          context += ` (Decisions: ${conv.key_decisions.slice(0, 2).join(', ')})`;
        }
        context += '\n';
      }
    }

    // Recent notes
    if (job.notes && job.notes.length > 0) {
      context += '\nRecent notes:\n';
      for (const note of job.notes.slice(0, 3)) {
        context += `- ${note.text.substring(0, 100)}${note.text.length > 100 ? '...' : ''}\n`;
      }
    }

    return context;
  }

  /**
   * Build context from detected job in query
   */
  async buildContextFromQuery(query: string): Promise<string> {
    const detection = await this.detectJobMention(query);

    if (detection) {
      console.log(
        `[JobContextService] Detected job ${detection.job.jobNumber} ` +
        `via ${detection.match_type} (${detection.confidence * 100}% confidence)`
      );
      return this.buildJobContext(detection.job);
    }

    return '';
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Clear job conversation cache
   */
  clearCache(): void {
    this.jobSummaryCache.clear();
  }

  /**
   * Get the detected job from a query (public access for UI)
   */
  async getDetectedJob(query: string): Promise<Job | null> {
    const detection = await this.detectJobMention(query);
    return detection?.job || null;
  }
}

// Export singleton instance
export const jobContextService = JobContextService.getInstance();
export default jobContextService;
