import React, { useState, useRef, useEffect } from 'react';
import { FileText, X, Save, Mic, Square, Loader2, Copy, CheckCircle, Sparkles } from 'lucide-react';
import { multiAI, AIMessage } from '../services/multiProviderAI';

interface DocumentJobPanelProps {
  onClose: () => void;
}

interface JobNote {
  id: string;
  timestamp: Date;
  content: string;
  transcription?: string;
  isRecording?: boolean;
}

const DocumentJobPanel: React.FC<DocumentJobPanelProps> = ({ onClose }) => {
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [currentNote, setCurrentNote] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const notesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    notesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [notes]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsProcessing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        try {
          // Convert audio to base64 for Gemini
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64Audio = (reader.result as string).split(',')[1];

            try {
              // For now, use a placeholder for transcription
              // You can integrate actual transcription service here
              const transcription = '[Voice note recorded - transcription pending]';

              const newNote: JobNote = {
                id: Date.now().toString(),
                timestamp: new Date(),
                content: currentNote,
                transcription: transcription
              };

              setNotes(prev => [...prev, newNote]);
              setCurrentNote('');
            } catch (error) {
              console.error('Transcription error:', error);
              const newNote: JobNote = {
                id: Date.now().toString(),
                timestamp: new Date(),
                content: currentNote,
                transcription: '[Transcription unavailable - please check your Gemini API connection]'
              };
              setNotes(prev => [...prev, newNote]);
            }
          };
          reader.readAsDataURL(audioBlob);
        } catch (error) {
          console.error('Audio processing error:', error);
        } finally {
          setIsProcessing(false);
        }

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const saveNote = () => {
    if (!currentNote.trim()) return;

    const newNote: JobNote = {
      id: Date.now().toString(),
      timestamp: new Date(),
      content: currentNote
    };

    setNotes(prev => [...prev, newNote]);
    setCurrentNote('');
  };

  const getAllNotesText = () => {
    return notes.map(note => {
      let text = `[${note.timestamp.toLocaleString()}]\n${note.content}`;
      if (note.transcription) {
        text += `\n\nVoice Note Transcription:\n${note.transcription}`;
      }
      return text;
    }).join('\n\n---\n\n');
  };

  const copyAllNotes = () => {
    const allText = getAllNotesText();
    navigator.clipboard.writeText(allText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const analyzeJob = async () => {
    if (notes.length === 0) {
      alert('Please add some notes first before analyzing.');
      return;
    }

    setAnalyzing(true);
    const allNotes = getAllNotesText();

    const analysisPrompt = `You are analyzing job notes from a roofing sales rep. Based on these notes, provide a professional job summary:

${allNotes}

Create a structured summary with:

🏠 **Job Overview:**
[Brief description of the property and scope]

📋 **Key Findings:**
- [Important observations from the notes]
- [Damage or issues noted]
- [Customer concerns or requests]

💼 **Next Steps:**
1. [Action items for the rep]
2. [Follow-up needed]
3. [Customer communication needed]

⚠️ **Important Notes:**
[Anything critical to remember]

Keep it concise and actionable. Format for easy reading.`;

    try {
      const messages: AIMessage[] = [
        { role: 'user', content: analysisPrompt }
      ];
      const response = await multiAI.generate(messages);
      setAnalysis(response.content);
    } catch (error) {
      setAnalysis('Unable to analyze at this time. Please check your connection and try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'var(--bg-primary)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '2px solid rgba(16, 185, 129, 0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <FileText style={{ width: '1.5rem', height: '1.5rem', color: '#fff' }} />
          <div>
            <h2 style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#fff'
            }}>
              Document Job
            </h2>
            <p style={{
              margin: 0,
              fontSize: '0.75rem',
              color: 'rgba(255, 255, 255, 0.8)'
            }}>
              Smart note-taking with voice transcription
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            border: 'none',
            borderRadius: '8px',
            padding: '0.5rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
        >
          <X style={{ width: '1.25rem', height: '1.25rem', color: '#fff' }} />
        </button>
      </div>

      {/* Notes Display */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '1.5rem'
      }}>
        {notes.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            color: 'rgba(255, 255, 255, 0.5)'
          }}>
            <FileText style={{ width: '3rem', height: '3rem', margin: '0 auto 1rem', opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: '1rem' }}>
              No notes yet. Start documenting your job below.
            </p>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>
              Type notes or use voice recording for hands-free documentation.
            </p>
          </div>
        ) : (
          <>
            {notes.map((note) => (
              <div
                key={note.id}
                style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '12px',
                  padding: '1rem',
                  marginBottom: '1rem'
                }}
              >
                <div style={{
                  fontSize: '0.75rem',
                  color: 'rgba(255, 255, 255, 0.5)',
                  marginBottom: '0.5rem'
                }}>
                  {note.timestamp.toLocaleString()}
                </div>
                <div style={{
                  fontSize: '0.9375rem',
                  color: '#fff',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  marginBottom: note.transcription ? '0.75rem' : '0'
                }}>
                  {note.content}
                </div>
                {note.transcription && (
                  <div style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    borderLeft: '3px solid #10b981',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    marginTop: '0.75rem'
                  }}>
                    <div style={{
                      fontSize: '0.75rem',
                      color: '#10b981',
                      fontWeight: '600',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <Mic style={{ width: '0.875rem', height: '0.875rem' }} />
                      Voice Transcription:
                    </div>
                    <div style={{
                      fontSize: '0.875rem',
                      color: 'rgba(255, 255, 255, 0.8)',
                      lineHeight: '1.5',
                      fontStyle: 'italic'
                    }}>
                      {note.transcription}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* AI Analysis Section */}
            {analysis && (
              <div style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '12px',
                padding: '1.25rem',
                marginBottom: '1rem'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                  color: '#3b82f6',
                  fontWeight: '600'
                }}>
                  <Sparkles style={{ width: '1.25rem', height: '1.25rem' }} />
                  AI Job Analysis
                </div>
                <div style={{
                  fontSize: '0.9375rem',
                  color: '#fff',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap'
                }}>
                  {analysis}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={notesEndRef} />
      </div>

      {/* Action Buttons */}
      {notes.length > 0 && (
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={copyAllNotes}
            disabled={copied}
            style={{
              background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              padding: '0.625rem 1rem',
              color: '#fff',
              cursor: copied ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              transition: 'all 0.2s'
            }}
          >
            {copied ? (
              <>
                <CheckCircle style={{ width: '1rem', height: '1rem' }} />
                Copied!
              </>
            ) : (
              <>
                <Copy style={{ width: '1rem', height: '1rem' }} />
                Copy All Notes
              </>
            )}
          </button>

          <button
            onClick={analyzeJob}
            disabled={analyzing}
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              border: 'none',
              borderRadius: '8px',
              padding: '0.625rem 1rem',
              color: '#fff',
              cursor: analyzing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              opacity: analyzing ? 0.7 : 1
            }}
          >
            {analyzing ? (
              <>
                <Loader2 style={{ width: '1rem', height: '1rem', animation: 'spin 1s linear infinite' }} />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles style={{ width: '1rem', height: '1rem' }} />
                AI Analyze Job
              </>
            )}
          </button>
        </div>
      )}

      {/* Note Input */}
      <div style={{
        padding: '1rem 1.5rem',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'rgba(0, 0, 0, 0.2)'
      }}>
        <textarea
          value={currentNote}
          onChange={(e) => setCurrentNote(e.target.value)}
          placeholder="Type your job notes here... (e.g., property address, damage observed, customer concerns)"
          disabled={isRecording || isProcessing}
          style={{
            width: '100%',
            minHeight: '80px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '0.875rem',
            color: '#fff',
            fontSize: '0.9375rem',
            resize: 'vertical',
            marginBottom: '0.75rem',
            outline: 'none',
            fontFamily: 'inherit'
          }}
        />

        <div style={{
          display: 'flex',
          gap: '0.75rem'
        }}>
          <button
            onClick={saveNote}
            disabled={!currentNote.trim() || isRecording || isProcessing}
            style={{
              flex: 1,
              background: currentNote.trim() && !isRecording && !isProcessing
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'rgba(16, 185, 129, 0.3)',
              border: 'none',
              borderRadius: '12px',
              padding: '0.875rem',
              color: '#fff',
              cursor: currentNote.trim() && !isRecording && !isProcessing ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              fontSize: '0.9375rem',
              fontWeight: '500'
            }}
          >
            <Save style={{ width: '1.125rem', height: '1.125rem' }} />
            Save Note
          </button>

          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            style={{
              background: isRecording
                ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              border: 'none',
              borderRadius: '12px',
              padding: '0.875rem 1.25rem',
              color: '#fff',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.9375rem',
              fontWeight: '500',
              opacity: isProcessing ? 0.5 : 1,
              animation: isRecording ? 'pulse 1.5s ease-in-out infinite' : 'none'
            }}
          >
            {isProcessing ? (
              <>
                <Loader2 style={{ width: '1.125rem', height: '1.125rem', animation: 'spin 1s linear infinite' }} />
                Processing...
              </>
            ) : isRecording ? (
              <>
                <Square style={{ width: '1.125rem', height: '1.125rem' }} />
                Stop
              </>
            ) : (
              <>
                <Mic style={{ width: '1.125rem', height: '1.125rem' }} />
                Record
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
};

export default DocumentJobPanel;
