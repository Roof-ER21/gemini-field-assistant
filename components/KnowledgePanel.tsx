import React, { useState, useEffect } from 'react';
import { knowledgeService, Document } from '../services/knowledgeService';
import { Search, FileText, Presentation, FileSpreadsheet, File, BookOpen } from 'lucide-react';
import DocumentViewer from './DocumentViewer';

const KnowledgePanel: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  useEffect(() => {
    loadDocumentIndex();
  }, []);

  const loadDocumentIndex = async () => {
    try {
      const docs = await knowledgeService.getDocumentIndex();
      setDocuments(docs);
    } catch (error) {
      console.error('Failed to load documents:', error);
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

  const filteredDocuments = searchQuery.trim()
    ? documents.filter(doc =>
        doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.category?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : documents;

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
              placeholder="Search for sales tactics, product info, guidelines..."
              className="roof-er-search-input"
              style={{ paddingLeft: '52px' }}
            />
          </div>
        </div>

        {/* Document Grid */}
        <div className="roof-er-doc-grid">
          {filteredDocuments.length > 0 ? (
            filteredDocuments.map((doc, index) => (
              <div
                key={index}
                className="roof-er-doc-card"
                onClick={() => setSelectedDocument(doc)}
                style={{ cursor: 'pointer' }}
              >
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
                onClick={() => alert(`Opening: ${doc.title}`)}
              >
                <div className="roof-er-doc-icon">{doc.icon}</div>
                <div className="roof-er-doc-title">{doc.title}</div>
                <div className="roof-er-doc-desc">{doc.desc}</div>
              </div>
            ))
          )}
        </div>

        {filteredDocuments.length === 0 && searchQuery.trim() && documents.length > 0 && (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: 'var(--text-tertiary)'
          }}>
            No documents found matching "{searchQuery}"
          </div>
        )}
      </div>

      {/* Document Viewer Modal */}
      {selectedDocument && (
        <DocumentViewer
          document={selectedDocument}
          onClose={() => setSelectedDocument(null)}
        />
      )}
    </div>
  );
};

export default KnowledgePanel;
