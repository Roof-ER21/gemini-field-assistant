
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { connectTranscriptionStream } from '../services/geminiService';
import { LiveServerMessage, LiveSession } from "@google/genai";
import { encode } from '../utils/audio';
import { MicIcon } from './icons/MicIcon';

const TranscriptionPanel: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [error, setError] = useState('');
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const stopRecordingResources = useCallback(() => {
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

  const startRecording = async () => {
    setError('');
    setTranscription('');
    setIsRecording(true);
    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      
      sessionPromiseRef.current = connectTranscriptionStream({
        onopen: () => console.log("Connection opened."),
        onclose: () => console.log("Connection closed."),
        onerror: (e) => {
          console.error("Connection error:", e);
          setError("Connection error. Please try again.");
          stopRecording();
        },
        onmessage: (message: LiveServerMessage) => {
          if (message.serverContent?.inputTranscription) {
            setTranscription(prev => prev + message.serverContent.inputTranscription.text);
          }
          if (message.serverContent?.turnComplete) {
            setTranscription(prev => prev + '\n');
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
      console.error("Error starting recording:", err);
      setError("Could not start recording. Please ensure microphone access is granted.");
      setIsRecording(false);
      stopRecordingResources();
    }
  };

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    stopRecordingResources();
  }, [stopRecordingResources]);
  
  useEffect(() => {
    return () => {
      stopRecordingResources();
    };
  }, [stopRecordingResources]);

  return (
    <div className="flex flex-col h-full bg-zinc-800 p-4 space-y-4">
      <h2 className="text-xl font-bold text-white border-b border-zinc-600 pb-2">Transcribe Note</h2>
      <div className="flex-1 flex flex-col">
        <div className="bg-zinc-900 rounded-lg p-4 flex-1 overflow-y-auto border border-zinc-700">
          <p className="whitespace-pre-wrap text-zinc-200">
            {transcription || <span className="text-zinc-500">Your transcribed text will appear here...</span>}
          </p>
        </div>
      </div>
      <div className="flex flex-col items-center space-y-4 pt-4">
        {error && <p className="text-red-400">{error}</p>}
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="bg-red-700 text-white px-6 py-3 rounded-full hover:bg-red-800 flex items-center space-x-2 text-lg font-semibold"
          >
            <MicIcon className="h-6 w-6" />
            <span>Start Recording</span>
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="bg-red-600 text-white px-6 py-3 rounded-full hover:bg-red-700 flex items-center space-x-2 text-lg font-semibold animate-pulse"
          >
            <div className="h-6 w-6 flex items-center justify-center"><div className="h-3 w-3 bg-white rounded-sm"></div></div>
            <span>Stop Recording</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default TranscriptionPanel;
