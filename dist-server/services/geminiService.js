import { GoogleGenAI, Modality, } from '@google/genai';
import { env } from '../src/config/env';
// Only initialize Gemini if API key is provided and valid
const getGeminiClient = () => {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
        return null;
    }
    return new GoogleGenAI({ apiKey });
};
const ai = getGeminiClient();
// Helper to check if Gemini is available
const ensureGemini = () => {
    if (!ai) {
        throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY in Railway environment variables or use alternative AI providers (Ollama, Groq, etc.)');
    }
    return ai;
};
// --- Chat ---
export function createChat(model) {
    const client = ensureGemini();
    return client.chats.create({
        model,
    });
}
// --- Image Analysis ---
export async function analyzeImage(base64Image, mimeType, prompt) {
    const client = ensureGemini();
    const imagePart = {
        inlineData: {
            data: base64Image,
            mimeType: mimeType,
        },
    };
    const textPart = { text: prompt };
    const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
    });
    return response.text;
}
// --- Email Generation ---
export async function generateEmail(recipient, subject, keyPoints) {
    const client = ensureGemini();
    const prompt = `
    Generate a professional email with the following details:
    To: ${recipient}
    Subject: ${subject}

    Key points to include in the body:
    ${keyPoints}

    Please write only the body of the email. Do not include the "To" or "Subject" lines in your response.
  `;
    const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    return response.text;
}
// --- Text Summarization ---
export async function summarizeText(textToSummarize) {
    const client = ensureGemini();
    const prompt = `Summarize the following text concisely:\n\n${textToSummarize}`;
    const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    return response.text;
}
// --- Complex Reasoning (Thinking) ---
export async function getComplexAnswer(prompt, thinkingBudget, model) {
    const client = ensureGemini();
    const response = await client.models.generateContent({
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
export function connectTranscriptionStream(callbacks) {
    const client = ensureGemini();
    return client.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks,
        config: {
            inputAudioTranscription: {},
        },
    });
}
// --- Live Conversation ---
export function connectLiveConversation(callbacks) {
    const client = ensureGemini();
    return client.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks,
        config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } }, // UK English female voice
            },
            systemInstruction: 'You are S21, a friendly and helpful AI assistant.',
        },
    });
}
// --- Maps Search ---
export async function searchMaps(query, location) {
    const client = ensureGemini();
    const response = await client.models.generateContent({
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
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return {
        text: response.text,
        chunks: chunks,
    };
}
