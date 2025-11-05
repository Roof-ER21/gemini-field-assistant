/**
 * Chat Monitor Service
 * Detects concerning or problematic chat conversations for admin review
 * Flags issues like state mismatches, off-topic queries, inappropriate content, etc.
 */

export interface ConcerningChatDetection {
  concernType: 'state_mismatch' | 'off_topic' | 'inappropriate' | 'misinformation' | 'legal' | 'confusion' | 'competitor';
  severity: 'critical' | 'warning' | 'info';
  flaggedContent: string;
  detectionReason: string;
  context?: string;
}

export class ChatMonitorService {
  private static instance: ChatMonitorService;

  // State codes for validation
  private readonly VALID_STATES = ['VA', 'MD', 'PA'];

  // Keywords for off-topic detection
  private readonly OFF_TOPIC_KEYWORDS = [
    'take over', 'takeover', 'company takeover', 'steal', 'hack', 'password',
    'fire', 'quit', 'resign', 'lawsuit', 'sue', 'lawyer', 'attorney',
    'politics', 'election', 'democrat', 'republican', 'trump', 'biden',
    'religion', 'god', 'jesus', 'allah', 'church', 'mosque', 'temple'
  ];

  // Keywords for inappropriate content
  private readonly INAPPROPRIATE_KEYWORDS = [
    'fuck', 'shit', 'damn', 'ass', 'bitch', 'bastard', 'crap',
    'piss', 'hell', 'asshole', 'dick', 'pussy', 'cock'
  ];

  // Keywords for legal concerns
  private readonly LEGAL_CONCERN_KEYWORDS = [
    'fraud', 'forge', 'fake', 'illegal', 'scam', 'cheat', 'lie to',
    'hiding from', 'under the table', 'cash only', 'no receipt',
    'tax evasion', 'money laundering'
  ];

  // Keywords indicating user confusion
  private readonly CONFUSION_KEYWORDS = [
    'you\'re wrong', 'that\'s incorrect', 'not helping', 'useless',
    'doesn\'t work', 'broken', 'confused', 'doesn\'t understand',
    'wrong information', 'bad advice'
  ];

  // Competitor keywords
  private readonly COMPETITOR_KEYWORDS = [
    'other roofer', 'different company', 'competitor', 'cheaper option',
    'going with someone else', 'found another', 'better deal'
  ];

  private constructor() {}

  static getInstance(): ChatMonitorService {
    if (!ChatMonitorService.instance) {
      ChatMonitorService.instance = new ChatMonitorService();
    }
    return ChatMonitorService.instance;
  }

  /**
   * Analyze a chat message for concerning content
   */
  analyze(message: {
    sender: 'user' | 'bot';
    content: string;
    state?: string;
    sessionId?: string;
    userId?: string;
  }): ConcerningChatDetection | null {
    const detections: ConcerningChatDetection[] = [];

    // Check for state mismatch (Susan references wrong state)
    if (message.sender === 'bot' && message.state) {
      const stateMismatch = this.detectStateMismatch(message.content, message.state);
      if (stateMismatch) {
        detections.push(stateMismatch);
      }
    }

    // Check user messages for concerning content
    if (message.sender === 'user') {
      const offTopic = this.detectOffTopic(message.content);
      if (offTopic) detections.push(offTopic);

      const inappropriate = this.detectInappropriate(message.content);
      if (inappropriate) detections.push(inappropriate);

      const legal = this.detectLegalConcern(message.content);
      if (legal) detections.push(legal);

      const confusion = this.detectConfusion(message.content);
      if (confusion) detections.push(confusion);

      const competitor = this.detectCompetitorMention(message.content);
      if (competitor) detections.push(competitor);
    }

    // Return highest severity detection
    if (detections.length > 0) {
      // Prioritize critical over warning over info
      const critical = detections.find(d => d.severity === 'critical');
      if (critical) return critical;

      const warning = detections.find(d => d.severity === 'warning');
      if (warning) return warning;

      return detections[0];
    }

    return null;
  }

  /**
   * Detect state mismatch - Susan references wrong state
   */
  private detectStateMismatch(content: string, userState: string): ConcerningChatDetection | null {
    const contentLower = content.toLowerCase();

    // Check if Susan mentions a different state than user's state
    const stateMatches: { [key: string]: RegExp } = {
      'VA': /\b(virginia|va)\b/gi,
      'MD': /\b(maryland|md)\b/gi,
      'PA': /\b(pennsylvania|pa)\b/gi
    };

    const mentionedStates: string[] = [];
    for (const [state, regex] of Object.entries(stateMatches)) {
      if (regex.test(contentLower)) {
        mentionedStates.push(state);
      }
    }

    // If Susan mentions a state different from user's state
    if (mentionedStates.length > 0 && !mentionedStates.includes(userState)) {
      return {
        concernType: 'state_mismatch',
        severity: 'critical',
        flaggedContent: content,
        detectionReason: `Susan referenced ${mentionedStates.join(', ')} but user is in ${userState}`
      };
    }

    return null;
  }

  /**
   * Detect off-topic queries
   */
  private detectOffTopic(content: string): ConcerningChatDetection | null {
    const contentLower = content.toLowerCase();

    for (const keyword of this.OFF_TOPIC_KEYWORDS) {
      if (contentLower.includes(keyword)) {
        return {
          concernType: 'off_topic',
          severity: keyword.includes('take over') || keyword.includes('hack') || keyword.includes('steal')
            ? 'critical'
            : 'warning',
          flaggedContent: content,
          detectionReason: `Off-topic keyword detected: "${keyword}"`
        };
      }
    }

    return null;
  }

  /**
   * Detect inappropriate language
   */
  private detectInappropriate(content: string): ConcerningChatDetection | null {
    const contentLower = content.toLowerCase();

    for (const keyword of this.INAPPROPRIATE_KEYWORDS) {
      if (new RegExp(`\\b${keyword}\\b`, 'i').test(contentLower)) {
        return {
          concernType: 'inappropriate',
          severity: 'warning',
          flaggedContent: content,
          detectionReason: `Inappropriate language detected`
        };
      }
    }

    return null;
  }

  /**
   * Detect legal concerns
   */
  private detectLegalConcern(content: string): ConcerningChatDetection | null {
    const contentLower = content.toLowerCase();

    for (const keyword of this.LEGAL_CONCERN_KEYWORDS) {
      if (contentLower.includes(keyword)) {
        return {
          concernType: 'legal',
          severity: 'critical',
          flaggedContent: content,
          detectionReason: `Potential legal concern detected: "${keyword}"`
        };
      }
    }

    return null;
  }

  /**
   * Detect user confusion or dissatisfaction
   */
  private detectConfusion(content: string): ConcerningChatDetection | null {
    const contentLower = content.toLowerCase();

    for (const keyword of this.CONFUSION_KEYWORDS) {
      if (contentLower.includes(keyword)) {
        return {
          concernType: 'confusion',
          severity: 'warning',
          flaggedContent: content,
          detectionReason: `User expressed confusion or dissatisfaction: "${keyword}"`
        };
      }
    }

    return null;
  }

  /**
   * Detect excessive competitor mentions
   */
  private detectCompetitorMention(content: string): ConcerningChatDetection | null {
    const contentLower = content.toLowerCase();

    for (const keyword of this.COMPETITOR_KEYWORDS) {
      if (contentLower.includes(keyword)) {
        return {
          concernType: 'competitor',
          severity: 'info',
          flaggedContent: content,
          detectionReason: `Competitor mention detected: "${keyword}"`
        };
      }
    }

    return null;
  }

  /**
   * Batch analyze multiple messages from a conversation
   */
  analyzeConversation(messages: Array<{
    sender: 'user' | 'bot';
    content: string;
    state?: string;
    messageId?: string;
    createdAt?: Date;
  }>, userState?: string): ConcerningChatDetection[] {
    const detections: Array<ConcerningChatDetection & { messageId?: string; timestamp?: Date }> = [];

    for (const message of messages) {
      const detection = this.analyze({
        ...message,
        state: userState || message.state
      });

      if (detection) {
        detections.push({
          ...detection,
          messageId: message.messageId,
          timestamp: message.createdAt
        });
      }
    }

    return detections;
  }

  /**
   * Get severity color for UI display
   */
  getSeverityColor(severity: 'critical' | 'warning' | 'info'): string {
    switch (severity) {
      case 'critical':
        return '#dc2626'; // red
      case 'warning':
        return '#f59e0b'; // amber
      case 'info':
        return '#3b82f6'; // blue
      default:
        return '#6b7280'; // gray
    }
  }

  /**
   * Get severity icon for UI display
   */
  getSeverityIcon(severity: 'critical' | 'warning' | 'info'): string {
    switch (severity) {
      case 'critical':
        return '🔴';
      case 'warning':
        return '🟡';
      case 'info':
        return '🔵';
      default:
        return '⚪';
    }
  }

  /**
   * Get human-readable concern type label
   */
  getConcernTypeLabel(concernType: string): string {
    const labels: { [key: string]: string } = {
      'state_mismatch': 'State Mismatch',
      'off_topic': 'Off-Topic Query',
      'inappropriate': 'Inappropriate Content',
      'misinformation': 'Potential Misinformation',
      'legal': 'Legal Concern',
      'confusion': 'User Confusion',
      'competitor': 'Competitor Mention'
    };
    return labels[concernType] || concernType;
  }
}

// Export singleton instance
export const chatMonitorService = ChatMonitorService.getInstance();
