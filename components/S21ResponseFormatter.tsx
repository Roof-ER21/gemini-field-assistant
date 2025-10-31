import React, { useState } from 'react';
import { Copy, Check, Download, ChevronDown, ChevronUp, Zap, Target, FileText, AlertCircle, Mail } from 'lucide-react';

interface SourceDocument {
  document: {
    name: string;
    path: string;
    category: string;
  };
  content: string;
  score: number;
}

interface S21ResponseFormatterProps {
  content: string;
  onStartEmail?: (template: string, context: string) => void;
  onOpenDocument?: (documentPath: string) => void;
  sources?: SourceDocument[];
}

interface ParsedSection {
  type: 'heading' | 'action-plan' | 'template' | 'checklist' | 'success-rate' | 'text' | 'warning';
  content: string;
  metadata?: {
    successRate?: string;
    priority?: 'high' | 'medium' | 'low';
    actionable?: boolean;
  };
}

const S21ResponseFormatter: React.FC<S21ResponseFormatterProps> = ({ content, onStartEmail, onOpenDocument, sources }) => {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0, 1]));
  const [copiedSections, setCopiedSections] = useState<Set<number>>(new Set());
  const [hoveredCitation, setHoveredCitation] = useState<number | null>(null);

  // Parse the raw response into structured sections
  const parseResponse = (text: string): ParsedSection[] => {
    const sections: ParsedSection[] = [];

    // Do NOT remove citation brackets - we'll make them interactive
    // Keep citations like [1], [2], [3] intact

    // Extract success rate if present
    const successRateMatch = text.match(/(\d+)%\s*success/i);
    if (successRateMatch) {
      sections.push({
        type: 'success-rate',
        content: successRateMatch[1],
        metadata: { successRate: successRateMatch[1] }
      });
    }

    // Split into logical sections
    const lines = text.split('\n');
    let currentSection: ParsedSection | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        if (currentSection && currentContent.length > 0) {
          currentSection.content = currentContent.join('\n');
          sections.push(currentSection);
          currentContent = [];
          currentSection = null;
        }
        continue;
      }

      // Detect headings
      if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
        if (currentSection && currentContent.length > 0) {
          currentSection.content = currentContent.join('\n');
          sections.push(currentSection);
        }
        currentSection = {
          type: 'heading',
          content: trimmedLine.replace(/\*\*/g, ''),
          metadata: { actionable: trimmedLine.toLowerCase().includes('step') }
        };
        currentContent = [];
        continue;
      }

      // Detect templates (code blocks or quoted text)
      if (trimmedLine.startsWith('"') || trimmedLine.includes('Dear ') || trimmedLine.includes('Subject:')) {
        if (currentSection?.type !== 'template') {
          if (currentSection && currentContent.length > 0) {
            currentSection.content = currentContent.join('\n');
            sections.push(currentSection);
          }
          currentSection = {
            type: 'template',
            content: '',
            metadata: { actionable: true }
          };
          currentContent = [];
        }
        currentContent.push(trimmedLine);
        continue;
      }

      // Detect checklists
      if (trimmedLine.match(/^[-•]\s/) || trimmedLine.match(/^\d+\./)) {
        if (currentSection?.type !== 'checklist') {
          if (currentSection && currentContent.length > 0) {
            currentSection.content = currentContent.join('\n');
            sections.push(currentSection);
          }
          currentSection = {
            type: 'checklist',
            content: '',
            metadata: { actionable: true }
          };
          currentContent = [];
        }
        currentContent.push(trimmedLine);
        continue;
      }

      // Detect action plans
      if (trimmedLine.toLowerCase().includes('step ') || trimmedLine.toLowerCase().includes('here\'s how')) {
        if (currentSection?.type !== 'action-plan') {
          if (currentSection && currentContent.length > 0) {
            currentSection.content = currentContent.join('\n');
            sections.push(currentSection);
          }
          currentSection = {
            type: 'action-plan',
            content: '',
            metadata: { actionable: true, priority: 'high' }
          };
          currentContent = [];
        }
        currentContent.push(trimmedLine);
        continue;
      }

      // Regular text
      if (!currentSection || currentSection.type === 'heading') {
        if (currentSection && currentContent.length > 0) {
          currentSection.content = currentContent.join('\n');
          sections.push(currentSection);
        }
        currentSection = { type: 'text', content: '' };
        currentContent = [];
      }
      currentContent.push(trimmedLine);
    }

    if (currentSection && currentContent.length > 0) {
      currentSection.content = currentContent.join('\n');
      sections.push(currentSection);
    }

    return sections;
  };

  const sections = parseResponse(content);

  // Helper function to create email context summary
  const createEmailContext = (template: string, fullResponse: string): string => {
    // Extract key points from the response (not the template)
    const lines = fullResponse.split('\n').filter(line => line.trim());
    const contextLines: string[] = [];

    // Get first 3-4 substantive lines as context
    for (const line of lines) {
      // Skip template content
      if (line.includes('"') && line.length > 100) continue;
      // Skip sources section
      if (line.includes('Sources:') || line.includes('---')) break;
      // Add substantive content
      if (line.trim().length > 20 && contextLines.length < 4) {
        contextLines.push(line.trim());
      }
    }

    return contextLines.join('\n\n');
  };

  // Helper function to render text with interactive citations
  const renderTextWithCitations = (text: string) => {
    if (!sources || sources.length === 0) {
      return <span>{text}</span>;
    }

    // Split text by citation pattern [1], [2], etc.
    const parts = text.split(/(\[\d+\])/g);

    return (
      <>
        {parts.map((part, idx) => {
          const citationMatch = part.match(/\[(\d+)\]/);
          if (citationMatch) {
            const citationNum = parseInt(citationMatch[1]);
            const source = sources[citationNum - 1];

            if (source) {
              return (
                <span
                  key={idx}
                  onMouseEnter={() => setHoveredCitation(citationNum)}
                  onMouseLeave={() => setHoveredCitation(null)}
                  onClick={() => {
                    if (onOpenDocument) {
                      onOpenDocument(source.document.path);
                    }
                  }}
                  style={{
                    position: 'relative',
                    cursor: 'pointer',
                    color: 'var(--roof-red)',
                    fontWeight: 600,
                    fontSize: '12px',
                    padding: '2px 4px',
                    borderRadius: '3px',
                    background: 'rgba(220, 38, 38, 0.1)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(220, 38, 38, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(220, 38, 38, 0.1)';
                  }}
                >
                  {part}
                  {hoveredCitation === citationNum && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        marginBottom: '8px',
                        padding: '12px',
                        background: 'var(--bg-elevated)',
                        border: '2px solid var(--roof-red)',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                        zIndex: 1000,
                        minWidth: '250px',
                        maxWidth: '350px',
                        pointerEvents: 'none'
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--roof-red)', marginBottom: '6px' }}>
                        {source.document.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        {source.document.category}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                        lineHeight: '1.5',
                        maxHeight: '120px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {source.content.slice(0, 200)}...
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: 'var(--roof-red)',
                        marginTop: '6px',
                        fontWeight: 600
                      }}>
                        Click to view full document
                      </div>
                    </div>
                  )}
                </span>
              );
            }
          }
          return <span key={idx}>{part}</span>;
        })}
      </>
    );
  };

  const toggleSection = (index: number) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSections(newExpanded);
  };

  const copySection = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedSections(new Set(copiedSections).add(index));
      setTimeout(() => {
        setCopiedSections(prev => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const renderSection = (section: ParsedSection, index: number) => {
    const isExpanded = expandedSections.has(index);
    const isCopied = copiedSections.has(index);

    switch (section.type) {
      case 'success-rate':
        return (
          <div key={index} style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            border: '2px solid #047857',
            borderRadius: '12px',
            padding: '16px 20px',
            margin: '16px 0',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
          }}>
            <Zap className="w-6 h-6" style={{ color: '#fef3c7', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '13px', color: '#d1fae5', fontWeight: 500, marginBottom: '2px' }}>
                S21's Assessment
              </div>
              <div style={{ fontSize: '22px', color: 'white', fontWeight: 700, letterSpacing: '-0.5px' }}>
                "Success Rate: {section.content}%"
              </div>
            </div>
          </div>
        );

      case 'heading':
        return (
          <div key={index} style={{
            padding: '12px 0',
            marginTop: index === 0 ? '0' : '20px',
            marginBottom: '8px'
          }}>
            <div style={{
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--roof-red)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              {section.metadata?.actionable && <Target className="w-5 h-5" />}
              {section.content}
            </div>
          </div>
        );

      case 'action-plan':
        return (
          <div key={index} style={{
            background: 'var(--bg-elevated)',
            border: '2px solid var(--roof-red)',
            borderRadius: '12px',
            overflow: 'hidden',
            margin: '12px 0'
          }}>
            <button
              onClick={() => toggleSection(index)}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'var(--roof-red)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                color: 'white'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Target className="w-5 h-5" />
                <span style={{ fontSize: '15px', fontWeight: 600 }}>Action Plan</span>
              </div>
              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
            {isExpanded && (
              <div style={{ padding: '16px' }}>
                <div style={{
                  fontSize: '14px',
                  lineHeight: '1.7',
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap'
                }}>
                  {renderTextWithCitations(section.content)}
                </div>
                <button
                  onClick={() => copySection(section.content, index)}
                  style={{
                    marginTop: '12px',
                    padding: '8px 14px',
                    background: isCopied ? '#10b981' : 'var(--bg-tertiary)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    transition: 'all 0.2s'
                  }}
                >
                  {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {isCopied ? 'Copied!' : 'Copy Action Plan'}
                </button>
              </div>
            )}
          </div>
        );

      case 'template':
        return (
          <div key={index} style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)',
            borderRadius: '12px',
            overflow: 'hidden',
            margin: '12px 0'
          }}>
            <div style={{
              padding: '12px 16px',
              background: 'var(--bg-tertiary)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText className="w-4 h-4" style={{ color: 'var(--roof-red)' }} />
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Ready-to-Use Template
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {onStartEmail && (
                  <button
                    onClick={() => {
                      const contextSummary = createEmailContext(section.content, content);
                      onStartEmail(section.content, contextSummary);
                    }}
                    style={{
                      padding: '6px 10px',
                      background: 'var(--roof-red)',
                      border: 'none',
                      borderRadius: '6px',
                      color: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      fontWeight: 600,
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                  >
                    <Mail className="w-3 h-3" />
                    Start Email
                  </button>
                )}
                <button
                  onClick={() => copySection(section.content, index)}
                  style={{
                    padding: '6px 10px',
                    background: isCopied ? '#10b981' : 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: 500
                  }}
                >
                  {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {isCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div style={{
              padding: '16px',
              fontSize: '14px',
              lineHeight: '1.7',
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace'
            }}>
              {section.content}
            </div>
          </div>
        );

      case 'checklist':
        const items = section.content.split('\n').filter(line => line.trim());
        return (
          <div key={index} style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: '12px',
            padding: '16px',
            margin: '12px 0'
          }}>
            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle className="w-4 h-4" style={{ color: 'var(--roof-red)' }} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Checklist
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {items.map((item, idx) => (
                <label key={idx} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '6px',
                  transition: 'background 0.2s'
                }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                   onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <input
                    type="checkbox"
                    style={{
                      marginTop: '3px',
                      width: '16px',
                      height: '16px',
                      cursor: 'pointer'
                    }}
                  />
                  <span style={{
                    fontSize: '14px',
                    lineHeight: '1.6',
                    color: 'var(--text-primary)'
                  }}>
                    {item.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, '')}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );

      case 'text':
      default:
        if (!section.content.trim()) return null;
        return (
          <div key={index} style={{
            fontSize: '14px',
            lineHeight: '1.7',
            color: 'var(--text-primary)',
            margin: '12px 0',
            padding: '0 4px'
          }}>
            {section.content.split('\n').map((para, i) => (
              para.trim() && <p key={i} style={{ margin: '8px 0' }}>{renderTextWithCitations(para)}</p>
            ))}
          </div>
        );
    }
  };

  return (
    <div style={{
      maxWidth: '100%',
      padding: '0'
    }}>
      {sections.map((section, index) => renderSection(section, index))}
    </div>
  );
};

export default S21ResponseFormatter;
