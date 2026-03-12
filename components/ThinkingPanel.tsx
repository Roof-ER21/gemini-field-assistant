// Fix: Implement the ThinkingPanel component to demonstrate the thinking feature.
import React, { useState } from 'react';
import { getComplexAnswer } from '../services/geminiService';
import Spinner from './Spinner';

const ThinkingPanel: React.FC = () => {
  const [prompt, setPrompt] = useState('Write Python code for a web application that visualizes real-time stock market data.');
  const [thinkingBudget, setThinkingBudget] = useState(8192);
  const [model, setModel] = useState<'gemini-2.5-pro' | 'gemini-2.5-flash'>('gemini-2.5-pro');
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const maxBudget = model === 'gemini-2.5-pro' ? 32768 : 24576;

  const handleGenerate = async () => {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setError('');
    setResult('');

    try {
      const answer = await getComplexAnswer(prompt, thinkingBudget, model);
      setResult(answer);
    } catch (err) {
      console.error("Error with complex query:", err);
      setError('Failed to get an answer. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value as 'gemini-2.5-pro' | 'gemini-2.5-flash';
    setModel(newModel);
    // Reset budget if it exceeds new model's max
    const newMaxBudget = newModel === 'gemini-2.5-pro' ? 32768 : 24576;
    if (thinkingBudget > newMaxBudget) {
      setThinkingBudget(newMaxBudget);
    }
  };

  return (
    <div className="flex flex-col h-full p-4 space-y-4" style={{ background: 'var(--bg-card)' }}>
      <h2 className="text-xl font-bold border-b pb-2" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-default)' }}>Thinking Feature</h2>
      <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-y-auto">
        {/* Left Side: Inputs */}
        <div className="md:w-1/2 flex flex-col space-y-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter a complex prompt that requires reasoning..."
            className="w-full p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 flex-1 resize-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
          />

          <div className="space-y-2">
             <label htmlFor="model-select" className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Model</label>
            <select
                id="model-select"
                value={model}
                onChange={handleModelChange}
                className="w-full p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            >
                <option value="gemini-2.5-pro">Gemini 2.5 Pro (Max Budget: 32768)</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Max Budget: 24576)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="thinking-budget" className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Thinking Budget: <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{thinkingBudget}</span> tokens
            </label>
            <input
              id="thinking-budget"
              type="range"
              min="0"
              max={maxBudget}
              step="1024"
              value={thinkingBudget}
              onChange={(e) => setThinkingBudget(parseInt(e.target.value, 10))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{ background: 'var(--border-default)' }}
            />
            <div className="flex justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <span>0 (Fastest)</span>
                <span>{maxBudget} (Most Reasoning)</span>
            </div>
          </div>
          
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isLoading}
            className="w-full bg-red-700 text-white px-4 py-2 rounded-lg hover:bg-red-800 disabled:bg-red-900 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading && <Spinner />}
            {isLoading ? 'Thinking...' : 'Generate with Thinking'}
          </button>
        </div>

        {/* Right Side: Result */}
        <div className="md:w-1/2 flex flex-col">
          <div className="flex-1 rounded-lg p-4 overflow-y-auto" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)' }}>
             <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Response</h3>
            {error && <p className="text-red-400">{error}</p>}
            {result ? (
              <pre className="whitespace-pre-wrap font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>{result}</pre>
            ) : (
              !isLoading && <p style={{ color: 'var(--text-disabled)' }}>The model's response will appear here.</p>
            )}
            {isLoading && (
              <div className="flex items-center justify-center h-full">
                <div className="flex items-center" style={{ color: 'var(--text-tertiary)' }}>
                  <Spinner/> The model is thinking...
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThinkingPanel;
