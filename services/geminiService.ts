import {
  GoogleGenAI,
  Chat,
  LiveSession,
  LiveServerMessage,
  Modality,
} from '@google/genai';
import { GroundingChunk } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

// --- Chat ---
export function createChat(model: string): Chat {
  return ai.chats.create({
    model,
  });
}

// --- Image Analysis ---
export async function analyzeImage(
  base64Image: string,
  mimeType: string,
  prompt: string
): Promise<string> {
  const imagePart = {
    inlineData: {
      data: base64Image,
      mimeType: mimeType,
    },
  };
  const textPart = { text: prompt };

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: [imagePart, textPart] },
  });

  return response.text;
}

// --- Email Generation ---
export async function generateEmail(
  recipient: string,
  subject: string,
  keyPoints: string
): Promise<string> {
  const prompt = `
    Generate a professional email with the following details:
    To: ${recipient}
    Subject: ${subject}
    
    Key points to include in the body:
    ${keyPoints}

    Please write only the body of the email. Do not include the "To" or "Subject" lines in your response.
  `;
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  return response.text;
}

// Fix: Implement and export the summarizeText function to resolve the import error in UtilityPanel.tsx.
// --- Text Summarization ---
export async function summarizeText(textToSummarize: string): Promise<string> {
  const prompt = `Summarize the following text concisely:\n\n${textToSummarize}`;
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  return response.text;
}

// Fix: Implement and export the getComplexAnswer function to resolve the import error in ThinkingPanel.tsx.
// --- Complex Reasoning (Thinking) ---
export async function getComplexAnswer(
  prompt: string,
  thinkingBudget: number,
  model: 'gemini-2.5-pro' | 'gemini-2.5-flash'
): Promise<string> {
  const response = await ai.models.generateContent({
    model: model,
    contents: prompt,
    config: {
      thinkingConfig: {
        thinkingBudget: thinkingBudget,
      },
    },
  });
  return response.text;
}

// --- Live Transcription ---
export function connectTranscriptionStream(callbacks: {
  onopen: () => void;
  onclose: () => void;
  onerror: (e: ErrorEvent) => void;
  onmessage: (message: LiveServerMessage) => void;
}): Promise<LiveSession> {
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks,
    config: {
      inputAudioTranscription: {},
    },
  });
}

// --- Live Conversation ---
export function connectLiveConversation(callbacks: {
  onopen: () => void;
  onclose: () => void;
  onerror: (e: ErrorEvent) => void;
  onmessage: (message: LiveServerMessage) => void;
}): Promise<LiveSession> {
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      systemInstruction: 'You are S21, a friendly and helpful AI assistant.',
    },
  });
}


// --- Maps Search ---
export async function searchMaps(
  query: string,
  location?: { latitude: number; longitude: number }
): Promise<{ text: string; chunks: GroundingChunk[] }> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: query,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: location
        ? {
            retrievalConfig: {
              latLng: location,
            },
          }
        : undefined,
    },
  });

  const chunks =
    response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  return {
    text: response.text,
    chunks: chunks as GroundingChunk[],
  };
}