
import React, { useState } from 'react';
import { generateEmail } from '../services/geminiService';
import Spinner from './Spinner';

const EmailPanel: React.FC = () => {
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [keyPoints, setKeyPoints] = useState('');
  const [generatedEmail, setGeneratedEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState('');

  const canGenerate = recipient.trim() && subject.trim() && keyPoints.trim() && !isLoading;

  const handleGenerateEmail = async () => {
    if (!canGenerate) return;

    setIsLoading(true);
    setError('');
    setGeneratedEmail('');
    setCopySuccess('');

    try {
      const emailDraft = await generateEmail(recipient, subject, keyPoints);
      setGeneratedEmail(emailDraft);
    } catch (err) {
      console.error("Error generating email:", err);
      setError('Failed to generate email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyToClipboard = () => {
    if (!generatedEmail) return;
    navigator.clipboard.writeText(generatedEmail).then(() => {
      setCopySuccess('Copied!');
      setTimeout(() => setCopySuccess(''), 2000);
    }, (err) => {
      console.error('Failed to copy text: ', err);
      setCopySuccess('Failed to copy.');
       setTimeout(() => setCopySuccess(''), 2000);
    });
  };

  return (
    <div className="flex flex-col h-full bg-zinc-800 p-4 space-y-4">
      <h2 className="text-xl font-bold text-white border-b border-zinc-600 pb-2">Email Generator</h2>
      <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-y-auto">
        {/* Left Side: Inputs */}
        <div className="md:w-1/2 flex flex-col space-y-4">
          <input
            type="email"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Recipient's Email"
            className="w-full p-2 bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 text-white"
          />
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject Line"
            className="w-full p-2 bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 text-white"
          />
          <textarea
            value={keyPoints}
            onChange={(e) => setKeyPoints(e.target.value)}
            placeholder="Enter key points, topics, or instructions for the email body... (e.g., - Confirm meeting for Friday at 2 PM. - Request agenda from their team. - Mention our Q3 report is attached.)"
            className="w-full p-2 bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 text-white flex-1 resize-none"
          />
          <button
            onClick={handleGenerateEmail}
            disabled={!canGenerate}
            className="w-full bg-red-700 text-white px-4 py-2 rounded-lg hover:bg-red-800 disabled:bg-red-900 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading && <Spinner />}
            {isLoading ? 'Generating...' : 'Generate Email'}
          </button>
        </div>

        {/* Right Side: Result */}
        <div className="md:w-1/2 flex flex-col">
          <div className="flex-1 bg-zinc-900 rounded-lg p-4 overflow-y-auto border border-zinc-700 relative">
             <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold text-zinc-300">Generated Draft</h3>
                {generatedEmail && (
                    <button onClick={handleCopyToClipboard} className="text-sm bg-zinc-600 hover:bg-zinc-500 text-white py-1 px-3 rounded-md transition-colors">
                        {copySuccess || 'Copy'}
                    </button>
                )}
             </div>
            {error && <p className="text-red-400">{error}</p>}
            {generatedEmail ? (
              <p className="whitespace-pre-wrap text-zinc-200">{generatedEmail}</p>
            ) : (
              !isLoading && <p className="text-zinc-500">Email draft will appear here.</p>
            )}
            {isLoading && (
              <div className="flex items-center justify-center h-full">
                <div className="flex items-center text-zinc-400">
                  <Spinner/> Drafting email...
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailPanel;
