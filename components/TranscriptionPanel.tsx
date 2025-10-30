import React, { useState } from 'react';
import { Mic, Square } from 'lucide-react';

const TranscriptionPanel: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);

  const handleRecord = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      alert('Recording started - Voice transcription active');
    } else {
      alert('Recording stopped');
    }
  };

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll">
        <div className="roof-er-welcome-screen">
          <div className="roof-er-welcome-title">Voice Transcription</div>
          <div className="roof-er-welcome-subtitle">
            Record customer conversations, meetings, or quick notes
          </div>
          <button
            className={`roof-er-record-button ${isRecording ? 'recording' : ''}`}
            onClick={handleRecord}
          >
            {isRecording ? <Square className="w-12 h-12" /> : <Mic className="w-12 h-12" />}
          </button>
          <div style={{ fontSize: '18px', color: 'var(--text-tertiary)', marginTop: '20px' }}>
            {isRecording ? 'Recording... Click to stop' : 'Click to start recording'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TranscriptionPanel;
