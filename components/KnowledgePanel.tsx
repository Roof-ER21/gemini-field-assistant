import React, { useState, useEffect } from 'react';
import { knowledgeService, Document } from '../services/knowledgeService';
import { enhancedKnowledgeService } from '../services/knowledgeEnhancedService';
import { Search, FileText, Presentation, FileSpreadsheet, File, BookOpen, Star, Clock, Filter, Pin } from 'lucide-react';
import DocumentViewer from './DocumentViewer';
import { useToast } from './Toast';

type ViewMode = 'all' | 'recent' | 'favorites';
type SearchMode = 'title' | 'content';

interface KnowledgePanelProps {
  selectedDocument?: string | null;
  onDocumentViewed?: () => void;
  onOpenInChat?: (doc: Document) => void;
}

const KnowledgePanel: React.FC<KnowledgePanelProps> = ({ selectedDocument: externalDocPath, onDocumentViewed, onOpenInChat }) => {
  const toast = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [searchMode, setSearchMode] = useState<SearchMode>('content');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [goTo, setGoTo] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [stateFilter, setStateFilter] = useState<'All' | 'VA' | 'MD' | 'PA'>('All');

  useEffect(() => {
    loadDocumentIndex();
    loadFavorites();
    loadGoTo();
    loadCategories();
  }, []);

  // Handle external document selection from citations
  useEffect(() => {
    if (externalDocPath) {
      loadDocumentByPath(externalDocPath);
      onDocumentViewed?.();
    }
  }, [externalDocPath]);

  useEffect(() => {
    loadDocumentsForView();
  }, [viewMode]);

  const loadDocumentIndex = async () => {
    try {
      const docs = await knowledgeService.getDocumentIndex();
      setDocuments(docs);
    } catch (error) {
      console.error('Failed to load documents:', error);
    }
  };

  const loadFavorites = () => {
    const favs = enhancedKnowledgeService.getFavorites();
    setFavorites(new Set(favs.map(f => f.documentPath)));
  };

  const loadGoTo = () => {
    const items = enhancedKnowledgeService.getGoTo();
    setGoTo(new Set(items));
  };

  const loadCategories = async () => {
    try {
      const cats = await knowledgeService.getCategories();
      setCategories(['All', ...cats]);
    } catch (e) {
      console.warn('Failed to load categories');
    }
  };

  const loadDocumentsForView = async () => {
    setLoading(true);
    try {
      switch (viewMode) {
        case 'all':
          let allDocs = await knowledgeService.getDocumentIndex();
          // Apply category filter
          if (selectedCategory !== 'All') {
            allDocs = allDocs.filter(d => d.category === selectedCategory);
          }
          // Apply state filter
          if (stateFilter !== 'All') {
            const state = stateFilter;
            allDocs = allDocs.filter(d =>
              (d.category === 'State-Specific Codes') ||
              d.name.includes(state) ||
              d.path.toLowerCase().includes(state.toLowerCase())
            );
          }
          // Sort: pinned (go-to) first
          allDocs.sort((a, b) => Number(goTo.has(b.path)) - Number(goTo.has(a.path)));
          setDocuments(allDocs);
          break;
        case 'recent':
          const recentDocs = await enhancedKnowledgeService.getRecentDocuments(20);
          recentDocs.sort((a, b) => Number(goTo.has(b.path)) - Number(goTo.has(a.path)));
          setDocuments(recentDocs);
          break;
        case 'favorites':
          const favDocs = await enhancedKnowledgeService.getFavoriteDocuments();
          favDocs.sort((a, b) => Number(goTo.has(b.path)) - Number(goTo.has(a.path)));
          setDocuments(favDocs);
          break;
      }
    } catch (error) {
      console.error('Failed to load documents for view:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadDocumentsForView();
      return;
    }

    setLoading(true);
    try {
      const results = await enhancedKnowledgeService.searchDocuments(searchQuery, {
        searchInContent: searchMode === 'content',
        limit: 50
      });
      setDocuments(results.map(r => r.document));
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentClick = (doc: Document) => {
    enhancedKnowledgeService.trackDocumentView(doc.path);
    setSelectedDocument(doc);
  };

  const loadDocumentByPath = async (path: string) => {
    try {
      // Find document in current list
      let doc = documents.find(d => d.path === path);

      // If not found, load from index
      if (!doc) {
        const allDocs = await knowledgeService.getDocumentIndex();
        doc = allDocs.find(d => d.path === path);
      }

      if (doc) {
        enhancedKnowledgeService.trackDocumentView(doc.path);
        setSelectedDocument(doc);
      } else {
        console.error('Document not found:', path);
      }
    } catch (error) {
      console.error('Failed to load document:', error);
    }
  };

  const toggleFavorite = (doc: Document, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent document from opening

    if (favorites.has(doc.path)) {
      enhancedKnowledgeService.removeFromFavorites(doc.path);
      setFavorites(prev => {
        const next = new Set(prev);
        next.delete(doc.path);
        return next;
      });
    } else {
      enhancedKnowledgeService.addToFavorites(doc.path);
      setFavorites(prev => new Set(prev).add(doc.path));
    }
  };

  const toggleGoTo = (doc: Document, e: React.MouseEvent) => {
    e.stopPropagation();
    if (goTo.has(doc.path)) {
      enhancedKnowledgeService.removeFromGoTo(doc.path);
      setGoTo(prev => {
        const next = new Set(prev);
        next.delete(doc.path);
        return next;
      });
    } else {
      enhancedKnowledgeService.addToGoTo(doc.path);
      setGoTo(prev => new Set(prev).add(doc.path));
    }
  };

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
        return '📁';
    }
  };

  // Documents are already filtered by search or view mode
  const displayDocuments = documents;

  const sampleDocs = [
    { title: 'Roof Types Guide', desc: 'Comprehensive guide to all roofing materials and styles', icon: '🏠' },
    { title: 'Insurance Claims', desc: 'Step-by-step insurance claim process', icon: '📋' },
    { title: 'Sales Scripts', desc: 'Proven scripts for common objections', icon: '📝' },
    { title: 'Product Catalog', desc: 'All products with specifications and pricing', icon: '📦' },
    { title: 'Safety Procedures', desc: 'Safety protocols and requirements', icon: '⚠️' },
    { title: 'Competitor Analysis', desc: 'How we compare to competitors', icon: '📊' },
    { title: 'GAF Products', desc: 'Complete GAF product line specifications', icon: '🔴' },
    { title: 'Warranties Guide', desc: 'Warranty information and comparison', icon: '🔒' },
    { title: 'Field Measurements', desc: 'Accurate measurement techniques', icon: '📏' },
    { title: 'Storm Damage Assessment', desc: 'Identifying storm damage checklist', icon: '🌩️' },
    { title: 'Pricing Calculator', desc: 'Material and labor cost estimation', icon: '💰' },
    { title: 'State Regulations', desc: 'VA, MD, PA roofing requirements', icon: '🏛️' }
  ];

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll">
        <div className="roof-er-page-title">
          <BookOpen className="w-6 h-6 inline mr-2" style={{ color: 'var(--roof-red)' }} />
          Knowledge Base
        </div>

        {/* View Mode Tabs */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '20px',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '12px'
        }}>
          <button
            onClick={() => setViewMode('all')}
            style={{
              padding: '8px 16px',
              background: viewMode === 'all' ? 'var(--roof-red)' : 'var(--bg-hover)',
              border: `1px solid ${viewMode === 'all' ? 'var(--roof-red)' : 'var(--border-default)'}`,
              borderRadius: '8px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
          >
            <BookOpen className="w-4 h-4" />
            All Documents ({documents.length})
          </button>

          <button
            onClick={() => setViewMode('recent')}
            style={{
              padding: '8px 16px',
              background: viewMode === 'recent' ? 'var(--roof-red)' : 'var(--bg-hover)',
              border: `1px solid ${viewMode === 'recent' ? 'var(--roof-red)' : 'var(--border-default)'}`,
              borderRadius: '8px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
          >
            <Clock className="w-4 h-4" />
            Recently Viewed
          </button>

          <button
            onClick={() => setViewMode('favorites')}
            style={{
              padding: '8px 16px',
              background: viewMode === 'favorites' ? 'var(--roof-red)' : 'var(--bg-hover)',
              border: `1px solid ${viewMode === 'favorites' ? 'var(--roof-red)' : 'var(--border-default)'}`,
              borderRadius: '8px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
          >
            <Star className="w-4 h-4" fill={viewMode === 'favorites' ? 'currentColor' : 'none'} />
            Favorites ({favorites.size})
          </button>

        </div>

        {/* Filters: Category + State */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Category:</span>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => { setSelectedCategory(cat); loadDocumentsForView(); }}
                style={{
                  padding: '6px 10px',
                  background: selectedCategory === cat ? 'var(--roof-red)' : 'var(--bg-hover)',
                  border: `1px solid ${selectedCategory === cat ? 'var(--roof-red)' : 'var(--border-default)'}`,
                  borderRadius: '9999px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                {cat}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>State:</span>
            {(['All','VA','MD','PA'] as const).map(s => (
              <button
                key={s}
                onClick={() => { setStateFilter(s); loadDocumentsForView(); }}
                style={{
                  padding: '6px 10px',
                  background: stateFilter === s ? 'var(--roof-red)' : 'var(--bg-hover)',
                  border: `1px solid ${stateFilter === s ? 'var(--roof-red)' : 'var(--border-default)'}`,
                  borderRadius: '9999px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Search Bar */}
        <div className="roof-er-search-bar">
          <div style={{ position: 'relative', width: '100%' }}>
            <Search
              className="w-5 h-5"
              style={{
                position: 'absolute',
                left: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-disabled)'
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={`Search ${searchMode === 'content' ? 'inside documents' : 'titles only'}...`}
              className="roof-er-search-input"
              style={{ paddingLeft: '52px', paddingRight: '120px' }}
            />
            <div style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              gap: '8px'
            }}>
              <button
                onClick={() => setSearchMode(prev => prev === 'title' ? 'content' : 'title')}
                title={searchMode === 'content' ? 'Search in content' : 'Search in titles'}
                style={{
                  padding: '6px 10px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '6px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Filter className="w-3 h-3" />
                {searchMode === 'content' ? 'Full' : 'Title'}
              </button>
              <button
                onClick={handleSearch}
                style={{
                  padding: '6px 10px',
                  background: 'var(--roof-red)',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600
                }}
              >
                Search
              </button>
            </div>
          </div>
        </div>

        {/* Document Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          {loading ? (
            <div style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              padding: '40px',
              color: 'var(--text-tertiary)'
            }}>
              Loading documents...
            </div>
          ) : displayDocuments.length > 0 ? (
            displayDocuments.map((doc, index) => (
              <div
                key={index}
                className="roof-er-doc-card"
                onClick={() => handleDocumentClick(doc)}
                style={{ cursor: 'pointer', position: 'relative' }}
              >
                <button
                  onClick={(e) => toggleFavorite(doc, e)}
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: favorites.has(doc.path) ? 'var(--roof-red)' : 'var(--text-disabled)',
                    transition: 'all 0.2s ease'
                  }}
                  title={favorites.has(doc.path) ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star
                    className="w-5 h-5"
                    fill={favorites.has(doc.path) ? 'currentColor' : 'none'}
                    stroke="currentColor"
                  />
                </button>
                <button
                  onClick={(e) => toggleGoTo(doc, e)}
                  style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: goTo.has(doc.path) ? 'var(--roof-red)' : 'var(--text-disabled)',
                    transition: 'all 0.2s ease'
                  }}
                  title={goTo.has(doc.path) ? 'Unpin from Go-To' : 'Pin to Go-To'}
                >
                  <Pin className="w-5 h-5" />
                </button>
                {/* no upload toolbar in Knowledge – uploads managed in Upload Analysis */}
                <div className="roof-er-doc-icon">{getDocIcon(doc.type)}</div>
                <div className="roof-er-doc-title">{doc.name}</div>
                <div className="roof-er-doc-desc">
                  {doc.category || 'Document'} • {doc.type.toUpperCase()}
                </div>
              </div>
            ))
          ) : (
            // Show sample documents if no documents loaded
            sampleDocs.map((doc, index) => (
              <div
                key={index}
                className="roof-er-doc-card"
                onClick={() => toast.info('Opening Document', doc.title)}
              >
                <div className="roof-er-doc-icon">{doc.icon}</div>
                <div className="roof-er-doc-title">{doc.title}</div>
                <div className="roof-er-doc-desc">{doc.desc}</div>
              </div>
            ))
          )}
        </div>

        {!loading && displayDocuments.length === 0 && searchQuery.trim() && (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: 'var(--text-tertiary)'
          }}>
            No documents found matching "{searchQuery}"
          </div>
        )}

        {!loading && displayDocuments.length === 0 && viewMode === 'favorites' && !searchQuery.trim() && (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: 'var(--text-tertiary)'
          }}>
            No favorites yet. Click the star icon on documents to add them to favorites.
          </div>
        )}

        {!loading && displayDocuments.length === 0 && viewMode === 'recent' && !searchQuery.trim() && (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: 'var(--text-tertiary)'
          }}>
            No recently viewed documents. Open a document to see it here.
          </div>
        )}
      </div>

      {/* Document Viewer Modal */}
      {selectedDocument && (
        <DocumentViewer
          document={selectedDocument}
          onClose={() => setSelectedDocument(null)}
          onOpenInChat={(doc) => {
            try {
              localStorage.setItem('chat_quick_doc', JSON.stringify({ name: doc.name, path: doc.path }));
            } catch {}
            // bubble up to App to switch panels
            onDocumentViewed?.();
            onOpenInChat?.(doc);
          }}
        />
      )}
    </div>
  );
};

export default KnowledgePanel;
