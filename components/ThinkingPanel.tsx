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
    <div className="flex flex-col h-full bg-zinc-800 p-4 space-y-4">
      <h2 className="text-xl font-bold text-white border-b border-zinc-600 pb-2">Thinking Feature</h2>
      <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-y-auto">
        {/* Left Side: Inputs */}
        <div className="md:w-1/2 flex flex-col space-y-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter a complex prompt that requires reasoning..."
            className="w-full p-2 bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 text-white flex-1 resize-none"
          />

          <div className="space-y-2">
             <label htmlFor="model-select" className="block text-sm font-medium text-zinc-300">Model</label>
            <select
                id="model-select"
                value={model}
                onChange={handleModelChange}
                className="w-full p-2 bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 text-white"
            >
                <option value="gemini-2.5-pro">Gemini 2.5 Pro (Max Budget: 32768)</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Max Budget: 24576)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="thinking-budget" className="block text-sm font-medium text-zinc-300">
              Thinking Budget: <span className="font-bold text-white">{thinkingBudget}</span> tokens
            </label>
            <input
              id="thinking-budget"
              type="range"
              min="0"
              max={maxBudget}
              step="1024"
              value={thinkingBudget}
              onChange={(e) => setThinkingBudget(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-zinc-400">
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
          <div className="flex-1 bg-zinc-900 rounded-lg p-4 overflow-y-auto border border-zinc-700">
             <h3 className="text-lg font-semibold mb-2 text-zinc-300">Response</h3>
            {error && <p className="text-red-400">{error}</p>}
            {result ? (
              <pre className="whitespace-pre-wrap text-zinc-200 font-mono text-sm">{result}</pre>
            ) : (
              !isLoading && <p className="text-zinc-500">The model's response will appear here.</p>
            )}
            {isLoading && (
              <div className="flex items-center justify-center h-full">
                <div className="flex items-center text-zinc-400">
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
