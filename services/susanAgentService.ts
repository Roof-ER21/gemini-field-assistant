/**
 * Susan Agent Service
 * Frontend client for the Susan agent endpoint with tool/function calling.
 *
 * Calls POST /api/susan/agent/chat which runs a ReAct loop on the backend
 * with Gemini 2.0 Flash + 7 tools (hail lookup, save note, schedule, etc.)
 *
 * Falls back to the existing multiAI.generate() if the agent endpoint is unavailable.
 */

import { getApiBaseUrl } from './config';
import { authService } from './authService';

export interface AgentToolResult {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  success: boolean;
  error?: string;
}

export interface AgentResponse {
  content: string;
  provider: string;
  model: string;
  toolResults: AgentToolResult[];
  finishReason?: string;
  warning?: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Send a message through the Susan agent endpoint.
 * The backend runs the ReAct loop with Gemini function calling.
 */
export async function susanAgentChat(
  messages: AgentMessage[],
  systemPrompt?: string
): Promise<AgentResponse> {
  const user = authService.getCurrentUser();
  const email = user?.email;

  if (!email) {
    throw new Error('Not authenticated — cannot call Susan agent.');
  }

  const response = await fetch(`${getApiBaseUrl()}/susan/agent/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': email,
    },
    body: JSON.stringify({ messages, systemPrompt }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Susan agent error: ${response.status}`);
  }

  const data = await response.json();

  return {
    content: data.content || '',
    provider: data.provider || 'gemini',
    model: data.model || 'gemini-2.0-flash',
    toolResults: data.toolResults || [],
    finishReason: data.finishReason,
    warning: data.warning,
  };
}
