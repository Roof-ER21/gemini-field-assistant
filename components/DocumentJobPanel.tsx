import React, { useState } from 'react';
import { FileText, X, Save } from 'lucide-react';
import { useToast } from './Toast';

interface DocumentJobPanelProps {
  onClose: () => void;
}

const DocumentJobPanel: React.FC<DocumentJobPanelProps> = ({ onClose }) => {
  const toast = useToast();
  const [noteText, setNoteText] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const saveToTranscription = () => {
    if (!noteText.trim()) {
      toast.warning('Empty Note', 'Please enter a note before saving');
      return;
    }

    try {
      // Get existing transcripts from localStorage (using correct key)
      const existing = localStorage.getItem('meeting_transcripts');
      const transcripts = existing ? JSON.parse(existing) : [];

      // Create new transcript entry matching MeetingTranscript interface
      const newTranscript = {
        id: Date.now().toString(),
        timestamp: new Date(),
        duration: 0, // Manual note has no duration
        title: `Job Note - ${new Date().toLocaleString()}`,
        segments: [{
          timestamp: 0,
          text: noteText.trim(),
          speaker: 'rep'
        }],
        fullTranscript: noteText.trim(),
        analysis: {
          summary: 'Manual job note - no AI analysis',
          actionItems: [],
          objections: [],
          keyPoints: [],
          customerSentiment: 'neutral' as const,
          followUpNeeded: false,
          nextSteps: []
        },
        metadata: {
          meetingType: 'other' as const
        }
      };

      // Add to beginning of array (most recent first)
      transcripts.unshift(newTranscript);

      // Save back to localStorage with correct key
      localStorage.setItem('meeting_transcripts', JSON.stringify(transcripts));

      // Show success feedback
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setNoteText(''); // Clear the note
      }, 2000);

    } catch (error) {
      console.error('Error saving note:', error);
      toast.error('Save Failed', 'Failed to save note. Please try again');
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
              Document Job Notes
            </h2>
            <p style={{
              margin: 0,
              fontSize: '0.75rem',
              color: 'rgba(255, 255, 255, 0.8)'
            }}>
              Quick notes for customers, adjusters, or job details
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

      {/* Main Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '2rem',
        maxWidth: '800px',
        margin: '0 auto',
        width: '100%'
      }}>
        <div style={{
          background: 'rgba(16, 185, 129, 0.05)',
          border: '2px solid rgba(16, 185, 129, 0.2)',
          borderRadius: '16px',
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          flex: 1
        }}>
          {/* Instructions */}
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '12px',
            padding: '1rem',
          }}>
            <h3 style={{
              margin: '0 0 0.5rem 0',
              fontSize: '0.95rem',
              fontWeight: '600',
              color: '#10b981'
            }}>
              📝 How it works:
            </h3>
            <p style={{
              margin: 0,
              fontSize: '0.875rem',
              color: 'rgba(255, 255, 255, 0.8)',
              lineHeight: '1.6'
            }}>
              Type your job notes below and click <strong>Save to Transcription</strong>.
              Your notes will be saved to the <strong>Transcription page</strong> where you can
              view, analyze, and manage them alongside your voice recordings.
            </p>
          </div>

          {/* Note Input Area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <label style={{
              fontSize: '0.95rem',
              fontWeight: '600',
              color: 'rgba(255, 255, 255, 0.9)',
              marginBottom: '0.75rem'
            }}>
              Job Notes:
            </label>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Type your job notes here...

Examples:
• Customer contact: John Smith, 555-1234
• Property: 123 Main St, Boston MA
• Roof condition: 20-year shingles, minor hail damage on north slope
• Next steps: Send estimate by Friday, follow up Monday
• Adjuster: Sarah from State Farm, claim #12345"
              style={{
                flex: 1,
                minHeight: '300px',
                padding: '1rem',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '0.95rem',
                fontFamily: 'inherit',
                lineHeight: '1.6',
                resize: 'vertical',
                outline: 'none',
                transition: 'all 0.2s'
              }}
              onFocus={(e) => {
                e.currentTarget.style.border = '1px solid rgba(16, 185, 129, 0.5)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center'
          }}>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: '0.875rem 1.5rem',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '0.9375rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
            >
              Cancel
            </button>
            <button
              onClick={saveToTranscription}
              disabled={!noteText.trim() || saveSuccess}
              style={{
                flex: 1,
                padding: '0.875rem 1.5rem',
                background: saveSuccess
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : noteText.trim()
                    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                    : 'rgba(16, 185, 129, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '0.9375rem',
                fontWeight: '700',
                cursor: noteText.trim() && !saveSuccess ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                boxShadow: noteText.trim() && !saveSuccess ? '0 4px 12px rgba(16, 185, 129, 0.4)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                opacity: !noteText.trim() ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (noteText.trim() && !saveSuccess) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.5)';
                }
              }}
              onMouseLeave={(e) => {
                if (noteText.trim() && !saveSuccess) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
                }
              }}
            >
              <Save style={{ width: '1.125rem', height: '1.125rem' }} />
              {saveSuccess ? 'Saved Successfully!' : 'Save to Transcription'}
            </button>
          </div>

          {/* Character count */}
          <div style={{
            fontSize: '0.8125rem',
            color: 'rgba(255, 255, 255, 0.5)',
            textAlign: 'right'
          }}>
            {noteText.length} characters
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentJobPanel;
