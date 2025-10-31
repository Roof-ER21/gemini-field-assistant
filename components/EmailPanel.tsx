import React, { useState, useEffect } from 'react';
import { Mail, Send, Copy, FileText, CheckCircle, Sparkles, Download, MessageCircle, Eye, Lightbulb, User, Building, Hash, MapPin } from 'lucide-react';
import { knowledgeService, Document } from '../services/knowledgeService';
import { generateEmail } from '../services/geminiService';
import Spinner from './Spinner';

type EmailTemplate = {
  name: string;
  path: string;
  description: string;
};

type ToneOption = {
  value: string;
  label: string;
  description: string;
  percentage: number;
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

const TONE_OPTIONS: ToneOption[] = [
  { value: 'professional', label: 'Professional', description: 'For adjusters (70% of communications)', percentage: 70 },
  { value: 'formal', label: 'Formal', description: 'For insurance companies (20%)', percentage: 20 },
  { value: 'friendly', label: 'Friendly', description: 'For homeowners (10%)', percentage: 10 }
];

interface EmailPanelProps {
  emailContext?: { template: string; context: string } | null;
  onContextUsed?: () => void;
}

const EmailPanel: React.FC<EmailPanelProps> = ({ emailContext, onContextUsed }) => {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templateContent, setTemplateContent] = useState<string>('');
  const [recipientName, setRecipientName] = useState('');
  const [subject, setSubject] = useState('');
  const [selectedTone, setSelectedTone] = useState<string>('professional');

  // Optional context fields
  const [customerName, setCustomerName] = useState('');
  const [claimNumber, setClaimNumber] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');

  const [customInstructions, setCustomInstructions] = useState('');
  const [selectedState, setSelectedState] = useState<string>('VA');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState<string>('');
  const [whyItWorks, setWhyItWorks] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);

  useEffect(() => {
    if (selectedTemplate) {
      loadTemplate(selectedTemplate);
    }
  }, [selectedTemplate]);

  // Handle email context transfer from chat
  useEffect(() => {
    if (emailContext) {
      // Pre-fill the custom instructions with the conversation context
      setCustomInstructions(emailContext.context);

      // Try to extract and set template content if it's in the context
      if (emailContext.template) {
        setGeneratedEmail(emailContext.template);
      }

      // Clear the context after using it
      onContextUsed?.();
    }
  }, [emailContext, onContextUsed]);

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
    if (!recipientName || !subject) return;

    setIsGenerating(true);
    setGeneratedEmail('');
    setWhyItWorks('');

    try {
      // Build context from optional fields
      const contextInfo = [];
      if (customerName) contextInfo.push(`Customer Email: ${customerName}`);
      if (claimNumber) contextInfo.push(`Claim Number: ${claimNumber}`);
      if (propertyAddress) contextInfo.push(`Property Address: ${propertyAddress}`);

      const keyPoints = `
YOU ARE AN EMAIL GENERATOR for Roof-ER sales reps.

YOUR TASK: Generate a professional email FROM a Roof-ER sales representative TO the recipient.

The email should be written FROM THE REP'S PERSPECTIVE, not from an AI assistant.
- Use first-person language: "I am writing..." "We at Roof-ER..." "I would like to..."
- Write as if the rep is speaking directly to the recipient
- Do NOT write as Susan AI or include any AI commentary
- The rep is the sender, the recipient name below is who receives the email

ROOF-ER CONTEXT:
- Company: Roof-ER, professional roofing contractor
- Operating States: Virginia, Maryland, Pennsylvania
- Current State: ${selectedState}
- Recipient Name: ${recipientName}
${contextInfo.length > 0 ? `- Additional Context: ${contextInfo.join(', ')}` : ''}

TONE: ${selectedTone.charAt(0).toUpperCase() + selectedTone.slice(1)} (${TONE_OPTIONS.find(t => t.value === selectedTone)?.description})

${templateContent ? `TEMPLATE TO FOLLOW:\n${templateContent}\n\n` : ''}

${customInstructions ? `SPECIFIC INSTRUCTIONS:\n${customInstructions}\n\n` : ''}

EMAIL GENERATION REQUIREMENTS:
1. **CRITICAL**: Write FROM the Roof-ER rep TO ${recipientName}
2. Start with greeting: "Dear ${recipientName},"
3. Use first-person from rep's perspective: "I am writing to..." "We at Roof-ER..."
4. Use ${selectedTone} tone appropriate for the audience
5. Follow template structure if provided above (adapt as needed)
6. Be professional, clear, and action-oriented
7. End with clear next steps or call to action
8. Sign off appropriately: "Sincerely, [Rep Name]" or "Best regards, Roof-ER Team"

WHAT TO AVOID:
- Do NOT write as "Susan AI" or any AI persona
- Do NOT include AI commentary or explanations
- Do NOT use "WE'RE going to..." in collaborative coaching style
- Keep it professional and straightforward

IMPORTANT: Generate ONLY the email body from the rep's perspective to ${recipientName}.
      `.trim();

      const response = await generateEmail(recipientName, subject, keyPoints);
      setGeneratedEmail(response);

      // Generate "Why It Works" explanation
      const whyItWorksPrompt = `
Based on this email that was just generated:

Subject: ${subject}
Tone: ${selectedTone}
Template: ${selectedTemplate ? EMAIL_TEMPLATES.find(t => t.path === selectedTemplate)?.name : 'Custom'}
State: ${selectedState}

Email Content:
${response}

Provide a concise 3-4 sentence explanation of WHY this email approach works from a psychological and strategic perspective. Focus on:
1. The psychological principles at play
2. Why the tone and structure are effective
3. How it positions the rep/customer for success
4. Any strategic advantages it creates

Keep it practical and actionable. Use confident language.
      `.trim();

      const whyResponse = await generateEmail('', 'Why It Works', whyItWorksPrompt);
      setWhyItWorks(whyResponse);

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

        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'grid', gridTemplateColumns: generatedEmail ? '1fr 1fr' : '1fr', gap: '24px' }}>
          {/* Form Section */}
          <div>
            <form onSubmit={handleGenerate}>
              {/* Template Selection */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-primary)'
                  }}>
                    <FileText className="w-4 h-4 inline mr-2" />
                    Email Template (Optional)
                  </label>
                  {selectedTemplate && templateContent && (
                    <button
                      type="button"
                      onClick={() => setShowTemplatePreview(!showTemplatePreview)}
                      style={{
                        padding: '4px 8px',
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
                      <Eye className="w-3 h-3" />
                      {showTemplatePreview ? 'Hide' : 'Preview'}
                    </button>
                  )}
                </div>
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

                {/* Template Preview */}
                {showTemplatePreview && templateContent && (
                  <div style={{
                    marginTop: '12px',
                    padding: '12px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '13px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {templateContent.substring(0, 500)}...
                  </div>
                )}
              </div>

              {/* Tone Selector */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-primary)'
                }}>
                  <MessageCircle className="w-4 h-4 inline mr-2" />
                  Communication Tone
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {TONE_OPTIONS.map((tone) => (
                    <button
                      key={tone.value}
                      type="button"
                      onClick={() => setSelectedTone(tone.value)}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: selectedTone === tone.value ? 'var(--roof-red)' : 'var(--bg-elevated)',
                        border: `2px solid ${selectedTone === tone.value ? 'var(--roof-red)' : 'var(--border-default)'}`,
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>{tone.label}</div>
                    </button>
                  ))}
                </div>
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

              {/* Recipient Name */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-primary)'
                }}>
                  <User className="w-4 h-4 inline mr-2" />
                  Recipient Name *
                </label>
                <input
                  className="roof-er-input-field"
                  type="text"
                  placeholder="Mr. Johnson"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  style={{ width: '100%' }}
                  required
                />
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  For personalized greeting: "Dear Mr. Johnson" instead of "To Whom It May Concern"
                </div>
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

              {/* Optional Context Fields */}
              <div style={{
                padding: '16px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                marginBottom: '20px'
              }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '12px'
                }}>
                  Optional Context (Helps Personalize)
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      <Mail className="w-3 h-3 inline mr-1" />
                      Email
                    </label>
                    <input
                      className="roof-er-input-field"
                      type="email"
                      placeholder="customer@email.com"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', fontSize: '13px' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      <Hash className="w-3 h-3 inline mr-1" />
                      Claim Number
                    </label>
                    <input
                      className="roof-er-input-field"
                      type="text"
                      placeholder="CLM-2024-12345"
                      value={claimNumber}
                      onChange={(e) => setClaimNumber(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', fontSize: '13px' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    <MapPin className="w-3 h-3 inline mr-1" />
                    Property Address
                  </label>
                  <input
                    className="roof-er-input-field"
                    type="text"
                    placeholder="123 Main St, Richmond, VA"
                    value={propertyAddress}
                    onChange={(e) => setPropertyAddress(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px' }}
                  />
                </div>
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
                  Additional Details (Optional)
                </label>
                <textarea
                  className="roof-er-input-field"
                  placeholder="Add any special instructions, damage details, or specific points you want to address..."
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
                disabled={isGenerating || !recipientName || !subject}
              >
                {isGenerating ? (
                  <>
                    <Spinner />
                    Susan is crafting your email...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate Email with Susan AI
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
                padding: '20px',
                marginBottom: '20px'
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
                    <strong>To:</strong> {recipientName}
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

                {/* Talk with Susan Button - Coming Soon */}
                <button
                  disabled
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-disabled)',
                    cursor: 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    fontWeight: 500
                  }}
                >
                  <MessageCircle className="w-4 h-4" />
                  Talk with Susan (Refine Email) - Coming Soon
                </button>
              </div>

              {/* Here's Why It Works Box */}
              {whyItWorks && (
                <div style={{
                  background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                  border: '2px solid #fbbf24',
                  borderRadius: 'var(--radius-lg)',
                  padding: '20px',
                  marginBottom: '20px'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px'
                  }}>
                    <Lightbulb className="w-5 h-5" style={{ color: '#d97706' }} />
                    <h3 style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      color: '#92400e',
                      margin: 0
                    }}>
                      Here's Why This Works
                    </h3>
                  </div>
                  <div style={{
                    fontSize: '14px',
                    lineHeight: '1.7',
                    color: '#78350f',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {whyItWorks}
                  </div>
                </div>
              )}

              {/* Knowledge Base References - Coming Soon */}
              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px',
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '13px',
                  color: 'var(--text-tertiary)',
                  marginBottom: '8px'
                }}>
                  <FileText className="w-4 h-4 inline mr-2" />
                  Knowledge Base Citations & State Info Coming Soon
                </div>
                <div style={{
                  fontSize: '11px',
                  color: 'var(--text-disabled)'
                }}>
                  Hover over [X.X] citations to see document previews • Click state buttons for quick reference
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
