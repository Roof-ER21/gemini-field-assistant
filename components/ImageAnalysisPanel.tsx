
import React, { useState, useRef } from 'react';
import { analyzeImage } from '../services/geminiService';
import Spinner from './Spinner';
import { ImageIcon } from './icons/ImageIcon';

const ImageAnalysisPanel: React.FC = () => {
  const [image, setImage] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select a valid image file.');
        return;
      }
      setError('');
      setResult('');
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setImage(base64String);
        setImageMimeType(file.type);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!image || !prompt.trim() || isLoading) return;
    setIsLoading(true);
    setError('');
    setResult('');
    try {
      if (!imageMimeType) throw new Error("Image MIME type not set.");
      const analysisResult = await analyzeImage(image, imageMimeType, prompt);
      setResult(analysisResult);
    } catch (err) {
      console.error("Error analyzing image:", err);
      setError('Failed to analyze image. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const triggerFileSelect = () => fileInputRef.current?.click();

  return (
    <div className="flex flex-col h-full bg-zinc-800 p-4 space-y-4">
      <h2 className="text-xl font-bold text-white border-b border-zinc-600 pb-2">Image Analyzer</h2>
      <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-y-auto">
        {/* Left Side: Image Upload & Prompt */}
        <div className="md:w-1/2 flex flex-col space-y-4">
          <div
            className="flex-1 border-2 border-dashed border-zinc-600 rounded-lg flex flex-col items-center justify-center p-4 text-zinc-400 hover:border-red-600 hover:text-white transition-colors cursor-pointer"
            onClick={triggerFileSelect}
          >
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageChange} className="hidden" />
            {image ? (
              <img src={`data:${imageMimeType};base64,${image}`} alt="Uploaded preview" className="max-h-full max-w-full object-contain rounded-lg" />
            ) : (
              <>
                <ImageIcon className="h-16 w-16 mb-2" />
                <span>Click to upload an image</span>
              </>
            )}
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What do you want to know about this image? (e.g., 'Identify safety hazards', 'What model is this equipment?')"
            className="w-full p-2 bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 text-white h-24 resize-none"
            disabled={!image}
          />
          <button
            onClick={handleAnalyze}
            disabled={!image || !prompt.trim() || isLoading}
            className="w-full bg-red-700 text-white px-4 py-2 rounded-lg hover:bg-red-800 disabled:bg-red-900 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading && <Spinner />}
            {isLoading ? 'Analyzing...' : 'Analyze Image'}
          </button>
        </div>

        {/* Right Side: Result */}
        <div className="md:w-1/2 flex flex-col">
          <div className="flex-1 bg-zinc-900 rounded-lg p-4 overflow-y-auto border border-zinc-700">
            <h3 className="text-lg font-semibold mb-2 text-zinc-300">Analysis Result</h3>
            {error && <p className="text-red-400">{error}</p>}
            {result ? (
              <p className="whitespace-pre-wrap text-zinc-200">{result}</p>
            ) : (
              !isLoading && <p className="text-zinc-500">Analysis will appear here.</p>
            )}
            {isLoading && (
              <div className="flex items-center justify-center h-full">
                <div className="flex items-center text-zinc-400">
                  <Spinner/> Generating analysis...
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageAnalysisPanel;
