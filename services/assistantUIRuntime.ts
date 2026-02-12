/**
 * Assistant-UI Runtime Adapter
 *
 * Bridges @assistant-ui/react with the existing multiProviderAI + Susan context pipeline.
 * Uses ExternalStoreRuntime to connect assistant-ui's thread management with our backend.
 */

import type {
  ExternalStoreAdapter,
  ThreadMessageLike,
} from '@assistant-ui/react';
import { multiAI } from './multiProviderAI';
import { buildSusanContext } from './susanContextService';
import { memoryService } from './memoryService';
import { ragService } from './ragService';
import { SYSTEM_PROMPT } from '../config/s21Personality';
import { authService } from './authService';

export interface SusanMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: any[];
  provider?: string;
  createdAt?: Date;
}

/**
 * Convert our internal messages to assistant-ui ThreadMessageLike format.
 */
export function toThreadMessages(messages: SusanMessage[]): ThreadMessageLike[] {
  return messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: [{ type: 'text' as const, text: msg.content }],
    createdAt: msg.createdAt || new Date(),
  }));
}

/**
 * Create an ExternalStoreAdapter that connects assistant-ui with Susan's AI pipeline.
 *
 * This adapter is stateless - the parent component owns the messages array
 * and passes onNew/setMessages callbacks.
 */
export function createSusanAdapter(options: {
  messages: SusanMessage[];
  setMessages: (msgs: SusanMessage[]) => void;
  selectedState?: string | null;
  onResponseStart?: () => void;
  onResponseEnd?: (provider: string) => void;
}): ExternalStoreAdapter {
  const { messages, setMessages, selectedState, onResponseStart, onResponseEnd } = options;

  return {
    isRunning: false,
    messages: toThreadMessages(messages),

    onNew: async (message) => {
      const userText = message.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('\n');

      if (!userText.trim()) return;

      // Add user message
      const userMsg: SusanMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: userText,
        createdAt: new Date(),
      };

      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);

      onResponseStart?.();

      try {
        // Build Susan context
        const user = authService.getCurrentUser();
        const email = user?.email || '';
        const susanContext = await buildSusanContext(userText, {
          state: selectedState || undefined,
          userEmail: email,
        });

        // RAG search for relevant knowledge
        const ragResults = await ragService.search(userText, { limit: 3 });
        const ragContext = ragResults.length > 0
          ? '\n\n[Knowledge Base Results]\n' + ragResults.map(r => `- ${r.content}`).join('\n')
          : '';

        // Build conversation messages for AI
        const recentMsgs = updatedMessages.slice(-10);
        const conversationMessages = [
          { role: 'system' as const, content: SYSTEM_PROMPT + susanContext + ragContext },
          ...recentMsgs.map(m => ({
            role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
            content: m.content,
          })),
        ];

        const response = await multiAI.generate(conversationMessages);

        // Add bot response
        const botMsg: SusanMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.content,
          provider: response.provider,
          createdAt: new Date(),
        };

        setMessages([...updatedMessages, botMsg]);

        // Extract memories
        const exchange = [
          { sender: 'user' as const, text: userText },
          { sender: 'bot' as const, text: response.content },
        ];
        const memories = memoryService.extractMemoriesFromConversation(exchange, 'assistant-ui');
        if (memories.length > 0) {
          await memoryService.saveMemories(memories, 'assistant-ui');
        }

        onResponseEnd?.(response.provider);
      } catch (error: any) {
        console.error('[AssistantUI] Generation error:', error);

        const errorMsg: SusanMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `I'm having trouble right now. ${error.message || 'Please try again.'}`,
          createdAt: new Date(),
        };

        setMessages([...updatedMessages, errorMsg]);
        onResponseEnd?.('error');
      }
    },
  };
}
