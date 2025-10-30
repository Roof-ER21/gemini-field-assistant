import React, { useState, useEffect } from 'react';
import Spinner from './Spinner';
import { knowledgeService, Document, DocumentContent } from '../services/knowledgeService';
import { BookOpen, Search, FileText, Presentation, FileSpreadsheet, File, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';

interface SearchResult {
  document: Document;
  snippet: string;
  relevance: number;
}

interface SimilarDocument {
  document: Document;
  similarity: number;
}

const KnowledgePanel: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [similarDocs, setSimilarDocs] = useState<SimilarDocument[]>([]);
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
    setSimilarDocs([]); // Clear similar docs when loading new document

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

  const findSimilar = async () => {
    if (!selectedDoc) return;

    setLoading(true);
    try {
      const similar = await knowledgeService.findSimilarDocuments(selectedDoc, documents);
      setSimilarDocs(similar);
    } catch (error) {
      console.error('Failed to find similar documents:', error);
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
        return <FileText className="h-4 w-4 text-red-400" />;
      case 'pptx':
        return <Presentation className="h-4 w-4 text-orange-400" />;
      case 'docx':
        return <FileSpreadsheet className="h-4 w-4 text-blue-400" />;
      case 'md':
        return <File className="h-4 w-4 text-green-400" />;
      default:
        return <File className="h-4 w-4 text-zinc-400" />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950">
      {/* Header */}
      <div className="p-6 border-b border-zinc-800/50 backdrop-blur-sm">
        <div className="flex items-center space-x-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg shadow-red-600/30">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Knowledge Base</h1>
            <p className="text-xs text-zinc-400">Search roofing sales materials and training docs</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for sales tactics, product info, guidelines..."
              className="pl-10 h-11 bg-zinc-800/50 border-zinc-700"
            />
          </div>
          <Button
            onClick={handleSearch}
            disabled={loading}
            className="h-11 px-6 shadow-lg shadow-red-600/30"
          >
            {loading ? <Spinner /> : <><Search className="h-4 w-4 mr-2" /> Search</>}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Document List */}
        <ScrollArea className="w-80 border-r border-white/10 scrollbar-thin scrollbar-track-zinc-900 scrollbar-thumb-zinc-700">
          <div className="p-4">
            {/* Category Filter */}
            <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="mb-4">
              <TabsList className="w-full grid grid-cols-3">
                {categories.slice(0, 3).map(cat => (
                  <TabsTrigger key={cat} value={cat} className="text-xs">
                    {cat}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                Documents
              </h2>
              <Badge variant="secondary" className="text-xs">
                {filteredDocuments.length}
              </Badge>
            </div>

            <div className="space-y-2">
              {filteredDocuments.map((doc, idx) => (
                <Card
                  key={idx}
                  className={`cursor-pointer transition-all duration-200 hover:scale-[1.02] ${
                    selectedDoc?.name === doc.name
                      ? 'bg-gradient-to-br from-[#e94560] to-[#ff6b88] border-transparent shadow-lg'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                  onClick={() => loadDocument(doc)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        selectedDoc?.name === doc.name ? 'bg-white/20' : 'bg-zinc-900'
                      }`}>
                        {getDocIcon(doc.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium truncate text-sm ${
                          selectedDoc?.name === doc.name ? 'text-white' : 'text-zinc-200'
                        }`}>
                          {doc.name}
                        </div>
                        {doc.category && (
                          <div className={`text-xs mt-1 ${
                            selectedDoc?.name === doc.name ? 'text-white/70' : 'text-zinc-500'
                          }`}>
                            {doc.category}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </ScrollArea>

        {/* Content Area */}
        <ScrollArea className="flex-1 p-6 scrollbar-thin scrollbar-track-zinc-900 scrollbar-thumb-zinc-700">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Spinner />
            </div>
          ) : searchResults.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Search Results</h2>
                <Badge variant="secondary">{searchResults.length} found</Badge>
              </div>
              <div className="space-y-3">
                {searchResults.map((result, idx) => (
                  <Card
                    key={idx}
                    className="cursor-pointer transition-all duration-200 hover:scale-[1.01] hover:shadow-lg hover:shadow-red-600/10 bg-zinc-800/30 border-zinc-800 hover:border-zinc-700"
                    onClick={() => loadDocument(result.document)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {getDocIcon(result.document.type)}
                          <h3 className="font-semibold text-red-400">{result.document.name}</h3>
                        </div>
                        <Badge variant="success" className="text-xs">
                          {(result.relevance * 100).toFixed(0)}% match
                        </Badge>
                      </div>
                      <p className="text-zinc-300 text-sm leading-relaxed mb-2">{result.snippet}</p>
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <Badge variant="outline" className="text-xs">
                          {result.document.type.toUpperCase()}
                        </Badge>
                        {result.document.category && (
                          <Badge variant="outline" className="text-xs">
                            {result.document.category}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : docContent ? (
            <div className="max-w-4xl mx-auto">
              <Card className="mb-6 s21-card-glass">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-2xl mb-2">{docContent.name}</CardTitle>
                      {selectedDoc?.category && (
                        <Badge variant="default" className="mt-2">
                          {selectedDoc.category}
                        </Badge>
                      )}
                    </div>
                    <Button
                      onClick={findSimilar}
                      disabled={loading}
                      variant="secondary"
                      className="shadow-sm"
                    >
                      {loading ? <Spinner /> : <><Sparkles className="h-4 w-4 mr-2" /> Find Similar</>}
                    </Button>
                  </div>
                </CardHeader>
              </Card>

              {/* Similar Documents Section */}
              {similarDocs.length > 0 && (
                <Card className="mb-6 s21-card-glass">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-red-400" />
                      Similar Documents
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {similarDocs.map((similar, idx) => (
                        <Card
                          key={idx}
                          className="cursor-pointer transition-all duration-200 hover:scale-[1.01] bg-white/5 border-white/10 hover:bg-white/10"
                          onClick={() => loadDocument(similar.document)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2 flex-1">
                                {getDocIcon(similar.document.type)}
                                <div>
                                  <div className="font-medium text-white text-sm">{similar.document.name}</div>
                                  <div className="text-xs text-white/60 mt-0.5">{similar.document.category}</div>
                                </div>
                              </div>
                              <Badge variant="default" className="text-xs ml-2">
                                {(similar.similarity * 100).toFixed(0)}%
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="s21-card-glass">
                <CardContent className="p-6">
                  <div className="whitespace-pre-wrap text-white/90 leading-relaxed text-sm">
                    {docContent.content}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="h-20 w-20 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center">
                  <BookOpen className="h-10 w-10 text-zinc-600" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Select a document</h3>
                <p className="text-sm text-zinc-500 mb-1">Choose from the sidebar or search the knowledge base</p>
                <Badge variant="outline" className="mt-4">
                  DeepSeek-OCR Powered
                </Badge>
              </div>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Stats Footer */}
      <div className="p-4 border-t border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3 text-xs text-white/60">
            <div className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              <span>{documents.length} documents</span>
            </div>
            <Separator orientation="vertical" className="h-3" />
            <Badge variant="outline" className="text-xs">DeepSeek-OCR</Badge>
            <Separator orientation="vertical" className="h-3" />
            <Badge variant="outline" className="text-xs">Semantic Search</Badge>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgePanel;
