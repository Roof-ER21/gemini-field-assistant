/**
 * Susan Chat Provider
 *
 * Wraps assistant-ui's AssistantRuntimeProvider around Susan's chat system.
 * Provides the runtime context for SusanThread and SusanComposer.
 */

import React, { useMemo } from 'react';
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react';
import { createSusanAdapter, SusanMessage } from '../../services/assistantUIRuntime';

interface SusanChatProviderProps {
  messages: SusanMessage[];
  setMessages: (msgs: SusanMessage[]) => void;
  selectedState?: string | null;
  onResponseStart?: () => void;
  onResponseEnd?: (provider: string) => void;
  children: React.ReactNode;
}

export const SusanChatProvider: React.FC<SusanChatProviderProps> = ({
  messages,
  setMessages,
  selectedState,
  onResponseStart,
  onResponseEnd,
  children,
}) => {
  const adapter = useMemo(
    () => createSusanAdapter({
      messages,
      setMessages,
      selectedState,
      onResponseStart,
      onResponseEnd,
    }),
    [messages, setMessages, selectedState, onResponseStart, onResponseEnd]
  );

  const runtime = useExternalStoreRuntime(adapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
};

export default SusanChatProvider;
