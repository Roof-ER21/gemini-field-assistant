/**
 * Susan AI Chat - Example Usage
 *
 * This file demonstrates how to interact with the Susan AI Chat API
 * from a frontend application.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ChatRequest {
  message: string;
  sessionId?: string;
  slideIndex?: number;
}

interface ChatResponse {
  success: boolean;
  response?: string;
  metadata?: {
    relatedSlides?: number[];
    followUpSuggestion?: string;
    confidence?: number;
    sessionId?: string | null;
    slideIndex?: number | null;
    mode?: 'fallback';
  };
  error?: string;
}

interface SessionInfo {
  success: boolean;
  session?: {
    id: string;
    presentationId: string;
    propertyAddress: string;
    homeownerName: string;
    startTime: string;
    currentSlideIndex: number;
    totalSlides: number;
    status: 'active' | 'paused' | 'completed';
    messageCount: number;
    homeownerConcerns: string[];
  };
  error?: string;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Send a message to Susan AI
 */
export async function chatWithSusan(request: ChatRequest): Promise<ChatResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/susan/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    const data: ChatResponse = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to get response from Susan');
    }

    return data;
  } catch (error) {
    console.error('Error chatting with Susan:', error);
    throw error;
  }
}

/**
 * Get session information
 */
export async function getSessionInfo(sessionId: string): Promise<SessionInfo> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/susan/session/${sessionId}`);
    const data: SessionInfo = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to get session info');
    }

    return data;
  } catch (error) {
    console.error('Error getting session info:', error);
    throw error;
  }
}

/**
 * Complete a session
 */
export async function completeSession(sessionId: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/susan/session/${sessionId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to complete session');
    }
  } catch (error) {
    console.error('Error completing session:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE USAGE - STANDALONE CHAT
// ============================================================================

async function exampleStandaloneChat() {
  console.log('=== Standalone Chat Example ===');

  try {
    const response = await chatWithSusan({
      message: 'What are common signs of hail damage on a roof?',
    });

    console.log('Susan:', response.response);
    console.log('Mode:', response.metadata?.mode || 'session');
  } catch (error) {
    console.error('Chat failed:', error);
  }
}

// ============================================================================
// EXAMPLE USAGE - SESSION-BASED CHAT
// ============================================================================

async function exampleSessionBasedChat() {
  console.log('=== Session-Based Chat Example ===');

  const sessionId = 'session_example_12345'; // From presentation initialization

  try {
    // Ask a question about the current slide
    const response = await chatWithSusan({
      message: 'Can you explain the damage shown in this image?',
      sessionId,
      slideIndex: 3,
    });

    console.log('Susan:', response.response);
    console.log('Related slides:', response.metadata?.relatedSlides);
    console.log('Follow-up suggestion:', response.metadata?.followUpSuggestion);
    console.log('Confidence:', response.metadata?.confidence);
  } catch (error) {
    console.error('Chat failed:', error);
  }
}

// ============================================================================
// EXAMPLE USAGE - CHECK SESSION STATUS
// ============================================================================

async function exampleCheckSession() {
  console.log('=== Check Session Example ===');

  const sessionId = 'session_example_12345';

  try {
    const info = await getSessionInfo(sessionId);

    console.log('Session ID:', info.session?.id);
    console.log('Property:', info.session?.propertyAddress);
    console.log('Homeowner:', info.session?.homeownerName);
    console.log('Current slide:', info.session?.currentSlideIndex);
    console.log('Total slides:', info.session?.totalSlides);
    console.log('Messages exchanged:', info.session?.messageCount);
    console.log('Status:', info.session?.status);
    console.log('Concerns:', info.session?.homeownerConcerns);
  } catch (error) {
    console.error('Failed to get session info:', error);
  }
}

// ============================================================================
// EXAMPLE USAGE - COMPLETE SESSION
// ============================================================================

async function exampleCompleteSession() {
  console.log('=== Complete Session Example ===');

  const sessionId = 'session_example_12345';

  try {
    await completeSession(sessionId);
    console.log('Session completed successfully');
  } catch (error) {
    console.error('Failed to complete session:', error);
  }
}

// ============================================================================
// EXAMPLE USAGE - REACT COMPONENT
// ============================================================================

/**
 * Example React component using Susan Chat API
 */
export function SusanChatExample() {
  const [message, setMessage] = React.useState('');
  const [conversation, setConversation] = React.useState<Array<{ role: 'user' | 'susan'; text: string }>>([]);
  const [loading, setLoading] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    // Add user message to conversation
    setConversation(prev => [...prev, { role: 'user', text: message }]);
    setLoading(true);

    try {
      const response = await chatWithSusan({
        message,
        sessionId: sessionId || undefined,
      });

      // Add Susan's response to conversation
      setConversation(prev => [...prev, { role: 'susan', text: response.response || 'No response' }]);
    } catch (error) {
      console.error('Chat error:', error);
      setConversation(prev => [...prev, { role: 'susan', text: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setMessage('');
      setLoading(false);
    }
  };

  return (
    <div className="susan-chat">
      <div className="conversation">
        {conversation.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <strong>{msg.role === 'user' ? 'You' : 'Susan'}:</strong> {msg.text}
          </div>
        ))}
      </div>

      <div className="input-area">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Ask Susan a question..."
          disabled={loading}
        />
        <button onClick={handleSendMessage} disabled={loading || !message.trim()}>
          {loading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// RUN EXAMPLES (for testing)
// ============================================================================

if (import.meta.env.DEV) {
  // Uncomment to run examples in development mode
  // exampleStandaloneChat();
  // exampleSessionBasedChat();
  // exampleCheckSession();
  // exampleCompleteSession();
}
