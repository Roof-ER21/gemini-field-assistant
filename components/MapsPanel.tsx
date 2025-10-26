
import React, { useState, useEffect } from 'react';
import { searchMaps } from '../services/geminiService';
import Spinner from './Spinner';
import { GroundingChunk } from '../types';

interface Location {
    latitude: number;
    longitude: number;
}

const MapsPanel: React.FC = () => {
    const [query, setQuery] = useState('');
    const [resultText, setResultText] = useState('');
    const [chunks, setChunks] = useState<GroundingChunk[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [location, setLocation] = useState<Location | undefined>(undefined);
    const [locationError, setLocationError] = useState('');

    useEffect(() => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
                setLocationError('');
            },
            (err) => {
                console.warn(`Could not get location: ${err.message}`);
                setLocationError('Location access denied. Search results may be less relevant.');
            }
        );
    }, []);


    const handleSearch = async () => {
        if (!query.trim() || isLoading) return;
        setIsLoading(true);
        setError('');
        setResultText('');
        setChunks([]);

        try {
            const { text, chunks } = await searchMaps(query, location);
            setResultText(text);
            setChunks(chunks);
        } catch (err) {
            console.error("Error searching Maps:", err);
            setError('Failed to perform search. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-zinc-800 p-4 space-y-4">
            <h2 className="text-xl font-bold text-white border-b border-zinc-600 pb-2">Maps Search</h2>
            <div className="flex items-center">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="e.g., 'What good Italian restaurants are nearby?'"
                    className="flex-1 p-3 bg-zinc-900 border border-zinc-600 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-red-600 text-white"
                    disabled={isLoading}
                />
                <button
                    onClick={handleSearch}
                    disabled={!query.trim() || isLoading}
                    className="bg-red-700 text-white px-6 py-3 rounded-r-lg hover:bg-red-800 disabled:bg-red-900 disabled:cursor-not-allowed flex items-center justify-center"
                >
                    {isLoading ? <Spinner /> : 'Search'}
                </button>
            </div>
             {locationError && <p className="text-yellow-400 text-sm">{locationError}</p>}
            <div className="flex-1 bg-zinc-900 rounded-lg p-4 overflow-y-auto border border-zinc-700">
                <h3 className="text-lg font-semibold mb-2 text-zinc-300">Search Result</h3>
                {error && <p className="text-red-400">{error}</p>}
                {resultText && <p className="whitespace-pre-wrap text-zinc-200">{resultText}</p>}

                {chunks.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-zinc-700">
                        <h4 className="font-semibold text-zinc-400 mb-2">Sources:</h4>
                        <ul className="list-disc list-inside space-y-1">
                            {chunks.map((chunk, index) => {
                                const source = chunk.maps || chunk.web;
                                if (!source) return null;
                                return (
                                    <li key={index}>
                                        <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-red-400 hover:underline">
                                            {source.title}
                                        </a>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                )}

                {!isLoading && !resultText && !error && (
                    <p className="text-zinc-500">Results will appear here.</p>
                )}
                {isLoading && (
                    <div className="flex items-center justify-center h-full">
                        <div className="flex items-center text-zinc-400">
                        <Spinner/> Searching...
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MapsPanel;
