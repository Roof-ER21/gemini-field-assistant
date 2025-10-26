import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChat, connectTranscriptionStream } from '../services/geminiService';
import { Chat, LiveSession, LiveServerMessage } from '@google/genai';
import { Message } from '../types';
import Spinner from './Spinner';
import TypingIndicator from './TypingIndicator';
import { MicIcon } from './icons/MicIcon';
import { encode } from '../utils/audio';

const ChatPanel: React.FC = () => {
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Refs for voice transcription
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Effect to initialize chat and load messages from localStorage
  useEffect(() => {
    const newChat = createChat('gemini-2.5-flash');
    setChat(newChat);

    try {
      const savedMessages = localStorage.getItem('chatHistory');
      const welcomeMessage = { id: 'initial', text: 'S21 online. How can I assist you, doc?', sender: 'bot' };
      if (savedMessages) {
        const parsedMessages: Message[] = JSON.parse(savedMessages);
        if (parsedMessages.length > 0) {
          setMessages(parsedMessages);
        } else {
          setMessages([welcomeMessage]);
        }
      } else {
        setMessages([welcomeMessage]);
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
      setMessages([{ id: 'initial', text: 'S21 online. How can I assist you, doc?', sender: 'bot' }]);
    }
  }, []);

  // Effect to save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chatHistory', JSON.stringify(messages));
    }
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || !chat || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: userInput,
      sender: 'user',
    };
    setMessages(prev => [...prev, userMessage]);
    setUserInput('');
    setIsLoading(true);

    try {
      const response = await chat.sendMessage({ message: userInput });
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.text,
        sender: 'bot',
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'bot',
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  
  // --- Voice Input Logic ---

  const stopVoiceInputResources = useCallback(() => {
    if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    if (mediaStreamSourceRef.current) {
        mediaStreamSourceRef.current.disconnect();
        mediaStreamSourceRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(console.error);
        audioContextRef.current = null;
    }
    if(sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => session.close()).catch(console.error);
        sessionPromiseRef.current = null;
    }
  }, []);

  const stopVoiceInput = useCallback(() => {
    setIsVoiceRecording(false);
    stopVoiceInputResources();
  }, [stopVoiceInputResources]);

  const startVoiceInput = async () => {
    setVoiceError('');
    if (isVoiceRecording) return;
    
    setIsVoiceRecording(true);
    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      
      sessionPromiseRef.current = connectTranscriptionStream({
        onopen: () => console.log("Voice input connection opened."),
        onclose: () => console.log("Voice input connection closed."),
        onerror: (e) => {
          console.error("Voice input error:", e);
          setVoiceError("Connection error.");
          stopVoiceInput();
        },
        onmessage: (message: LiveServerMessage) => {
          if (message.serverContent?.inputTranscription) {
            setUserInput(prev => prev + message.serverContent.inputTranscription.text);
          }
        },
      });

      mediaStreamSourceRef.current = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
      scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
        const l = inputData.length;
        const int16 = new Int16Array(l);
        for (let i = 0; i < l; i++) {
          int16[i] = inputData[i] * 32768;
        }
        const base64 = encode(new Uint8Array(int16.buffer));
        
        sessionPromiseRef.current?.then(session => {
           session.sendRealtimeInput({ media: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
        }).catch(e => {
            console.error("Error sending audio data:", e);
        });
      };
      
      mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
      scriptProcessorRef.current.connect(audioContextRef.current.destination);

    } catch (err) {
      console.error("Error starting voice input:", err);
      setVoiceError("Mic access denied.");
      setIsVoiceRecording(false);
      stopVoiceInputResources();
    }
  };

  const handleToggleVoiceRecording = () => {
    if (isVoiceRecording) {
      stopVoiceInput();
    } else {
      startVoiceInput();
    }
  };
  
  useEffect(() => {
    return () => {
      stopVoiceInputResources();
    };
  }, [stopVoiceInputResources]);


  return (
    <div className="flex flex-col h-full bg-zinc-800 p-4">
      <h2 className="text-xl font-bold text-white border-b border-zinc-600 pb-2 mb-4">S21 Chat</h2>
      <div className="flex-1 overflow-y-auto mb-4 pr-2">
        <div className="flex flex-col space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-end ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-lg lg:max-w-xl px-4 py-2 rounded-lg shadow ${
                  msg.sender === 'user'
                    ? 'bg-red-700 text-white rounded-br-none'
                    : 'bg-zinc-700 text-zinc-200 rounded-bl-none'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>
          ))}
          {isLoading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>
      </div>
       {voiceError && <p className="text-red-400 text-sm text-center mb-2">{voiceError}</p>}
      <form onSubmit={handleSendMessage} className="flex items-center">
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder={isVoiceRecording ? "Listening..." : "Type your message..."}
          className="flex-1 p-3 bg-zinc-900 border border-zinc-600 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-red-600 text-white"
          disabled={isLoading || isVoiceRecording}
        />
         <button
          type="button"
          onClick={handleToggleVoiceRecording}
          className={`p-3 border-y border-zinc-600 ${
            isVoiceRecording 
              ? 'bg-red-700 text-white animate-pulse' 
              : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
          } transition-colors disabled:bg-zinc-800 disabled:cursor-not-allowed`}
          disabled={isLoading}
        >
          <MicIcon className="h-6 w-6" />
        </button>
        <button
          type="submit"
          disabled={!userInput.trim() || isLoading || isVoiceRecording}
          className="bg-red-700 text-white px-6 py-3 rounded-r-lg hover:bg-red-800 disabled:bg-zinc-700 disabled:text-zinc-400 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {isLoading ? <Spinner /> : 'Send'}
        </button>
      </form>
    </div>
  );
};

export default ChatPanel;
