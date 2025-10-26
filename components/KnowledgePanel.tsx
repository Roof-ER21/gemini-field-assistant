import React, { useState, useEffect } from 'react';
import Spinner from './Spinner';
import { knowledgeService, Document, DocumentContent } from '../services/knowledgeService';

interface SearchResult {
  document: Document;
  snippet: string;
  relevance: number;
}

const KnowledgePanel: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [docContent, setDocContent] = useState<DocumentContent | null>(null);

  useEffect(() => {
    loadDocumentIndex();
    loadCategories();
  }, []);

  const loadDocumentIndex = async () => {
    try {
      const docs = await knowledgeService.getDocumentIndex();
      setDocuments(docs);
    } catch (error) {
      console.error('Failed to load documents:', error);
    }
  };

  const loadCategories = async () => {
    try {
      const cats = await knowledgeService.getCategories();
      setCategories(['All', ...cats]);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const results = await knowledgeService.searchDocuments(searchQuery, documents);
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDocument = async (doc: Document) => {
    setLoading(true);
    setSelectedDoc(doc);

    try {
      const content = await knowledgeService.loadDocument(doc.path);
      setDocContent(content);
    } catch (error) {
      console.error('Failed to load document:', error);
      setDocContent({
        name: doc.name,
        content: 'Error loading document content'
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = selectedCategory === 'All'
    ? documents
    : documents.filter(doc => doc.category === selectedCategory);

  const getDocIcon = (type: Document['type']) => {
    switch (type) {
      case 'pdf':
        return '📄';
      case 'pptx':
        return '📊';
      case 'docx':
        return '📝';
      case 'md':
        return '📋';
      default:
        return '📄';
    }
  };

  return (
    <div className="h-screen flex flex-col bg-zinc-900 text-white">
      {/* Header */}
      <div className="p-6 border-b border-zinc-700">
        <h1 className="text-2xl font-bold text-red-500 mb-2">📚 Knowledge Base</h1>
        <p className="text-zinc-400">Search roofing sales materials and training docs</p>

        {/* Search Bar */}
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search for sales tactics, product info, guidelines..."
            className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-red-500"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? <Spinner /> : '🔍 Search'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Document List */}
        <div className="w-80 border-r border-zinc-700 overflow-y-auto">
          <div className="p-4">
            {/* Category Filter */}
            <div className="mb-4">
              <label className="text-xs text-zinc-400 uppercase tracking-wide mb-2 block">
                Filter by Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-red-500"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <h2 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">
              Documents ({filteredDocuments.length})
            </h2>
            <div className="space-y-2">
              {filteredDocuments.map((doc, idx) => (
                <button
                  key={idx}
                  onClick={() => loadDocument(doc)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedDoc?.name === doc.name
                      ? 'bg-red-600 text-white'
                      : 'bg-zinc-800 hover:bg-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getDocIcon(doc.type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-sm">{doc.name}</div>
                      {doc.category && (
                        <div className="text-xs text-zinc-400 mt-1">{doc.category}</div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Spinner />
            </div>
          ) : searchResults.length > 0 ? (
            <div>
              <h2 className="text-xl font-bold mb-4">Search Results ({searchResults.length})</h2>
              <div className="space-y-4">
                {searchResults.map((result, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-zinc-800 rounded-lg border border-zinc-700 hover:border-red-500 transition-colors cursor-pointer"
                    onClick={() => loadDocument(result.document)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-red-400">{result.document.name}</h3>
                      <span className="text-xs px-2 py-1 bg-zinc-700 rounded">
                        {(result.relevance * 100).toFixed(0)}% match
                      </span>
                    </div>
                    <p className="text-zinc-300 text-sm">{result.snippet}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                      <span>{getDocIcon(result.document.type)} {result.document.type.toUpperCase()}</span>
                      {result.document.category && (
                        <span>• {result.document.category}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : docContent ? (
            <div className="prose prose-invert max-w-none">
              <div className="mb-4 pb-4 border-b border-zinc-700">
                <h1 className="text-2xl font-bold text-white mb-2">{docContent.name}</h1>
                {selectedDoc?.category && (
                  <span className="px-3 py-1 bg-red-600 text-white text-xs rounded-full">
                    {selectedDoc.category}
                  </span>
                )}
              </div>
              <div className="whitespace-pre-wrap text-zinc-300 leading-relaxed">
                {docContent.content}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-500">
              <div className="text-center">
                <div className="text-6xl mb-4">📚</div>
                <p className="text-xl mb-2">Select a document or search the knowledge base</p>
                <p className="text-sm">All roofing sales materials extracted with DeepSeek-OCR</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats Footer */}
      <div className="p-4 border-t border-zinc-700 bg-zinc-800">
        <div className="flex justify-between text-xs text-zinc-400">
          <span>📊 {documents.length} documents indexed</span>
          <span>🔍 DeepSeek-OCR Powered</span>
          <span>⚡ Vector search ready</span>
        </div>
      </div>
    </div>
  );
};

export default KnowledgePanel;
