import React, { useState, useEffect } from 'react';
import { Mail, Send, Copy, FileText, CheckCircle, Sparkles, Download } from 'lucide-react';
import { knowledgeService, Document } from '../services/knowledgeService';
import { generateEmail } from '../services/geminiService';
import Spinner from './Spinner';

type EmailTemplate = {
  name: string;
  path: string;
  description: string;
};

const EMAIL_TEMPLATES: EmailTemplate[] = [
  { name: 'iTel Shingle Template', path: '/docs/Sales Rep Resources 2/Email Templates/iTel Shingle Template.md', description: 'For iTel shingle quotes and information' },
  { name: 'Post AM Email Template', path: '/docs/Sales Rep Resources 2/Email Templates/Post AM Email Template.md', description: 'Follow-up after adjuster meeting' },
  { name: 'Request For Appraisal', path: '/docs/Sales Rep Resources 2/Email Templates/Request For Appraisal.md', description: 'Request insurance appraisal' },
  { name: 'Repair Attempt Template', path: '/docs/Sales Rep Resources 2/Email Templates/Repair Attempt Template.md', description: 'Document repair attempt for insurance' },
  { name: 'Photo Report Template', path: '/docs/Sales Rep Resources 2/Email Templates/Photo Report Template.md', description: 'Send photo documentation' },
  { name: 'Template from Customer to Insurance', path: '/docs/Sales Rep Resources 2/Email Templates/Template from Customer to Insurance.md', description: 'Customer communication to insurance company' },
  { name: 'Estimate Request Template', path: '/docs/Sales Rep Resources 2/Email Templates/Estimate Request Template.md', description: 'Request detailed estimate' },
  { name: 'Generic Partial Template', path: '/docs/Sales Rep Resources 2/Email Templates/Generic Partial Template.md', description: 'Generic partial approval response' },
  { name: 'GAF Guidelines Template', path: '/docs/Sales Rep Resources 2/Email Templates/GAF Guidelines Template.md', description: 'GAF manufacturer guidelines' },
  { name: 'Siding Argument', path: '/docs/Sales Rep Resources 2/Email Templates/Siding Argument.md', description: 'Siding replacement argument for insurance' },
  { name: 'Danny_s Repair Attempt Video Template', path: '/docs/Sales Rep Resources 2/Email Templates/Danny_s Repair Attempt Video Template.md', description: 'Video documentation repair attempt' },
];

const STATES = [
  { code: 'VA', name: 'Virginia' },
  { code: 'MD', name: 'Maryland' },
  { code: 'PA', name: 'Pennsylvania' }
];

const EmailPanel: React.FC = () => {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templateContent, setTemplateContent] = useState<string>('');
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [selectedState, setSelectedState] = useState<string>('VA');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (selectedTemplate) {
      loadTemplate(selectedTemplate);
    }
  }, [selectedTemplate]);

  const loadTemplate = async (templatePath: string) => {
    try {
      const content = await knowledgeService.loadDocument(templatePath);
      setTemplateContent(content.content);
    } catch (error) {
      console.error('Failed to load template:', error);
      setTemplateContent('');
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient || !subject) return;

    setIsGenerating(true);
    setGeneratedEmail('');

    try {
      const keyPoints = `
ROOF-ER CONTEXT:
- Company: Roof-ER, professional roofing contractor
- Operating States: Virginia, Maryland, Pennsylvania
- Current State: ${selectedState}

${templateContent ? `TEMPLATE TO FOLLOW:\n${templateContent}\n\n` : ''}

${customInstructions ? `SPECIFIC INSTRUCTIONS:\n${customInstructions}\n\n` : ''}

REQUIREMENTS:
1. Use professional but friendly tone for insurance/customer communication
2. Include Roof-ER branding appropriately
3. Follow template structure if provided above
4. Reference state-specific building codes/regulations for ${selectedState} if applicable
5. Be clear, concise, and action-oriented
6. Include appropriate contact information if needed
      `.trim();

      const response = await generateEmail(recipient, subject, keyPoints);
      setGeneratedEmail(response);
    } catch (error) {
      console.error('Failed to generate email:', error);
      setGeneratedEmail('Failed to generate email. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([`Subject: ${subject}\n\n${generatedEmail}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll">
        <div className="roof-er-page-title">
          <Mail className="w-6 h-6 inline mr-2" style={{ color: 'var(--roof-red)' }} />
          Email Generator - Roof-ER Templates
        </div>

        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: generatedEmail ? '1fr 1fr' : '1fr', gap: '24px' }}>
          {/* Form Section */}
          <div>
            <form onSubmit={handleGenerate}>
              {/* Template Selection */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-primary)'
                }}>
                  <FileText className="w-4 h-4 inline mr-2" />
                  Email Template (Optional)
                </label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'var(--bg-elevated)',
                    border: '2px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    color: 'var(--text-primary)',
                    fontSize: '15px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">Custom Email (No Template)</option>
                  {EMAIL_TEMPLATES.map((template) => (
                    <option key={template.path} value={template.path}>
                      {template.name} - {template.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* State Selection */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-primary)'
                }}>
                  State
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {STATES.map((state) => (
                    <button
                      key={state.code}
                      type="button"
                      onClick={() => setSelectedState(state.code)}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: selectedState === state.code ? 'var(--roof-red)' : 'var(--bg-elevated)',
                        border: `2px solid ${selectedState === state.code ? 'var(--roof-red)' : 'var(--border-default)'}`,
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {state.code}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipient */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-primary)'
                }}>
                  Recipient *
                </label>
                <input
                  className="roof-er-input-field"
                  type="email"
                  placeholder="john.doe@insurance.com"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  style={{ width: '100%' }}
                  required
                />
              </div>

              {/* Subject */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-primary)'
                }}>
                  Subject Line *
                </label>
                <input
                  className="roof-er-input-field"
                  placeholder="Re: Storm Damage Claim #12345"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  style={{ width: '100%' }}
                  required
                />
              </div>

              {/* Custom Instructions */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-primary)'
                }}>
                  Custom Instructions (Optional)
                </label>
                <textarea
                  className="roof-er-input-field"
                  placeholder="Add specific details, customer name, claim number, or any special instructions..."
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  rows={4}
                  style={{ width: '100%', minHeight: '100px' }}
                />
              </div>

              {/* Generate Button */}
              <button
                type="submit"
                className="roof-er-send-btn"
                style={{
                  width: '100%',
                  height: '52px',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontWeight: 600
                }}
                disabled={isGenerating || !recipient || !subject}
              >
                {isGenerating ? (
                  <>
                    <Spinner />
                    Generating Email...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate Email with AI
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Preview Section */}
          {generatedEmail && (
            <div>
              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                  paddingBottom: '16px',
                  borderBottom: '1px solid var(--border-subtle)'
                }}>
                  <h3 style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: 0
                  }}>
                    Generated Email
                  </h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleCopy}
                      style={{
                        padding: '8px 12px',
                        background: copied ? 'var(--success)' : 'var(--bg-tertiary)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '14px',
                        fontWeight: 500,
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {copied ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleDownload}
                      style={{
                        padding: '8px 12px',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '14px',
                        fontWeight: 500
                      }}
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                  </div>
                </div>

                {/* Email Preview */}
                <div style={{
                  background: 'var(--bg-secondary)',
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '12px'
                }}>
                  <div style={{ marginBottom: '8px', fontSize: '13px', color: 'var(--text-tertiary)' }}>
                    <strong>To:</strong> {recipient}
                  </div>
                  <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--text-tertiary)' }}>
                    <strong>Subject:</strong> {subject}
                  </div>
                  <div style={{
                    borderTop: '1px solid var(--border-subtle)',
                    paddingTop: '12px',
                    fontSize: '14px',
                    lineHeight: '1.7',
                    color: 'var(--text-primary)',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {generatedEmail}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailPanel;
