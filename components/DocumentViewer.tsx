import React, { useState, useEffect } from 'react';
import { X, Download, ExternalLink, Printer, Share2, List } from 'lucide-react';
import { knowledgeService, Document, DocumentContent } from '../services/knowledgeService';
import { enhancedKnowledgeService } from '../services/knowledgeEnhancedService';
import ReactMarkdown from 'react-markdown';

interface DocumentViewerProps {
  document: Document;
  onClose: () => void;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ document, onClose }) => {
  const [content, setContent] = useState<DocumentContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTOC, setShowTOC] = useState(false);
  const [toc, setToc] = useState<{ level: number; text: string; id: string }[]>([]);

  useEffect(() => {
    loadDocumentContent();
  }, [document]);

  const loadDocumentContent = async () => {
    try {
      setLoading(true);
      setError(null);
      const docContent = await knowledgeService.loadDocument(document.path);
      setContent(docContent);

      // Extract table of contents
      const extractedTOC = enhancedKnowledgeService.extractTableOfContents(docContent.content);
      setToc(extractedTOC);
      setShowTOC(extractedTOC.length > 3); // Show TOC if document has more than 3 headings
    } catch (err) {
      console.error('Failed to load document:', err);
      setError('Failed to load document content. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!content) return;

    const blob = new Blob([content.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${document.name}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!content) return;
    window.print();
  };

  const handleShare = async () => {
    const shareLink = enhancedKnowledgeService.generateShareLink(document.path);

    try {
      if (navigator.share) {
        await navigator.share({
          title: document.name,
          text: `Check out this document: ${document.name}`,
          url: shareLink
        });
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(shareLink);
        alert('Share link copied to clipboard!');
      }
    } catch (error) {
      console.error('Error sharing:', error);
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareLink);
        alert('Share link copied to clipboard!');
      } catch (clipboardError) {
        alert(`Share link: ${shareLink}`);
      }
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          maxWidth: '900px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              {document.name}
            </h2>
            <div
              style={{
                marginTop: '4px',
                fontSize: '14px',
                color: 'var(--text-tertiary)',
              }}
            >
              {document.category} • {document.type.toUpperCase()}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {toc.length > 0 && (
              <button
                onClick={() => setShowTOC(!showTOC)}
                disabled={!content}
                style={{
                  padding: '8px 12px',
                  background: showTOC ? 'var(--roof-red)' : 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  cursor: content ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '14px',
                  opacity: content ? 1 : 0.5,
                }}
                title="Table of Contents"
              >
                <List className="w-4 h-4" />
                TOC
              </button>
            )}
            <button
              onClick={handlePrint}
              disabled={!content}
              style={{
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                cursor: content ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                opacity: content ? 1 : 0.5,
              }}
              title="Print"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={handleShare}
              disabled={!content}
              style={{
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                cursor: content ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                opacity: content ? 1 : 0.5,
              }}
              title="Share"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleDownload}
              disabled={!content}
              style={{
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                cursor: content ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                opacity: content ? 1 : 0.5,
              }}
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '8px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          {/* Table of Contents Sidebar */}
          {showTOC && toc.length > 0 && content && (
            <div
              style={{
                width: '250px',
                borderRight: '1px solid var(--border-color)',
                padding: '20px',
                overflowY: 'auto',
                background: 'var(--bg-secondary)',
              }}
            >
              <h3
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--roof-red)',
                  marginBottom: '16px',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                }}
              >
                Table of Contents
              </h3>
              <nav>
                {toc.map((heading, index) => (
                  <a
                    key={index}
                    href={`#${heading.id}`}
                    style={{
                      display: 'block',
                      paddingLeft: `${(heading.level - 1) * 12}px`,
                      paddingTop: '8px',
                      paddingBottom: '8px',
                      fontSize: heading.level === 1 ? '14px' : '13px',
                      color: heading.level === 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
                      textDecoration: 'none',
                      borderLeft: `2px solid ${heading.level === 1 ? 'var(--roof-red)' : 'transparent'}`,
                      marginLeft: heading.level === 1 ? '0' : '12px',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--roof-red)';
                      e.currentTarget.style.borderLeftColor = 'var(--roof-red)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = heading.level === 1 ? 'var(--text-primary)' : 'var(--text-secondary)';
                      e.currentTarget.style.borderLeftColor = heading.level === 1 ? 'var(--roof-red)' : 'transparent';
                    }}
                  >
                    {heading.text}
                  </a>
                ))}
              </nav>
            </div>
          )}

          {/* Document Content */}
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '24px',
            }}
          >
          {loading && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--text-tertiary)',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  border: '3px solid var(--border-color)',
                  borderTop: '3px solid var(--roof-red)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <p style={{ marginTop: '16px' }}>Loading document...</p>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '20px',
                background: 'rgba(255, 0, 0, 0.1)',
                border: '1px solid rgba(255, 0, 0, 0.3)',
                borderRadius: '8px',
                color: '#ff6b6b',
                textAlign: 'center',
              }}
            >
              <p style={{ margin: 0 }}>{error}</p>
              <button
                onClick={loadDocumentContent}
                style={{
                  marginTop: '12px',
                  padding: '8px 16px',
                  background: 'var(--roof-red)',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {content && !loading && !error && (
            <div
              className="markdown-content"
              style={{
                color: 'var(--text-primary)',
                lineHeight: 1.7,
              }}
            >
              <ReactMarkdown
                components={{
                  h1: ({node, children, ...props}) => {
                    const text = String(children);
                    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                    return <h1 id={id} style={{ color: 'var(--roof-red)', marginTop: '24px', marginBottom: '16px', scrollMarginTop: '20px' }} {...props}>{children}</h1>;
                  },
                  h2: ({node, children, ...props}) => {
                    const text = String(children);
                    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                    return <h2 id={id} style={{ color: 'var(--text-primary)', marginTop: '20px', marginBottom: '12px', scrollMarginTop: '20px' }} {...props}>{children}</h2>;
                  },
                  h3: ({node, children, ...props}) => {
                    const text = String(children);
                    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                    return <h3 id={id} style={{ color: 'var(--text-secondary)', marginTop: '16px', marginBottom: '8px', scrollMarginTop: '20px' }} {...props}>{children}</h3>;
                  },
                  p: ({node, ...props}) => <p style={{ marginBottom: '12px' }} {...props} />,
                  ul: ({node, ...props}) => <ul style={{ marginLeft: '20px', marginBottom: '12px' }} {...props} />,
                  ol: ({node, ...props}) => <ol style={{ marginLeft: '20px', marginBottom: '12px' }} {...props} />,
                  li: ({node, ...props}) => <li style={{ marginBottom: '6px' }} {...props} />,
                  code: ({node, inline, ...props}: any) =>
                    inline ? (
                      <code
                        style={{
                          background: 'var(--bg-tertiary)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.9em',
                          color: 'var(--roof-red)',
                        }}
                        {...props}
                      />
                    ) : (
                      <code
                        style={{
                          display: 'block',
                          background: 'var(--bg-tertiary)',
                          padding: '12px',
                          borderRadius: '8px',
                          overflow: 'auto',
                          marginBottom: '12px',
                        }}
                        {...props}
                      />
                    ),
                  a: ({node, ...props}) => (
                    <a
                      style={{
                        color: 'var(--roof-red)',
                        textDecoration: 'underline',
                      }}
                      target="_blank"
                      rel="noopener noreferrer"
                      {...props}
                    />
                  ),
                  blockquote: ({node, ...props}) => (
                    <blockquote
                      style={{
                        borderLeft: '4px solid var(--roof-red)',
                        paddingLeft: '16px',
                        marginLeft: 0,
                        color: 'var(--text-secondary)',
                        fontStyle: 'italic',
                      }}
                      {...props}
                    />
                  ),
                }}
              >
                {content.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default DocumentViewer;
