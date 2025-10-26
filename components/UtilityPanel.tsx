
import React, { useState } from 'react';
import { summarizeText } from '../services/geminiService';
import Spinner from './Spinner';

const UtilityPanel: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [summary, setSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSummarize = async () => {
    if (!inputText.trim() || isLoading) return;

    setIsLoading(true);
    setError('');
    setSummary('');

    try {
      const result = await summarizeText(inputText);
      setSummary(result);
    } catch (err) {
      console.error("Error summarizing text:", err);
      setError('Failed to summarize text. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-800 p-4 space-y-4">
      <h2 className="text-xl font-bold text-white border-b border-zinc-600 pb-2">Text Summarizer</h2>
      <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-y-auto">
        {/* Left Side: Inputs */}
        <div className="md:w-1/2 flex flex-col space-y-4">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste text here to summarize..."
            className="w-full p-2 bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 text-white flex-1 resize-none"
          />
          <button
            onClick={handleSummarize}
            disabled={!inputText.trim() || isLoading}
            className="w-full bg-red-700 text-white px-4 py-2 rounded-lg hover:bg-red-800 disabled:bg-red-900 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading && <Spinner />}
            {isLoading ? 'Summarizing...' : 'Summarize'}
          </button>
        </div>

        {/* Right Side: Result */}
        <div className="md:w-1/2 flex flex-col">
          <div className="flex-1 bg-zinc-900 rounded-lg p-4 overflow-y-auto border border-zinc-700">
             <h3 className="text-lg font-semibold mb-2 text-zinc-300">Summary</h3>
            {error && <p className="text-red-400">{error}</p>}
            {summary ? (
              <p className="whitespace-pre-wrap text-zinc-200">{summary}</p>
            ) : (
              !isLoading && <p className="text-zinc-500">The summary will appear here.</p>
            )}
            {isLoading && (
              <div className="flex items-center justify-center h-full">
                <div className="flex items-center text-zinc-400">
                  <Spinner/> Generating summary...
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UtilityPanel;
