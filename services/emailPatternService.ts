/**
 * Email Pattern Service
 * Tracks email strategies and outcomes to learn what works
 * Enables Susan 21 to recommend proven approaches based on past success
 */

import { getApiBaseUrl } from './config';
import { authService } from './authService';

// ============================================================================
// TYPES
// ============================================================================

export type EmailType =
  | 'supplement'
  | 'dispute'
  | 'follow_up'
  | 'initial_claim'
  | 'appeal'
  | 'escalation'
  | 'documentation_request'
  | 'meeting_request'
  | 'general';

export type EmailOutcome =
  | 'approved'
  | 'partial'
  | 'denied'
  | 'pending'
  | 'no_response'
  | 'unknown';

export type EmailTone =
  | 'professional'
  | 'firm'
  | 'urgent'
  | 'collaborative'
  | 'friendly';

export interface EmailArgument {
  type: 'code_citation' | 'manufacturer_spec' | 'industry_standard' | 'policy_language' | 'visual_evidence' | 'other';
  text: string;
  citation?: string;
}

export interface EmailPattern {
  id: string;
  user_id?: string;
  email_type: EmailType;
  insurer?: string;
  state?: string;
  subject_template?: string;
  arguments_used: EmailArgument[];
  primary_argument?: string;
  code_citations: string[];
  tone: EmailTone;
  source_email_id?: string;
  source_job_id?: string;
  outcome: EmailOutcome;
  outcome_notes?: string;
  response_time_days?: number;
  amount_requested?: number;
  amount_approved?: number;
  is_successful?: boolean;
  success_factors?: string[];
  sent_at?: string;
  outcome_recorded_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PatternSuccessRate {
  insurer?: string;
  state?: string;
  email_type: EmailType;
  total_emails: number;
  approved_count: number;
  partial_count: number;
  denied_count: number;
  successful_count: number;
  success_rate_pct: number;
  avg_response_days?: number;
  avg_approval_pct?: number;
}

export interface ArgumentEffectiveness {
  argument_text: string;
  argument_type: string;
  success_rate: number;
  times_used: number;
}

// ============================================================================
// ARGUMENT EXTRACTION PATTERNS
// ============================================================================

const ARGUMENT_PATTERNS = {
  code_citation: [
    /\b(IRC\s*(?:R|Section)?\s*[\d.]+)\b/gi,
    /\b(IBC\s*(?:Section)?\s*[\d.]+)\b/gi,
    /\b(ASTM\s*[A-Z]?\s*\d+)\b/gi,
    /\b(building code(?:s)?(?:\s+(?:require|mandate|state))?)\b/gi,
  ],
  manufacturer_spec: [
    /\b(GAF|CertainTeed|Owens Corning|Atlas|Tamko)(?:'s)?\s+(?:warranty|spec(?:ification)?|requirement|guideline)/gi,
    /\bmanufacturer(?:'s)?\s+(?:warranty|spec(?:ification)?|requirement|guideline)/gi,
  ],
  industry_standard: [
    /\bindustry\s+standard/gi,
    /\bbest\s+practice/gi,
    /\b(?:NRCA|ARMA)\s+(?:guideline|standard|recommendation)/gi,
  ],
  policy_language: [
    /\bpolicy\s+(?:language|provision|coverage|terms?)/gi,
    /\bendorsement\s+(?:require|state|language)/gi,
    /\bmatching\s+(?:endorsement|provision)/gi,
  ],
  visual_evidence: [
    /\bphoto(?:s|graph(?:s|ic)?)?(?:\s+(?:evidence|document(?:ation)?|show(?:s|ing)?))?/gi,
    /\binspection\s+(?:report|finding|photo)/gi,
  ],
};

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

class EmailPatternService {
  private static instance: EmailPatternService;
  private apiBaseUrl: string;
  private useLocalStorage: boolean = true;
  private patternCache: EmailPattern[] | null = null;

  private constructor() {
    this.apiBaseUrl = getApiBaseUrl();
    this.checkApiConnection();
  }

  static getInstance(): EmailPatternService {
    if (!EmailPatternService.instance) {
      EmailPatternService.instance = new EmailPatternService();
    }
    return EmailPatternService.instance;
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
        console.log('[EmailPatternService] ✅ Connected to backend API');
      }
    } catch {
      console.log('[EmailPatternService] ⚠️ Using localStorage fallback');
      this.useLocalStorage = true;
    }
  }

  // ============================================================================
  // ARGUMENT EXTRACTION
  // ============================================================================

  /**
   * Extract arguments from email content
   */
  extractArguments(emailContent: string): EmailArgument[] {
    const arguments_found: EmailArgument[] = [];
    const seenTexts = new Set<string>();

    for (const [argType, patterns] of Object.entries(ARGUMENT_PATTERNS)) {
      for (const pattern of patterns) {
        const matches = Array.from(emailContent.matchAll(pattern));
        for (const match of matches) {
          const text = match[0].trim();

          if (seenTexts.has(text.toLowerCase())) continue;
          seenTexts.add(text.toLowerCase());

          arguments_found.push({
            type: argType as EmailArgument['type'],
            text,
            citation: match[1] || undefined,
          });
        }
      }
    }

    return arguments_found;
  }

  /**
   * Identify the primary argument in an email
   */
  identifyPrimaryArgument(emailContent: string): string | undefined {
    const contentLower = emailContent.toLowerCase();

    // Priority order for primary arguments
    const primaryPatterns: Array<{ pattern: RegExp; label: string }> = [
      { pattern: /\birc\s*r?\s*908\.3/gi, label: 'IRC R908.3 uniform appearance requirement' },
      { pattern: /\bmatching\s+(?:requirement|endorsement|provision)/gi, label: 'Matching policy endorsement' },
      { pattern: /\buniform\s+appearance/gi, label: 'Uniform appearance requirement' },
      { pattern: /\bdepreciation/gi, label: 'Recoverable depreciation dispute' },
      { pattern: /\bcode\s+(?:require|compliance|violation)/gi, label: 'Building code compliance' },
      { pattern: /\bwarranty/gi, label: 'Warranty requirements' },
      { pattern: /\brepair(?:ability|able)/gi, label: 'Repairability argument' },
      { pattern: /\bbrittle(?:ness)?/gi, label: 'Brittleness test results' },
      { pattern: /\bmissed\s+(?:damage|items?)/gi, label: 'Missed damage items' },
    ];

    for (const { pattern, label } of primaryPatterns) {
      if (pattern.test(contentLower)) {
        return label;
      }
    }

    return undefined;
  }

  /**
   * Detect email type from content
   */
  detectEmailType(subject: string, body: string): EmailType {
    const combined = `${subject} ${body}`.toLowerCase();

    if (/\bsupplement/i.test(combined)) return 'supplement';
    if (/\bappeal/i.test(combined)) return 'appeal';
    if (/\bdispute|disagree|contest/i.test(combined)) return 'dispute';
    if (/\bescalat/i.test(combined)) return 'escalation';
    if (/\bfollow[\s-]?up|checking in|status/i.test(combined)) return 'follow_up';
    if (/\binitial|new claim|first/i.test(combined)) return 'initial_claim';
    if (/\bdocument|photo|evidence|request/i.test(combined)) return 'documentation_request';
    if (/\bmeeting|schedule|appointment/i.test(combined)) return 'meeting_request';

    return 'general';
  }

  /**
   * Detect insurer from email content
   */
  detectInsurer(content: string): string | undefined {
    const insurerPatterns = [
      'State Farm', 'USAA', 'Allstate', 'Liberty Mutual', 'Nationwide',
      'Farmers', 'Progressive', 'GEICO', 'Travelers', 'Erie',
      'Amica', 'American Family', 'Chubb', 'Hartford', 'MetLife',
    ];

    const contentLower = content.toLowerCase();

    for (const insurer of insurerPatterns) {
      if (contentLower.includes(insurer.toLowerCase())) {
        return insurer;
      }
    }

    return undefined;
  }

  // ============================================================================
  // PATTERN TRACKING
  // ============================================================================

  /**
   * Track an email generation for pattern learning
   */
  async trackEmailGeneration(data: {
    emailType: EmailType;
    insurer?: string;
    state?: string;
    subject?: string;
    body: string;
    tone?: EmailTone;
    jobId?: string;
    sourceEmailId?: string;
  }): Promise<string> {
    const email = this.getAuthEmail();
    if (!email) {
      throw new Error('No authenticated user');
    }

    const arguments_used = this.extractArguments(data.body);
    const primary_argument = this.identifyPrimaryArgument(data.body);
    const code_citations = arguments_used
      .filter(a => a.type === 'code_citation' && a.citation)
      .map(a => a.citation!);

    const pattern: EmailPattern = {
      id: crypto.randomUUID(),
      user_id: email,
      email_type: data.emailType,
      insurer: data.insurer || this.detectInsurer(data.body),
      state: data.state,
      subject_template: data.subject,
      arguments_used,
      primary_argument,
      code_citations,
      tone: data.tone || 'professional',
      source_job_id: data.jobId,
      source_email_id: data.sourceEmailId,
      outcome: 'pending',
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (this.useLocalStorage) {
      this.savePatternLocally(pattern);
      return pattern.id;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/email-patterns`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(pattern),
      });

      if (!response.ok) {
        throw new Error('Failed to save pattern');
      }

      const result = await response.json();
      console.log('[EmailPatternService] Tracked email pattern:', result.id);
      return result.id;
    } catch (error) {
      console.error('[EmailPatternService] API error:', error);
      this.savePatternLocally(pattern);
      return pattern.id;
    }
  }

  private savePatternLocally(pattern: EmailPattern): void {
    const email = this.getAuthEmail();
    if (!email) return;

    try {
      const storageKey = `email_patterns_${email}`;
      const patterns = JSON.parse(localStorage.getItem(storageKey) || '[]');
      patterns.unshift(pattern);

      // Keep last 100 patterns
      localStorage.setItem(storageKey, JSON.stringify(patterns.slice(0, 100)));
      this.patternCache = patterns;
    } catch (error) {
      console.error('[EmailPatternService] Error saving locally:', error);
    }
  }

  // ============================================================================
  // OUTCOME TRACKING
  // ============================================================================

  /**
   * Update the outcome of a tracked email
   */
  async updateEmailOutcome(
    patternId: string,
    outcome: EmailOutcome,
    data?: {
      outcomeNotes?: string;
      responseTimeDays?: number;
      amountApproved?: number;
      successFactors?: string[];
    }
  ): Promise<void> {
    const isSuccessful = outcome === 'approved' || outcome === 'partial';

    if (this.useLocalStorage) {
      this.updateOutcomeLocally(patternId, outcome, isSuccessful, data);
      return;
    }

    try {
      await fetch(`${this.apiBaseUrl}/email-patterns/${patternId}/outcome`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({
          outcome,
          outcome_notes: data?.outcomeNotes,
          response_time_days: data?.responseTimeDays,
          amount_approved: data?.amountApproved,
          is_successful: isSuccessful,
          success_factors: data?.successFactors,
          outcome_recorded_at: new Date().toISOString(),
        }),
      });

      // Invalidate cache
      this.patternCache = null;

      console.log(`[EmailPatternService] Updated outcome for ${patternId}: ${outcome}`);
    } catch (error) {
      console.error('[EmailPatternService] Error updating outcome:', error);
      this.updateOutcomeLocally(patternId, outcome, isSuccessful, data);
    }
  }

  private updateOutcomeLocally(
    patternId: string,
    outcome: EmailOutcome,
    isSuccessful: boolean,
    data?: {
      outcomeNotes?: string;
      responseTimeDays?: number;
      amountApproved?: number;
      successFactors?: string[];
    }
  ): void {
    const email = this.getAuthEmail();
    if (!email) return;

    try {
      const storageKey = `email_patterns_${email}`;
      const patterns: EmailPattern[] = JSON.parse(localStorage.getItem(storageKey) || '[]');

      const pattern = patterns.find(p => p.id === patternId);
      if (pattern) {
        pattern.outcome = outcome;
        pattern.is_successful = isSuccessful;
        pattern.outcome_recorded_at = new Date().toISOString();
        pattern.updated_at = new Date().toISOString();

        if (data) {
          pattern.outcome_notes = data.outcomeNotes;
          pattern.response_time_days = data.responseTimeDays;
          pattern.amount_approved = data.amountApproved;
          pattern.success_factors = data.successFactors;
        }

        localStorage.setItem(storageKey, JSON.stringify(patterns));
        this.patternCache = patterns;
      }
    } catch (error) {
      console.error('[EmailPatternService] Error updating locally:', error);
    }
  }

  // ============================================================================
  // PATTERN RETRIEVAL
  // ============================================================================

  /**
   * Get successful patterns for a similar situation
   */
  async getSuccessfulPatterns(filters: {
    insurer?: string;
    state?: string;
    emailType?: EmailType;
    limit?: number;
  }): Promise<EmailPattern[]> {
    const limit = filters.limit || 5;

    if (this.useLocalStorage) {
      return this.getSuccessfulPatternsLocally(filters, limit);
    }

    try {
      const params = new URLSearchParams();
      if (filters.insurer) params.set('insurer', filters.insurer);
      if (filters.state) params.set('state', filters.state);
      if (filters.emailType) params.set('email_type', filters.emailType);
      params.set('limit', String(limit));
      params.set('successful_only', 'true');

      const response = await fetch(
        `${this.apiBaseUrl}/email-patterns?${params.toString()}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch patterns');
      }

      return await response.json();
    } catch (error) {
      console.error('[EmailPatternService] API error:', error);
      return this.getSuccessfulPatternsLocally(filters, limit);
    }
  }

  private getSuccessfulPatternsLocally(
    filters: { insurer?: string; state?: string; emailType?: EmailType },
    limit: number
  ): EmailPattern[] {
    const email = this.getAuthEmail();
    if (!email) return [];

    try {
      const storageKey = `email_patterns_${email}`;
      let patterns: EmailPattern[] = JSON.parse(localStorage.getItem(storageKey) || '[]');

      // Filter to successful only
      patterns = patterns.filter(p => p.is_successful === true);

      // Apply filters with fallback scoring
      const scored = patterns.map(pattern => {
        let score = 0;

        // Exact matches get highest priority
        if (filters.insurer && pattern.insurer?.toLowerCase() === filters.insurer.toLowerCase()) {
          score += 10;
        }
        if (filters.state && pattern.state === filters.state) {
          score += 8;
        }
        if (filters.emailType && pattern.email_type === filters.emailType) {
          score += 5;
        }

        // Partial matches (same insurer family or nearby state)
        if (filters.insurer && pattern.insurer && !score) {
          score += 2; // Some pattern is better than none
        }

        return { pattern, score };
      });

      // Sort by score, then by recency
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.pattern.created_at).getTime() - new Date(a.pattern.created_at).getTime();
      });

      return scored
        .filter(s => s.score > 0)
        .slice(0, limit)
        .map(s => s.pattern);
    } catch {
      return [];
    }
  }

  /**
   * Get success rates by insurer/state/type
   */
  async getSuccessRates(filters?: {
    insurer?: string;
    state?: string;
  }): Promise<PatternSuccessRate[]> {
    if (this.useLocalStorage) {
      return this.getSuccessRatesLocally(filters);
    }

    try {
      const params = new URLSearchParams();
      if (filters?.insurer) params.set('insurer', filters.insurer);
      if (filters?.state) params.set('state', filters.state);

      const response = await fetch(
        `${this.apiBaseUrl}/email-patterns/success-rates?${params.toString()}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch success rates');
      }

      return await response.json();
    } catch (error) {
      console.error('[EmailPatternService] API error:', error);
      return this.getSuccessRatesLocally(filters);
    }
  }

  private getSuccessRatesLocally(filters?: { insurer?: string; state?: string }): PatternSuccessRate[] {
    const email = this.getAuthEmail();
    if (!email) return [];

    try {
      const storageKey = `email_patterns_${email}`;
      let patterns: EmailPattern[] = JSON.parse(localStorage.getItem(storageKey) || '[]');

      // Apply filters
      if (filters?.insurer) {
        patterns = patterns.filter(p =>
          p.insurer?.toLowerCase() === filters.insurer!.toLowerCase()
        );
      }
      if (filters?.state) {
        patterns = patterns.filter(p => p.state === filters.state);
      }

      // Group by insurer + state + email_type
      const groups = new Map<string, EmailPattern[]>();

      for (const pattern of patterns) {
        const key = `${pattern.insurer || 'unknown'}_${pattern.state || 'unknown'}_${pattern.email_type}`;
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(pattern);
      }

      // Calculate success rates
      const rates: PatternSuccessRate[] = [];

      for (const [key, group] of Array.from(groups.entries())) {
        const [insurer, state, emailType] = key.split('_');
        const withOutcome = group.filter(p => p.outcome !== 'pending' && p.outcome !== 'unknown');

        if (withOutcome.length === 0) continue;

        const approved = group.filter(p => p.outcome === 'approved').length;
        const partial = group.filter(p => p.outcome === 'partial').length;
        const denied = group.filter(p => p.outcome === 'denied').length;
        const successful = group.filter(p => p.is_successful).length;

        const responseTimes = group
          .filter(p => p.response_time_days !== undefined)
          .map(p => p.response_time_days!);

        rates.push({
          insurer: insurer !== 'unknown' ? insurer : undefined,
          state: state !== 'unknown' ? state : undefined,
          email_type: emailType as EmailType,
          total_emails: group.length,
          approved_count: approved,
          partial_count: partial,
          denied_count: denied,
          successful_count: successful,
          success_rate_pct: Math.round((successful / withOutcome.length) * 100),
          avg_response_days: responseTimes.length > 0
            ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
            : undefined,
        });
      }

      return rates.sort((a, b) => (b.success_rate_pct || 0) - (a.success_rate_pct || 0));
    } catch {
      return [];
    }
  }

  // ============================================================================
  // CONTEXT BUILDING
  // ============================================================================

  /**
   * Build email insights context for the system prompt
   */
  async buildEmailInsights(filters: {
    insurer?: string;
    state?: string;
    emailType?: EmailType;
  }): Promise<string> {
    const patterns = await this.getSuccessfulPatterns({
      ...filters,
      limit: 5,
    });

    if (patterns.length === 0) {
      return '';
    }

    let context = '\n[EMAIL PATTERN INSIGHTS]\n';
    context += 'Based on past successful emails:\n';

    // Get success rates for this combo
    const rates = await this.getSuccessRates({
      insurer: filters.insurer,
      state: filters.state,
    });

    const relevantRate = rates.find(r =>
      r.email_type === filters.emailType &&
      (filters.insurer ? r.insurer?.toLowerCase() === filters.insurer.toLowerCase() : true)
    );

    if (relevantRate && relevantRate.success_rate_pct !== undefined) {
      context += `Success rate for this type: ${relevantRate.success_rate_pct}% `;
      context += `(${relevantRate.successful_count}/${relevantRate.total_emails} emails)\n`;
    }

    // Show successful arguments
    const argumentCounts = new Map<string, number>();
    for (const pattern of patterns) {
      if (pattern.primary_argument) {
        argumentCounts.set(
          pattern.primary_argument,
          (argumentCounts.get(pattern.primary_argument) || 0) + 1
        );
      }
    }

    if (argumentCounts.size > 0) {
      context += '\nSuccessful approaches:\n';
      const sortedArgs = Array.from(argumentCounts.entries()).sort((a, b) => b[1] - a[1]);
      for (const [arg, count] of sortedArgs.slice(0, 3)) {
        context += `- "${arg}" (used ${count}x successfully)\n`;
      }
    }

    // Show common code citations
    const citationCounts = new Map<string, number>();
    for (const pattern of patterns) {
      for (const citation of pattern.code_citations) {
        citationCounts.set(citation, (citationCounts.get(citation) || 0) + 1);
      }
    }

    if (citationCounts.size > 0) {
      context += '\nEffective citations:\n';
      const sortedCitations = Array.from(citationCounts.entries()).sort((a, b) => b[1] - a[1]);
      for (const [citation, count] of sortedCitations.slice(0, 3)) {
        context += `- ${citation} (${count}x)\n`;
      }
    }

    return context;
  }

  // ============================================================================
  // PENDING OUTCOMES
  // ============================================================================

  /**
   * Get emails that are pending outcome recording
   */
  async getPendingOutcomes(limit: number = 10): Promise<EmailPattern[]> {
    const email = this.getAuthEmail();
    if (!email) return [];

    if (this.useLocalStorage) {
      const storageKey = `email_patterns_${email}`;
      const patterns: EmailPattern[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return patterns
        .filter(p => p.outcome === 'pending')
        .slice(0, limit);
    }

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/email-patterns?outcome=pending&limit=${limit}`,
        { headers: this.getHeaders() }
      );
      return response.ok ? await response.json() : [];
    } catch {
      return [];
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Clear pattern cache
   */
  clearCache(): void {
    this.patternCache = null;
  }
}

// Export singleton instance
export const emailPatternService = EmailPatternService.getInstance();
export default emailPatternService;
