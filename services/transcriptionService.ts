/**
 * Transcription Service
 * Records audio and transcribes using Gemini Audio API
 * Extracts action items, objections, and key points from sales conversations
 */

import { env } from '../src/config/env';
import { GoogleGenAI } from '@google/genai';

export interface TranscriptionSegment {
  timestamp: number;
  text: string;
  speaker?: 'rep' | 'customer' | 'unknown';
}

export interface MeetingTranscript {
  id: string;
  timestamp: Date;
  duration: number; // in seconds
  title: string;
  audioBlob?: Blob;
  audioUrl?: string;
  segments: TranscriptionSegment[];
  fullTranscript: string;
  analysis: {
    summary: string;
    actionItems: string[];
    objections: Array<{
      objection: string;
      response: string;
      resolved: boolean;
    }>;
    keyPoints: string[];
    customerSentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
    followUpNeeded: boolean;
    estimatedValue?: string;
    nextSteps: string[];
  };
  metadata: {
    customerName?: string;
    propertyAddress?: string;
    meetingType: 'initial' | 'inspection' | 'followup' | 'closing' | 'other';
  };
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  mediaRecorder: MediaRecorder | null;
  chunks: Blob[];
}

/**
 * Start recording audio
 */
export async function startRecording(): Promise<RecordingState> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 48000,
      }
    });

    // Check for supported mime types
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/wav'
    ];

    let supportedMimeType: string | undefined;
    // Some polyfills do not implement isTypeSupported
    if (typeof (MediaRecorder as any).isTypeSupported === 'function') {
      supportedMimeType = mimeTypes.find(type => (MediaRecorder as any).isTypeSupported(type));
    } else {
      // Assume WAV via polyfill
      supportedMimeType = 'audio/wav';
    }

    if (!supportedMimeType) {
      throw new Error('No supported audio format found for recording');
    }

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: supportedMimeType
    });

    const chunks: Blob[] = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.start(1000); // Collect data every second

    return {
      isRecording: true,
      isPaused: false,
      duration: 0,
      mediaRecorder,
      chunks,
    };
  } catch (error) {
    console.error('Failed to start recording:', error);
    throw new Error('Microphone access denied or not available');
  }
}

/**
 * Stop recording and return audio blob
 */
export async function stopRecording(state: RecordingState): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!state.mediaRecorder) {
      reject(new Error('No active recording'));
      return;
    }

    const mimeType = state.mediaRecorder.mimeType;

    state.mediaRecorder.onstop = () => {
      const blob = new Blob(state.chunks, { type: mimeType });

      // Stop all tracks to release microphone
      state.mediaRecorder?.stream.getTracks().forEach(track => track.stop());

      resolve(blob);
    };

    // Stop recording if it's still active
    if (state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    } else {
      // Already stopped, just create the blob
      const blob = new Blob(state.chunks, { type: mimeType });
      state.mediaRecorder?.stream.getTracks().forEach(track => track.stop());
      resolve(blob);
    }
  });
}

/**
 * Pause recording
 */
export function pauseRecording(state: RecordingState): void {
  if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
    state.mediaRecorder.pause();
  }
}

/**
 * Resume recording
 */
export function resumeRecording(state: RecordingState): void {
  if (state.mediaRecorder && state.mediaRecorder.state === 'paused') {
    state.mediaRecorder.resume();
  }
}

/**
 * Transcribe audio using Gemini
 */
export async function transcribeAudio(
  audioBlob: Blob,
  meetingType: 'initial' | 'inspection' | 'followup' | 'closing' | 'other' = 'other'
): Promise<MeetingTranscript> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
    throw new Error('Gemini API key not configured');
  }

  // Convert blob to base64
  const base64Audio = await blobToBase64(audioBlob);

  // Initialize Gemini AI with error handling
  let genAI: GoogleGenAI;
  try {
    genAI = new GoogleGenAI({ apiKey });
  } catch (error) {
    console.error('Failed to initialize GoogleGenAI:', error);
    throw new Error('Failed to initialize Gemini AI. Please check your API key and try again.');
  }

  const prompt = `You are a sales conversation analyzer for a roofing company. Transcribe this audio recording and analyze it for key sales insights.

MEETING TYPE: ${meetingType}

TRANSCRIPTION REQUIREMENTS:
1. Provide accurate word-for-word transcription
2. Identify speakers as "Rep:" or "Customer:"
3. Note timestamps for key moments
4. Preserve technical terms (IRC codes, materials, etc.)

ANALYSIS REQUIREMENTS:
1. **Summary**: Brief overview of the conversation (2-3 sentences)
2. **Action Items**: Specific tasks the rep needs to complete
3. **Objections**: Customer concerns raised and how they were addressed
4. **Key Points**: Important facts discussed (damage type, insurance details, pricing)
5. **Customer Sentiment**: Overall tone (positive/neutral/negative/mixed)
6. **Follow-up Needed**: Does this require additional contact?
7. **Estimated Value**: If discussed, estimated project value
8. **Next Steps**: Clear action plan

FORMAT YOUR RESPONSE AS JSON:
{
  "transcription": "Full word-for-word transcription with Speaker: labels",
  "summary": "Brief conversation summary",
  "actionItems": ["Task 1", "Task 2"],
  "objections": [
    {
      "objection": "Customer concern",
      "response": "How rep addressed it",
      "resolved": true/false
    }
  ],
  "keyPoints": ["Important fact 1", "Important fact 2"],
  "customerSentiment": "positive|neutral|negative|mixed",
  "followUpNeeded": true/false,
  "estimatedValue": "$X,XXX or null",
  "nextSteps": ["Next action 1", "Next action 2"],
  "customerName": "Name if mentioned or null",
  "propertyAddress": "Address if mentioned or null"
}

Focus on sales-relevant details that help close deals and maintain customer relationships.`;

  // Use the correct API with retry logic for rate limits
  let result;
  let retries = 3;

  while (retries > 0) {
    try {
      result = await genAI.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: audioBlob.type,
                data: base64Audio.split(',')[1],
              },
            },
          ],
        },
      });
      break; // Success, exit retry loop
    } catch (error: any) {
      if (error?.code === 429 && retries > 1) {
        // Rate limit hit, wait and retry
        console.warn(`Rate limit hit, retrying in ${4 - retries} seconds... (${retries - 1} retries left)`);
        await new Promise(resolve => setTimeout(resolve, (4 - retries) * 1000));
        retries--;
      } else {
        // Not a rate limit or out of retries
        throw error;
      }
    }
  }

  if (!result) {
    throw new Error('Failed to transcribe audio after multiple retries');
  }

  const text = result.text;

  // Parse JSON response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse transcription response');
  }

  const data = JSON.parse(jsonMatch[0]);

  // Create transcript object
  const transcript: MeetingTranscript = {
    id: generateId(),
    timestamp: new Date(),
    duration: 0, // Will be set by caller
    title: generateTitle(data.customerName, data.propertyAddress, meetingType),
    audioBlob,
    audioUrl: URL.createObjectURL(audioBlob),
    segments: parseTranscriptSegments(data.transcription),
    fullTranscript: data.transcription,
    analysis: {
      summary: data.summary || '',
      actionItems: data.actionItems || [],
      objections: data.objections || [],
      keyPoints: data.keyPoints || [],
      customerSentiment: data.customerSentiment || 'neutral',
      followUpNeeded: data.followUpNeeded || false,
      estimatedValue: data.estimatedValue,
      nextSteps: data.nextSteps || [],
    },
    metadata: {
      customerName: data.customerName,
      propertyAddress: data.propertyAddress,
      meetingType,
    },
  };

  // Save to localStorage
  saveTranscript(transcript);

  return transcript;
}

/**
 * Parse transcript into segments by speaker
 */
function parseTranscriptSegments(transcription: string): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = [];
  const lines = transcription.split('\n').filter(line => line.trim());

  lines.forEach((line, index) => {
    let speaker: 'rep' | 'customer' | 'unknown' = 'unknown';
    let text = line;

    if (line.toLowerCase().startsWith('rep:')) {
      speaker = 'rep';
      text = line.substring(4).trim();
    } else if (line.toLowerCase().startsWith('customer:')) {
      speaker = 'customer';
      text = line.substring(9).trim();
    }

    if (text) {
      segments.push({
        timestamp: index * 5, // Approximate 5 seconds per segment
        text,
        speaker,
      });
    }
  });

  return segments;
}

/**
 * Generate title from metadata
 */
function generateTitle(
  customerName?: string,
  propertyAddress?: string,
  meetingType: string = 'other'
): string {
  const date = new Date().toLocaleDateString();

  if (customerName) {
    return `${customerName} - ${meetingType} - ${date}`;
  }

  if (propertyAddress) {
    return `${propertyAddress} - ${meetingType} - ${date}`;
  }

  return `${meetingType} Meeting - ${date}`;
}

/**
 * Get all saved transcripts
 */
export function getSavedTranscripts(): MeetingTranscript[] {
  const saved = localStorage.getItem('meeting_transcripts');
  if (!saved) return [];

  try {
    const transcripts = JSON.parse(saved);
    return transcripts.map((t: any) => ({
      ...t,
      timestamp: new Date(t.timestamp),
      // Don't restore audioBlob/audioUrl (they're not serializable)
      audioBlob: undefined,
      audioUrl: undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Save transcript to localStorage
 */
function saveTranscript(transcript: MeetingTranscript): void {
  const transcripts = getSavedTranscripts();

  // Don't save audioBlob (not serializable)
  const toSave = {
    ...transcript,
    audioBlob: undefined,
    audioUrl: undefined,
  };

  transcripts.unshift(toSave);

  // Keep only last 30 transcripts
  const trimmed = transcripts.slice(0, 30);

  localStorage.setItem('meeting_transcripts', JSON.stringify(trimmed));
}

/**
 * Delete transcript
 */
export function deleteTranscript(id: string): void {
  const transcripts = getSavedTranscripts();

  // Revoke blob URL if it exists
  const transcript = transcripts.find(t => t.id === id);
  if (transcript?.audioUrl) {
    URL.revokeObjectURL(transcript.audioUrl);
  }

  const filtered = transcripts.filter(t => t.id !== id);
  localStorage.setItem('meeting_transcripts', JSON.stringify(filtered));
}

/**
 * Cleanup recording state and release resources
 */
export function cleanupRecording(state: RecordingState): void {
  if (state.mediaRecorder) {
    // Stop recording if active
    if (state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }

    // Stop all media tracks to release microphone
    state.mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
}

/**
 * Export transcript as markdown
 */
export function exportTranscriptAsMarkdown(transcript: MeetingTranscript): string {
  const objectionsList = transcript.analysis.objections
    .map((obj, i) => `${i + 1}. **Objection:** ${obj.objection}
   - **Response:** ${obj.response}
   - **Status:** ${obj.resolved ? '✅ Resolved' : '⚠️ Unresolved'}`)
    .join('\n\n');

  return `# Meeting Transcript

**Date:** ${transcript.timestamp.toLocaleString()}
**Duration:** ${Math.floor(transcript.duration / 60)}m ${transcript.duration % 60}s
**Type:** ${transcript.metadata.meetingType}
${transcript.metadata.customerName ? `**Customer:** ${transcript.metadata.customerName}` : ''}
${transcript.metadata.propertyAddress ? `**Property:** ${transcript.metadata.propertyAddress}` : ''}
${transcript.analysis.estimatedValue ? `**Estimated Value:** ${transcript.analysis.estimatedValue}` : ''}

## Summary
${transcript.analysis.summary}

## Customer Sentiment
**${transcript.analysis.customerSentiment.toUpperCase()}**

## Action Items
${transcript.analysis.actionItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}

## Objections & Responses
${objectionsList || 'No objections raised'}

## Key Points
${transcript.analysis.keyPoints.map((point, i) => `- ${point}`).join('\n')}

## Next Steps
${transcript.analysis.nextSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

## Full Transcription
${transcript.fullTranscript}

---

*Generated by S21 Field AI - Roof-ER*
*Meeting notes and transcription powered by AI*
`;
}

/**
 * Convert Blob to base64
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `transcript_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format duration in seconds to readable string
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
