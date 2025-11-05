import React, { useState, useEffect, useRef } from 'react';
import {
  Mic, Square, Play, Pause, Download, Trash2, Clock, CheckCircle, AlertCircle,
  User, MapPin, Upload, Copy, Share2, FileText, FileJson, FileType, Search,
  Edit2, Check, X, Volume2, MoreVertical
} from 'lucide-react';
import {
  startRecording,
  stopRecording,
  pauseRecording,
  resumeRecording,
  transcribeAudio,
  getSavedTranscripts,
  deleteTranscript,
  exportTranscriptAsMarkdown,
  formatDuration,
  cleanupRecording,
  RecordingState,
  MeetingTranscript
} from '../services/transcriptionService';
import { databaseService } from '../services/databaseService';
import { env } from '../src/config/env';

const TranscriptionPanel: React.FC = () => {
  // Transcription limits from environment (cost control)
  const MAX_DURATION = env.TRANSCRIPTION_MAX_DURATION; // 3 minutes default
  const WARNING_THRESHOLD = env.TRANSCRIPTION_WARNING_THRESHOLD; // 2:30 warning
  const [recordingState, setRecordingState] = useState<RecordingState | null>(null);
  const [duration, setDuration] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcripts, setTranscripts] = useState<MeetingTranscript[]>([]);
  const [selectedTranscript, setSelectedTranscript] = useState<MeetingTranscript | null>(null);
  const [meetingType, setMeetingType] = useState<'initial' | 'inspection' | 'followup' | 'closing' | 'other'>('initial');
  const [error, setError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSpeaker, setEditingSpeaker] = useState<{ index: number; name: string } | null>(null);
  const [speakerNames, setSpeakerNames] = useState<{ [key: string]: string }>({});
  const [audioVolume, setAudioVolume] = useState<number[]>([]);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [meetingNotes, setMeetingNotes] = useState('');
  const [showTimeWarning, setShowTimeWarning] = useState(false);

  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Load saved transcripts
  useEffect(() => {
    setTranscripts(getSavedTranscripts());
  }, []);

  // Timer for duration
  useEffect(() => {
    if (recordingState?.isRecording && !recordingState.isPaused) {
      timerRef.current = window.setInterval(() => {
        setDuration(prev => {
          const newDuration = prev + 1;

          // Show warning at threshold (e.g., 2:30)
          if (newDuration === WARNING_THRESHOLD && !showTimeWarning) {
            setShowTimeWarning(true);
          }

          // Auto-stop at max duration (e.g., 3:00)
          if (newDuration >= MAX_DURATION) {
            handleStopRecording();
            return newDuration;
          }

          return newDuration;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [recordingState, showTimeWarning, MAX_DURATION, WARNING_THRESHOLD]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingState) {
        cleanupRecording(recordingState);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [recordingState]);

  // Audio visualization
  const startAudioVisualization = (stream: MediaStream) => {
    try {
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        if (!analyserRef.current || !recordingState?.isRecording) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;

        setAudioVolume(prev => {
          const newVolume = [...prev, average];
          // Keep only last 50 values
          return newVolume.slice(-50);
        });

        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch (err) {
      console.error('Audio visualization error:', err);
    }
  };

  const handleStartRecording = async () => {
    try {
      setError('');
      setDuration(0);
      setAudioVolume([]);
      setShowTimeWarning(false); // Reset warning state
      const state = await startRecording();
      setRecordingState(state);

      if (state.mediaRecorder?.stream) {
        startAudioVisualization(state.mediaRecorder.stream);
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to start recording');
      console.error('Recording error:', err);
    }
  };

  const handleStopRecording = async () => {
    if (!recordingState) return;

    try {
      setIsTranscribing(true);
      setError('');

      const audioBlob = await stopRecording(recordingState);
      const recordedDuration = duration;

      // Clear recording state immediately
      setRecordingState(null);
      setDuration(0);
      setAudioVolume([]);

      // Stop audio visualization
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Transcribe
      const transcript = await transcribeAudio(audioBlob, meetingType);
      transcript.duration = recordedDuration;

      setTranscripts(prev => [transcript, ...prev]);
      setSelectedTranscript(transcript);

      // Track transcription
      try {
        await databaseService.logTranscription({
          audioDuration: recordedDuration,
          transcriptionText: transcript.fullTranscript,
          wordCount: transcript.fullTranscript.split(/\s+/).length,
          provider: 'Gemini'
        });
      } catch (error) {
        console.warn('Failed to track transcription:', error);
        // Continue - don't disrupt user experience
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to transcribe audio');
      console.error('Transcription error:', err);

      if (recordingState) {
        cleanupRecording(recordingState);
        setRecordingState(null);
      }
    } finally {
      setIsTranscribing(false);
    }
  };

  const handlePauseResume = () => {
    if (!recordingState) return;

    if (recordingState.isPaused) {
      resumeRecording(recordingState);
      setRecordingState({ ...recordingState, isPaused: false });
    } else {
      pauseRecording(recordingState);
      setRecordingState({ ...recordingState, isPaused: true });
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Check file type
    const validTypes = ['audio/mp3','audio/mpeg','audio/wav','audio/m4a','audio/x-m4a','audio/webm','audio/ogg'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|webm|ogg)$/i)) {
      setError('Invalid file type. Please upload MP3, WAV, M4A, WEBM, or OGG files.');
      return;
    }

    // Check file size (50MB max)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File too large. Maximum size is 50MB.');
      return;
    }

    try {
      setError('');
      setIsTranscribing(true);
      setUploadProgress(0);

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      // Convert file to blob
      const audioBlob = new Blob([await file.arrayBuffer()], { type: file.type });

      // Transcribe
      const transcript = await transcribeAudio(audioBlob, meetingType);

      // Calculate approximate duration (not exact without decoding audio)
      transcript.duration = Math.floor(file.size / 16000); // Rough estimate

      clearInterval(progressInterval);
      setUploadProgress(100);

      setTimeout(() => {
        setTranscripts(prev => [transcript, ...prev]);
        setSelectedTranscript(transcript);
        setUploadProgress(0);
      }, 500);

      // Track transcription for uploaded file
      try {
        await databaseService.logTranscription({
          audioDuration: transcript.duration || Math.floor(file.size / 16000),
          transcriptionText: transcript.fullTranscript,
          wordCount: transcript.fullTranscript.split(/\s+/).length,
          provider: 'Gemini'
        });
      } catch (error) {
        console.warn('Failed to track transcription:', error);
        // Continue - don't disrupt user experience
      }

    } catch (err) {
      setError((err as Error).message || 'Failed to transcribe audio file');
      console.error('Upload error:', err);
      setUploadProgress(0);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this transcript?')) {
      deleteTranscript(id);
      setTranscripts(getSavedTranscripts());
      if (selectedTranscript?.id === id) {
        setSelectedTranscript(null);
      }
    }
  };

  const handleExportMarkdown = () => {
    if (!selectedTranscript) return;

    try {
      const markdown = exportTranscriptAsMarkdown(selectedTranscript);
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcript-${selectedTranscript.timestamp.toISOString().split('T')[0]}-${selectedTranscript.metadata.meetingType}.md`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportMenu(false);
    } catch (err) {
      setError('Failed to export as Markdown');
      console.error('Export error:', err);
    }
  };

  const handleExportTXT = () => {
    if (!selectedTranscript) return;

    try {
      const text = `MEETING TRANSCRIPT
Date: ${selectedTranscript.timestamp.toLocaleString()}
Duration: ${formatDuration(selectedTranscript.duration)}
Type: ${selectedTranscript.metadata.meetingType}
${selectedTranscript.metadata.customerName ? `Customer: ${selectedTranscript.metadata.customerName}` : ''}
${selectedTranscript.metadata.propertyAddress ? `Property: ${selectedTranscript.metadata.propertyAddress}` : ''}

SUMMARY
${selectedTranscript.analysis.summary}

FULL TRANSCRIPT
${selectedTranscript.fullTranscript}

Generated by S21 Field AI - Roof-ER
`;
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcript-${selectedTranscript.timestamp.toISOString().split('T')[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportMenu(false);
    } catch (err) {
      setError('Failed to export as TXT');
      console.error('Export error:', err);
    }
  };

  const handleExportJSON = () => {
    if (!selectedTranscript) return;

    try {
      const json = JSON.stringify(selectedTranscript, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcript-${selectedTranscript.timestamp.toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportMenu(false);
    } catch (err) {
      setError('Failed to export as JSON');
      console.error('Export error:', err);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!selectedTranscript) return;

    try {
      await navigator.clipboard.writeText(selectedTranscript.fullTranscript);
      alert('Transcript copied to clipboard!');
    } catch (err) {
      setError('Failed to copy to clipboard');
      console.error('Copy error:', err);
    }
  };

  const handleShare = async () => {
    if (!selectedTranscript) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: selectedTranscript.title,
          text: selectedTranscript.analysis.summary,
        });
      } catch (err) {
        console.error('Share error:', err);
      }
    } else {
      handleCopyToClipboard();
    }
  };

  const handleRenameSpeaker = (segmentIndex: number, currentSpeaker: string) => {
    const currentName = speakerNames[currentSpeaker] || currentSpeaker;
    setEditingSpeaker({ index: segmentIndex, name: currentName });
  };

  const saveSpeakerName = (speaker: string) => {
    if (editingSpeaker) {
      setSpeakerNames(prev => ({
        ...prev,
        [speaker]: editingSpeaker.name
      }));
      setEditingSpeaker(null);
    }
  };

  const getSpeakerDisplayName = (speaker?: string) => {
    if (!speaker || speaker === 'unknown') return 'Unknown';
    return speakerNames[speaker] || (speaker === 'rep' ? 'Rep' : speaker === 'customer' ? 'Customer' : speaker);
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return '#10b981';
      case 'negative': return '#dc2626';
      case 'mixed': return '#f59e0b';
      default: return 'var(--text-secondary)';
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return '😊';
      case 'negative': return '😞';
      case 'mixed': return '😐';
      default: return '🙂';
    }
  };

  const filteredTranscripts = transcripts.filter(t =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.fullTranscript.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.metadata.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.metadata.propertyAddress?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll">
        <div className="roof-er-page-title">
          <Mic className="w-6 h-6 inline mr-2" style={{ color: 'var(--roof-red)' }} />
          Voice Transcription
        </div>

        {error && (
          <div style={{
            padding: '12px',
            background: '#dc262620',
            border: '2px solid #dc2626',
            borderRadius: '8px',
            marginBottom: '20px',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Recording & Upload Section */}
        <div style={{
          background: 'var(--bg-elevated)',
          border: '2px solid var(--border-color)',
          borderRadius: '12px',
          padding: '30px',
          textAlign: 'center',
          marginBottom: '20px'
        }}>
          {/* Meeting Type Selector */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Meeting Type
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {(['initial', 'inspection', 'followup', 'closing', 'other'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setMeetingType(type)}
                  disabled={!!recordingState || isTranscribing}
                  style={{
                    padding: '8px 16px',
                    background: meetingType === type ? 'var(--roof-red)' : 'var(--bg-primary)',
                    color: meetingType === type ? 'white' : 'var(--text-primary)',
                    border: meetingType === type ? 'none' : '1px solid var(--border-color)',
                    borderRadius: '8px',
                    cursor: (recordingState || isTranscribing) ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                    textTransform: 'capitalize',
                    opacity: (recordingState || isTranscribing) ? 0.5 : 1,
                    transition: 'all 0.2s'
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Recording Button */}
          <div style={{ marginBottom: '20px' }}>
            {!recordingState && !isTranscribing && (
              <button
                onClick={handleStartRecording}
                style={{
                  width: '120px',
                  height: '120px',
                  borderRadius: '50%',
                  background: 'var(--roof-red)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(220, 38, 38, 0.4)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.3)';
                }}
              >
                <Mic className="w-16 h-16" style={{ color: 'white' }} />
              </button>
            )}

            {recordingState && (
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={handlePauseResume}
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background: recordingState.isPaused ? '#10b981' : '#f59e0b',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {recordingState.isPaused ? (
                    <Play className="w-10 h-10" style={{ color: 'white' }} />
                  ) : (
                    <Pause className="w-10 h-10" style={{ color: 'white' }} />
                  )}
                </button>

                <button
                  onClick={handleStopRecording}
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background: '#dc2626',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <Square className="w-10 h-10" style={{ color: 'white' }} />
                </button>
              </div>
            )}

            {isTranscribing && (
              <div style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: 'var(--roof-red)20',
                border: '3px solid var(--roof-red)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
                position: 'relative'
              }}>
                <Clock className="w-16 h-16 animate-spin" style={{ color: 'var(--roof-red)' }} />
                {uploadProgress > 0 && (
                  <div style={{
                    position: 'absolute',
                    bottom: '-30px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap'
                  }}>
                    {uploadProgress}%
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Audio Waveform Visualization */}
          {recordingState && !recordingState.isPaused && audioVolume.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              height: '60px',
              marginBottom: '16px'
            }}>
              {audioVolume.slice(-25).map((volume, idx) => (
                <div
                  key={idx}
                  style={{
                    width: '4px',
                    height: `${Math.max(4, (volume / 255) * 60)}px`,
                    background: 'var(--roof-red)',
                    borderRadius: '2px',
                    transition: 'height 0.1s'
                  }}
                />
              ))}
            </div>
          )}

          {/* Status */}
          <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            {!recordingState && !isTranscribing && 'Ready to Record'}
            {recordingState && !recordingState.isPaused && (
              <span style={{ color: 'var(--roof-red)' }}>● Recording...</span>
            )}
            {recordingState?.isPaused && (
              <span style={{ color: '#f59e0b' }}>⏸ Paused</span>
            )}
            {isTranscribing && (
              <span style={{ color: 'var(--roof-red)' }}>
                {uploadProgress > 0 ? 'Processing Audio...' : 'Transcribing Audio...'}
              </span>
            )}
          </div>

          {/* Duration with Countdown Timer */}
          {(recordingState || isTranscribing) && (
            <div style={{ maxWidth: '400px', margin: '0 auto' }}>
              {/* Elapsed Time */}
              <div style={{ fontSize: '32px', fontWeight: 600, color: 'var(--roof-red)', fontFamily: 'monospace', marginBottom: '8px' }}>
                {formatDuration(duration)}
              </div>

              {/* Countdown Timer */}
              {recordingState && (
                <>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: duration >= WARNING_THRESHOLD ? (duration >= MAX_DURATION - 10 ? '#dc2626' : '#f59e0b') : '#10b981',
                    marginBottom: '12px'
                  }}>
                    Time Remaining: {formatDuration(Math.max(0, MAX_DURATION - duration))}
                  </div>

                  {/* Progress Bar */}
                  <div style={{
                    width: '100%',
                    height: '8px',
                    background: 'var(--bg-primary)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    position: 'relative',
                    marginBottom: '16px'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${(duration / MAX_DURATION) * 100}%`,
                      background: duration >= WARNING_THRESHOLD
                        ? (duration >= MAX_DURATION - 10 ? '#dc2626' : '#f59e0b')
                        : '#10b981',
                      transition: 'all 0.3s ease',
                      borderRadius: '4px'
                    }} />
                  </div>

                  {/* Warning Notification */}
                  {showTimeWarning && (
                    <div style={{
                      padding: '12px 16px',
                      background: '#f59e0b20',
                      border: '2px solid #f59e0b',
                      borderRadius: '8px',
                      marginTop: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      animation: 'pulse 2s ease-in-out infinite'
                    }}>
                      <AlertCircle className="w-5 h-5" style={{ color: '#f59e0b', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b', marginBottom: '2px' }}>
                          Recording Time Limit Warning
                        </div>
                        <div style={{ fontSize: '12px', color: '#d97706' }}>
                          Recording will auto-stop in {formatDuration(Math.max(0, MAX_DURATION - duration))} to control costs
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Max Duration Reached */}
                  {duration >= MAX_DURATION && (
                    <div style={{
                      padding: '12px 16px',
                      background: '#dc262620',
                      border: '2px solid #dc2626',
                      borderRadius: '8px',
                      marginTop: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}>
                      <AlertCircle className="w-5 h-5" style={{ color: '#dc2626', flexShrink: 0 }} />
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#dc2626' }}>
                        Max recording time reached ({formatDuration(MAX_DURATION)})
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* File Upload Area */}
          {!recordingState && !isTranscribing && (
            <>
              <div style={{ margin: '20px 0', color: 'var(--text-tertiary)', fontSize: '14px' }}>
                or
              </div>
              <div
                ref={dropZoneRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '30px',
                  border: isDragging ? '3px dashed var(--roof-red)' : '2px dashed var(--border-color)',
                  borderRadius: '12px',
                  background: isDragging ? 'var(--roof-red)10' : 'var(--bg-primary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-secondary)' }} />
                <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Upload Audio File
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                  Drag & drop or click to select<br/>
                  MP3, WAV, M4A (max 50MB)
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/mp3,audio/mpeg,audio/wav,audio/m4a"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />

              {/* Meeting Notes Section */}
              <div style={{
                marginTop: '24px',
                padding: '20px',
                background: 'var(--bg-elevated)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px'
                }}>
                  <FileText className="w-5 h-5" style={{ color: 'var(--roof-red)' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                    Meeting Notes
                  </h3>
                </div>
                <textarea
                  value={meetingNotes}
                  onChange={(e) => setMeetingNotes(e.target.value)}
                  placeholder="Add notes about this meeting... (customer name, property details, key points discussed, etc.)"
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    padding: '12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    resize: 'vertical'
                  }}
                />
                <div style={{
                  marginTop: '8px',
                  fontSize: '12px',
                  color: 'var(--text-tertiary)'
                }}>
                  These notes will be saved with your transcript
                </div>
              </div>
            </>
          )}
        </div>

        {/* Selected Transcript Detail */}
        {selectedTranscript && (
          <div style={{
            background: 'var(--bg-elevated)',
            border: '2px solid var(--border-color)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {selectedTranscript.title}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span>{selectedTranscript.timestamp.toLocaleString()}</span>
                  <span>•</span>
                  <span>{formatDuration(selectedTranscript.duration)}</span>
                  {selectedTranscript.metadata.customerName && (
                    <>
                      <span>•</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <User className="w-3 h-3" />
                        {selectedTranscript.metadata.customerName}
                      </span>
                    </>
                  )}
                  {selectedTranscript.metadata.propertyAddress && (
                    <>
                      <span>•</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin className="w-3 h-3" />
                        {selectedTranscript.metadata.propertyAddress}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={handleCopyToClipboard}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </button>

                <button
                  onClick={handleShare}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </button>

                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--roof-red)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Download className="w-4 h-4" />
                    Export
                  </button>

                  {showExportMenu && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: '4px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 100,
                      minWidth: '160px'
                    }}>
                      <button
                        onClick={handleExportTXT}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          color: 'var(--text-primary)',
                          borderBottom: '1px solid var(--border-color)'
                        }}
                      >
                        <FileText className="w-4 h-4" />
                        Export as TXT
                      </button>
                      <button
                        onClick={handleExportMarkdown}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          color: 'var(--text-primary)',
                          borderBottom: '1px solid var(--border-color)'
                        }}
                      >
                        <FileType className="w-4 h-4" />
                        Export as MD
                      </button>
                      <button
                        onClick={handleExportJSON}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          color: 'var(--text-primary)'
                        }}
                      >
                        <FileJson className="w-4 h-4" />
                        Export as JSON
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleDelete(selectedTranscript.id)}
                  style={{
                    padding: '8px 12px',
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Summary & Sentiment */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div style={{
                padding: '12px',
                background: 'var(--bg-primary)',
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  SENTIMENT
                </div>
                <div style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: getSentimentColor(selectedTranscript.analysis.customerSentiment),
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span>{getSentimentIcon(selectedTranscript.analysis.customerSentiment)}</span>
                  {selectedTranscript.analysis.customerSentiment}
                </div>
              </div>

              {selectedTranscript.analysis.estimatedValue && (
                <div style={{
                  padding: '12px',
                  background: 'var(--bg-primary)',
                  borderRadius: '8px'
                }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    ESTIMATED VALUE
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: '#10b981' }}>
                    {selectedTranscript.analysis.estimatedValue}
                  </div>
                </div>
              )}

              <div style={{
                padding: '12px',
                background: selectedTranscript.analysis.followUpNeeded ? '#f59e0b20' : '#10b98120',
                borderRadius: '8px',
                border: `2px solid ${selectedTranscript.analysis.followUpNeeded ? '#f59e0b' : '#10b981'}`
              }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  FOLLOW-UP
                </div>
                <div style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: selectedTranscript.analysis.followUpNeeded ? '#f59e0b' : '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  {selectedTranscript.analysis.followUpNeeded ? (
                    <><Clock className="w-5 h-5" /> NEEDED</>
                  ) : (
                    <><CheckCircle className="w-5 h-5" /> NONE</>
                  )}
                </div>
              </div>
            </div>

            {/* Summary */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Summary
              </div>
              <div style={{
                fontSize: '14px',
                color: 'var(--text-secondary)',
                lineHeight: '1.6',
                padding: '12px',
                background: 'var(--bg-primary)',
                borderRadius: '6px'
              }}>
                {selectedTranscript.analysis.summary}
              </div>
            </div>

            {/* Action Items */}
            {selectedTranscript.analysis.actionItems.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Action Items ({selectedTranscript.analysis.actionItems.length})
                </div>
                <ul style={{
                  margin: 0,
                  paddingLeft: '20px',
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.8'
                }}>
                  {selectedTranscript.analysis.actionItems.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Objections */}
            {selectedTranscript.analysis.objections.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Objections & Responses ({selectedTranscript.analysis.objections.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {selectedTranscript.analysis.objections.map((obj, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px',
                        background: 'var(--bg-primary)',
                        borderRadius: '6px',
                        borderLeft: `4px solid ${obj.resolved ? '#10b981' : '#f59e0b'}`
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {obj.objection}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                        <strong>Response:</strong> {obj.response}
                      </div>
                      <div style={{ fontSize: '11px', color: obj.resolved ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                        {obj.resolved ? '✅ Resolved' : '⚠️ Unresolved'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key Points */}
            {selectedTranscript.analysis.keyPoints.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Key Points
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {selectedTranscript.analysis.keyPoints.map((point, idx) => (
                    <span key={idx} style={{
                      padding: '6px 12px',
                      background: 'var(--roof-red)20',
                      color: 'var(--roof-red)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500
                    }}>
                      {point}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Next Steps */}
            {selectedTranscript.analysis.nextSteps.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Next Steps
                </div>
                <ol style={{
                  margin: 0,
                  paddingLeft: '20px',
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.8'
                }}>
                  {selectedTranscript.analysis.nextSteps.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              </div>
            )}

            {/* Full Transcript with Speaker Labels */}
            <details style={{ marginTop: '16px' }}>
              <summary style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                cursor: 'pointer',
                padding: '8px',
                background: 'var(--bg-primary)',
                borderRadius: '6px'
              }}>
                Full Transcript with Speakers
              </summary>
              <div style={{ marginTop: '8px' }}>
                {selectedTranscript.segments.map((segment, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 12px',
                      background: segment.speaker === 'rep' ? '#3b82f620' : segment.speaker === 'customer' ? '#10b98120' : 'var(--bg-primary)',
                      borderRadius: '6px',
                      marginBottom: '8px',
                      borderLeft: `3px solid ${segment.speaker === 'rep' ? '#3b82f6' : segment.speaker === 'customer' ? '#10b981' : 'var(--border-color)'}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {editingSpeaker?.index === idx ? (
                          <>
                            <input
                              type="text"
                              value={editingSpeaker.name}
                              onChange={(e) => setEditingSpeaker({ ...editingSpeaker, name: e.target.value })}
                              style={{
                                padding: '4px 8px',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                fontSize: '12px',
                                background: 'var(--bg-elevated)',
                                color: 'var(--text-primary)'
                              }}
                              autoFocus
                            />
                            <button
                              onClick={() => saveSpeakerName(segment.speaker || 'unknown')}
                              style={{
                                padding: '4px',
                                background: '#10b981',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              <Check className="w-3 h-3" style={{ color: 'white' }} />
                            </button>
                            <button
                              onClick={() => setEditingSpeaker(null)}
                              style={{
                                padding: '4px',
                                background: '#dc2626',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              <X className="w-3 h-3" style={{ color: 'white' }} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: segment.speaker === 'rep' ? '#3b82f6' : segment.speaker === 'customer' ? '#10b981' : 'var(--text-secondary)' }}>
                              {getSpeakerDisplayName(segment.speaker)}
                            </span>
                            <button
                              onClick={() => handleRenameSpeaker(idx, segment.speaker || 'unknown')}
                              style={{
                                padding: '2px',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                opacity: 0.5
                              }}
                            >
                              <Edit2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
                            </button>
                          </>
                        )}
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                        {formatDuration(segment.timestamp)}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.6' }}>
                      {segment.text}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        {/* Search Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginTop: '30px',
          marginBottom: '12px'
        }}>
          <div className="roof-er-page-title" style={{ fontSize: '18px', margin: 0, flex: 1 }}>
            Transcription History ({transcripts.length})
          </div>
          <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
            <Search className="w-4 h-4" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search transcripts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                fontSize: '13px',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)'
              }}
            />
          </div>
        </div>

        {/* Recent Transcripts */}
        {filteredTranscripts.length === 0 ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: '14px'
          }}>
            {searchQuery ? 'No transcripts found matching your search.' : 'No transcripts yet. Record a meeting to get started.'}
          </div>
        ) : (
          <div className="roof-er-doc-grid">
            {filteredTranscripts.map((transcript) => (
              <div
                key={transcript.id}
                className="roof-er-doc-card"
                onClick={() => setSelectedTranscript(transcript)}
                style={{
                  cursor: 'pointer',
                  border: selectedTranscript?.id === transcript.id ? '2px solid var(--roof-red)' : undefined,
                  position: 'relative'
                }}
              >
                <div style={{ fontSize: '20px', marginBottom: '8px' }}>
                  {getSentimentIcon(transcript.analysis.customerSentiment)}
                </div>
                <div className="roof-er-doc-title">{transcript.title}</div>
                <div className="roof-er-doc-desc">
                  {formatDuration(transcript.duration)} • {transcript.metadata.meetingType}
                </div>
                <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-tertiary)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span>{transcript.analysis.actionItems.length} actions</span>
                  <span>•</span>
                  <span>{transcript.analysis.objections.length} objections</span>
                  {transcript.analysis.estimatedValue && (
                    <>
                      <span>•</span>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>{transcript.analysis.estimatedValue}</span>
                    </>
                  )}
                </div>
                {transcript.audioUrl && (
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                    <audio
                      controls
                      src={transcript.audioUrl}
                      style={{ width: '100%', height: '32px' }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TranscriptionPanel;
