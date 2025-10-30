import React, { useState } from 'react';
import { Mail, Send } from 'lucide-react';
import Spinner from './Spinner';

const EmailPanel: React.FC = () => {
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient || !subject || !description) return;

    setIsGenerating(true);
    setTimeout(() => {
      alert('Email generated! This would show the AI-generated email content.');
      setIsGenerating(false);
    }, 2000);
  };

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll">
        <div className="roof-er-page-title">
          <Mail className="w-6 h-6 inline mr-2" style={{ color: 'var(--roof-red)' }} />
          Generate Email
        </div>

        <form onSubmit={handleGenerate} style={{ maxWidth: '800px', margin: '0 auto' }}>
          <input
            className="roof-er-input-field"
            placeholder="Recipient email..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            style={{ marginBottom: '16px', width: '100%' }}
          />
          <input
            className="roof-er-input-field"
            placeholder="Subject line..."
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ marginBottom: '16px', width: '100%' }}
          />
          <textarea
            className="roof-er-input-field"
            placeholder="Describe what you want to say..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            style={{ marginBottom: '16px', width: '100%', minHeight: '150px' }}
          />
          <button
            type="submit"
            className="roof-er-send-btn"
            style={{
              width: '100%',
              height: '48px',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
            disabled={isGenerating || !recipient || !subject || !description}
          >
            {isGenerating ? (
              <Spinner />
            ) : (
              <>
                <Send className="w-5 h-5" />
                Generate Email
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default EmailPanel;
