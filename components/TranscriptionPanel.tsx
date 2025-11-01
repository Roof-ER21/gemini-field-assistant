import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Play, Pause, Download, Trash2, Clock, CheckCircle, AlertCircle, User, MapPin } from 'lucide-react';
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

const TranscriptionPanel: React.FC = () => {
  const [recordingState, setRecordingState] = useState<RecordingState | null>(null);
  const [duration, setDuration] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcripts, setTranscripts] = useState<MeetingTranscript[]>([]);
  const [selectedTranscript, setSelectedTranscript] = useState<MeetingTranscript | null>(null);
  const [meetingType, setMeetingType] = useState<'initial' | 'inspection' | 'followup' | 'closing' | 'other'>('initial');
  const [error, setError] = useState<string>('');
  const timerRef = useRef<number | null>(null);

  // Load saved transcripts
  useEffect(() => {
    setTranscripts(getSavedTranscripts());
  }, []);

  // Timer for duration
  useEffect(() => {
    if (recordingState?.isRecording && !recordingState.isPaused) {
      timerRef.current = window.setInterval(() => {
        setDuration(prev => prev + 1);
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
  }, [recordingState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup any active recording when component unmounts
      if (recordingState) {
        cleanupRecording(recordingState);
      }
    };
  }, [recordingState]);

  const handleStartRecording = async () => {
    try {
      setError('');
      setDuration(0);
      const state = await startRecording();
      setRecordingState(state);
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

      // Transcribe
      const transcript = await transcribeAudio(audioBlob, meetingType);
      transcript.duration = recordedDuration;

      setTranscripts(prev => [transcript, ...prev]);
      setSelectedTranscript(transcript);
    } catch (err) {
      setError((err as Error).message || 'Failed to transcribe audio');
      console.error('Transcription error:', err);

      // Cleanup on error
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

  const handleDelete = (id: string) => {
    if (confirm('Delete this transcript?')) {
      deleteTranscript(id);
      setTranscripts(getSavedTranscripts());
      if (selectedTranscript?.id === id) {
        setSelectedTranscript(null);
      }
    }
  };

  const handleDownload = () => {
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
    } catch (err) {
      setError('Failed to download transcript');
      console.error('Download error:', err);
    }
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

        {/* Recording Controls */}
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
                  disabled={!!recordingState}
                  style={{
                    padding: '6px 12px',
                    background: meetingType === type ? 'var(--roof-red)' : 'var(--bg-primary)',
                    color: meetingType === type ? 'white' : 'var(--text-primary)',
                    border: meetingType === type ? 'none' : '1px solid var(--border-color)',
                    borderRadius: '6px',
                    cursor: recordingState ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    fontWeight: 500,
                    textTransform: 'capitalize',
                    opacity: recordingState ? 0.5 : 1
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Recording Button */}
          <div style={{ marginBottom: '16px' }}>
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
                  transition: 'transform 0.2s',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                <Mic className="w-16 h-16" style={{ color: 'white' }} />
              </button>
            )}

            {recordingState && (
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
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
                    justifyContent: 'center'
                  }}
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
                    justifyContent: 'center'
                  }}
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
                margin: '0 auto'
              }}>
                <Clock className="w-16 h-16 animate-spin" style={{ color: 'var(--roof-red)' }} />
              </div>
            )}
          </div>

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
              <span style={{ color: 'var(--roof-red)' }}>Transcribing Audio...</span>
            )}
          </div>

          {/* Duration */}
          {(recordingState || isTranscribing) && (
            <div style={{ fontSize: '32px', fontWeight: 600, color: 'var(--roof-red)', fontFamily: 'monospace' }}>
              {formatDuration(duration)}
            </div>
          )}

          {!recordingState && !isTranscribing && (
            <div style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>
              Click to start recording customer conversations
            </div>
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
              marginBottom: '16px'
            }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {selectedTranscript.title}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '12px' }}>
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
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleDownload}
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
                  Download
                </button>
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
                      padding: '4px 10px',
                      background: 'var(--roof-red)20',
                      color: 'var(--roof-red)',
                      borderRadius: '6px',
                      fontSize: '12px'
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

            {/* Full Transcript (Collapsible) */}
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
                Full Transcript
              </summary>
              <div style={{
                marginTop: '8px',
                padding: '12px',
                background: 'var(--bg-primary)',
                borderRadius: '6px',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                lineHeight: '1.8',
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace'
              }}>
                {selectedTranscript.fullTranscript}
              </div>
            </details>
          </div>
        )}

        {/* Recent Transcripts */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '30px',
          marginBottom: '12px'
        }}>
          <div className="roof-er-page-title" style={{ fontSize: '18px', margin: 0 }}>
            Recent Transcripts ({transcripts.length})
          </div>
        </div>

        {transcripts.length === 0 ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: '14px'
          }}>
            No transcripts yet. Record a meeting to get started.
          </div>
        ) : (
          <div className="roof-er-doc-grid">
            {transcripts.map((transcript) => (
              <div
                key={transcript.id}
                className="roof-er-doc-card"
                onClick={() => setSelectedTranscript(transcript)}
                style={{
                  cursor: 'pointer',
                  border: selectedTranscript?.id === transcript.id ? '2px solid var(--roof-red)' : undefined
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
                  {getSentimentIcon(transcript.analysis.customerSentiment)}
                </div>
                <div className="roof-er-doc-title">{transcript.title}</div>
                <div className="roof-er-doc-desc">
                  {formatDuration(transcript.duration)} • {transcript.metadata.meetingType}
                </div>
                <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  {transcript.analysis.actionItems.length} actions • {transcript.analysis.objections.length} objections
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TranscriptionPanel;
