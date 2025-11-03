import React, { useState, useEffect } from 'react';
import {
  Mail, Send, Copy, FileText, CheckCircle, Sparkles, Download, MessageCircle,
  Eye, Lightbulb, User, Building, Hash, MapPin, Clock, Search, Trash2,
  Edit3, RefreshCw, Home, Filter, Archive, Plus, X, ChevronLeft, ChevronRight,
  Wand2, Check
} from 'lucide-react';
import { knowledgeService, Document } from '../services/knowledgeService';
import { generateEmail } from '../services/geminiService';
import { databaseService } from '../services/databaseService';
import Spinner from './Spinner';

type EmailTemplate = {
  name: string;
  path: string;
  description: string;
  category: 'insurance' | 'customer' | 'general' | 'state-specific' | 'technical';
  state?: 'VA' | 'MD' | 'PA';
};

type ToneOption = {
  value: string;
  label: string;
  description: string;
  icon: string;
};

type SavedEmail = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  template?: string;
  state: string;
  tone: string;
  createdAt: string;
  variables?: Record<string, string>;
};

type TemplateVariable = {
  key: string;
  label: string;
  placeholder: string;
  icon: React.ComponentType<any>;
};

const EMAIL_TEMPLATES: EmailTemplate[] = [
  // State-Specific Homeowner Templates
  { name: 'VA Thank You - Homeowner', path: '/docs/Sales Rep Resources 2/Email Templates/VA Thank You - Homeowner.md', description: 'Virginia homeowner thank you email', category: 'state-specific', state: 'VA' },
  { name: 'VA Follow-Up - Homeowner', path: '/docs/Sales Rep Resources 2/Email Templates/VA Follow-Up - Homeowner.md', description: 'Virginia homeowner follow-up email', category: 'state-specific', state: 'VA' },
  { name: 'MD Thank You - Homeowner', path: '/docs/Sales Rep Resources 2/Email Templates/MD Thank You - Homeowner.md', description: 'Maryland homeowner thank you email', category: 'state-specific', state: 'MD' },
  { name: 'MD Follow-Up - Homeowner', path: '/docs/Sales Rep Resources 2/Email Templates/MD Follow-Up - Homeowner.md', description: 'Maryland homeowner follow-up email', category: 'state-specific', state: 'MD' },
  { name: 'PA Thank You - Homeowner', path: '/docs/Sales Rep Resources 2/Email Templates/PA Thank You - Homeowner.md', description: 'Pennsylvania homeowner thank you email', category: 'state-specific', state: 'PA' },
  { name: 'PA Follow-Up - Homeowner', path: '/docs/Sales Rep Resources 2/Email Templates/PA Follow-Up - Homeowner.md', description: 'Pennsylvania homeowner follow-up email', category: 'state-specific', state: 'PA' },

  // Insurance Templates
  { name: 'Post AM Email Template', path: '/docs/Sales Rep Resources 2/Email Templates/Post AM Email Template.md', description: 'Follow-up after adjuster meeting', category: 'insurance' },
  { name: 'Repair Attempt Template', path: '/docs/Sales Rep Resources 2/Email Templates/Repair Attempt Template.md', description: 'Document repair attempt for insurance', category: 'insurance' },
  { name: 'Template from Customer to Insurance', path: '/docs/Sales Rep Resources 2/Email Templates/Template from Customer to Insurance.md', description: 'Customer communication to insurance company', category: 'insurance' },
  { name: 'Generic Partial Template', path: '/docs/Sales Rep Resources 2/Email Templates/Generic Partial Template.md', description: 'Generic partial approval response', category: 'insurance' },

  // Customer Templates
  { name: 'Photo Report Template', path: '/docs/Sales Rep Resources 2/Email Templates/Photo Report Template.md', description: 'Send photo documentation', category: 'customer' },
  { name: 'Estimate Request Template', path: '/docs/Sales Rep Resources 2/Email Templates/Estimate Request Template.md', description: 'Request detailed estimate', category: 'customer' },

  // Technical Templates
  { name: 'iTel Shingle Template', path: '/docs/Sales Rep Resources 2/Email Templates/iTel Shingle Template.md', description: 'For iTel shingle quotes and information', category: 'technical' },
  { name: 'PA Permit Denial - Siding Replacement', path: '/docs/Sales Rep Resources 2/Email Templates/PA Permit Denial - Siding Replacement.md', description: 'PA permit denial for siding - requires full replacement', category: 'technical', state: 'PA' },
  { name: 'GAF Guidelines Template', path: '/docs/Sales Rep Resources 2/Email Templates/GAF Guidelines Template.md', description: 'GAF manufacturer guidelines', category: 'technical' },
  { name: 'Siding Argument', path: '/docs/Sales Rep Resources 2/Email Templates/Siding Argument.md', description: 'Siding replacement argument for insurance', category: 'technical' },
  { name: 'Danny_s Repair Attempt Video Template', path: '/docs/Sales Rep Resources 2/Email Templates/Danny_s Repair Attempt Video Template.md', description: 'Video documentation repair attempt', category: 'technical' },
];

const STATES = [
  { code: 'VA', name: 'Virginia', color: '#e74c3c' },
  { code: 'MD', name: 'Maryland', color: '#3498db' },
  { code: 'PA', name: 'Pennsylvania', color: '#2ecc71' }
];

const TONE_OPTIONS: ToneOption[] = [
  { value: 'professional', label: 'Professional', description: 'For adjusters (70% of communications)', icon: '💼' },
  { value: 'formal', label: 'Formal', description: 'For insurance companies (20%)', icon: '📋' },
  { value: 'friendly', label: 'Friendly', description: 'For homeowners (10%)', icon: '😊' }
];

const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { key: 'customerName', label: 'Customer Name', placeholder: 'John Smith', icon: User },
  { key: 'customerEmail', label: 'Email', placeholder: 'customer@email.com', icon: Mail },
  { key: 'propertyAddress', label: 'Property Address', placeholder: '123 Main St, Richmond, VA', icon: MapPin },
  { key: 'claimNumber', label: 'Claim Number', placeholder: 'CLM-2024-12345', icon: Hash },
  { key: 'insuranceCompany', label: 'Insurance Company', placeholder: 'State Farm', icon: Building },
  { key: 'repName', label: 'Rep Name', placeholder: 'Your Name', icon: User },
];

const STATE_REGULATIONS = {
  VA: {
    buildingCode: 'Virginia Construction Code (VCC) 2021',
    insuranceInfo: 'Virginia Bureau of Insurance: 1-877-310-6560',
    permitInfo: 'Most projects require permits. Check local jurisdiction.',
    roofingLicense: 'Class A or B Contractor License required',
  },
  MD: {
    buildingCode: 'Maryland Building Code 2021',
    insuranceInfo: 'Maryland Insurance Administration: 1-800-492-6116',
    permitInfo: 'Permits required for most roofing projects',
    roofingLicense: 'Home Improvement License required',
  },
  PA: {
    buildingCode: 'Pennsylvania Uniform Construction Code (UCC)',
    insuranceInfo: 'PA Insurance Department: 1-877-881-6388',
    permitInfo: 'Local permits required. Strict enforcement.',
    roofingLicense: 'Home Improvement Contractor Registration required',
  }
};

interface EmailPanelProps {
  emailContext?: { template: string; context: string } | null;
  onContextUsed?: () => void;
}

const EmailPanel: React.FC<EmailPanelProps> = ({ emailContext, onContextUsed }) => {
  // Template & Generation State
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templateContent, setTemplateContent] = useState<string>('');
  const [recipientName, setRecipientName] = useState('');
  const [subject, setSubject] = useState('');
  const [selectedTone, setSelectedTone] = useState<string>('professional');
  const [selectedState, setSelectedState] = useState<string>('VA');
  const [customInstructions, setCustomInstructions] = useState('');

  // Template Variables
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});

  // Generation & Preview State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState<string>('');
  const [whyItWorks, setWhyItWorks] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);

  // History & Saved Emails State
  const [savedEmails, setSavedEmails] = useState<SavedEmail[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [selectedHistoryEmail, setSelectedHistoryEmail] = useState<SavedEmail | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<'compose' | 'history'>('compose');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showStateInfo, setShowStateInfo] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [editableEmailBody, setEditableEmailBody] = useState('');

  // AI Enhancement State
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancementType, setEnhancementType] = useState<'improve' | 'grammar' | 'shorten' | 'lengthen' | null>(null);

  useEffect(() => {
    if (selectedTemplate) {
      loadTemplate(selectedTemplate);
    }
  }, [selectedTemplate]);

  // Initialize state from global selection used in Chat
  useEffect(() => {
    try {
      const saved = localStorage.getItem('selectedState');
      if (saved && (saved === 'VA' || saved === 'MD' || saved === 'PA')) {
        setSelectedState(saved);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (emailContext) {
      setCustomInstructions(emailContext.context);
      if (emailContext.template) {
        setGeneratedEmail(emailContext.template);
      }
      onContextUsed?.();
    }
  }, [emailContext, onContextUsed]);

  useEffect(() => {
    loadSavedEmails();
  }, []);

  const loadTemplate = async (templatePath: string) => {
    try {
      const content = await knowledgeService.loadDocument(templatePath);
      setTemplateContent(content.content);
    } catch (error) {
      console.error('Failed to load template:', error);
      setTemplateContent('');
    }
  };

  const loadSavedEmails = () => {
    try {
      const emailsStr = localStorage.getItem('saved_emails') || '[]';
      const emails: SavedEmail[] = JSON.parse(emailsStr);
      setSavedEmails(emails.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } catch (error) {
      console.error('Failed to load saved emails:', error);
      setSavedEmails([]);
    }
  };

  const saveEmail = (email: Omit<SavedEmail, 'id' | 'createdAt'>) => {
    const newEmail: SavedEmail = {
      ...email,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    const updated = [newEmail, ...savedEmails];
    setSavedEmails(updated);
    localStorage.setItem('saved_emails', JSON.stringify(updated));

    // Also log to database service
    databaseService.logEmailGeneration({
      recipient: email.recipient,
      subject: email.subject,
      body: email.body,
      state: email.state,
      emailType: email.template,
    });
  };

  const deleteEmail = (id: string) => {
    const updated = savedEmails.filter(e => e.id !== id);
    setSavedEmails(updated);
    localStorage.setItem('saved_emails', JSON.stringify(updated));
  };

  const loadEmailFromHistory = (email: SavedEmail) => {
    setRecipientName(email.recipient);
    setSubject(email.subject);
    setGeneratedEmail(email.body);
    setSelectedState(email.state);
    setSelectedTone(email.tone);
    if (email.template) {
      setSelectedTemplate(email.template);
    }
    if (email.variables) {
      setTemplateVars(email.variables);
    }
    setActiveTab('compose');
    setSelectedHistoryEmail(null);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientName || !subject) return;

    setIsGenerating(true);
    setGeneratedEmail('');
    setWhyItWorks('');

    try {
      // Pull small, state-aware RAG context for email generation
      const ragDocs = await knowledgeService.searchDocuments(
        [selectedState, subject || '', 'partial', 'approval', 'insurance', 'email'].filter(Boolean).join(' '),
        2,
        selectedState
      );

      const ragSection = ragDocs.length
        ? `\nRELEVANT KNOWLEDGE (Use where appropriate):\n${ragDocs
            .map((d, i) => `(${i + 1}) ${d.document.name}\n${(d.content || '').slice(0, 800)}\n`)
            .join('\n')}`
        : '';
      const contextInfo = [];
      Object.entries(templateVars).forEach(([key, value]) => {
        if (value) {
          const varDef = TEMPLATE_VARIABLES.find(v => v.key === key);
          contextInfo.push(`${varDef?.label || key}: ${value}`);
        }
      });

      const stateRegs = STATE_REGULATIONS[selectedState as keyof typeof STATE_REGULATIONS];

      const keyPoints = `
YOU ARE SUSAN AI-21, Roof-ER's intelligent email generation system.

**CRITICAL FIRST STEP - ANALYZE THE RECIPIENT:**

Before generating the email, carefully analyze who you're writing to based on:
- Recipient Name: "${recipientName}"
- Subject Line: "${subject}"
- Template Selected: ${selectedTemplate ? EMAIL_TEMPLATES.find(t => t.path === selectedTemplate)?.name : 'None (Custom)'}
- Additional Instructions: ${customInstructions || 'None'}
- Context Info: ${contextInfo.length > 0 ? contextInfo.join(', ') : 'None'}

DETERMINE THE AUDIENCE TYPE:
1. **INSURANCE ADJUSTER** - Names like "Mr. Johnson", "Sarah from State Farm", mentions of "claim", "adjuster", "inspection", "estimate review"
2. **INSURANCE COMPANY** - Corporate names like "State Farm Claims Department", "Allstate", mentions of "formal request", "appeal", "coverage"
3. **HOMEOWNER/CUSTOMER** - Personal names like "Mrs. Smith", "John and Mary", mentions of "your roof", "your home", customer-focused language
4. **CONTRACTOR/VENDOR** - Business names, mentions of "quote", "materials", "partnership"

**AUDIENCE DETECTION OVERRIDES TONE SELECTOR:**
The rep selected: ${selectedTone.charAt(0).toUpperCase() + selectedTone.slice(1)} tone
BUT you must intelligently adjust based on who the recipient ACTUALLY is from your analysis above.

Use this intelligence:
- Insurance Adjuster → Professional, business-appropriate, competent (even if "friendly" was selected)
- Insurance Company → Formal, structured, corporate language (even if "friendly" was selected)
- Homeowner/Customer → Friendly, warm, reassuring (even if "formal" was selected)
- Contractor/Vendor → Professional but collaborative

**YOUR TASK:**
Generate a professional email FROM a Roof-ER sales representative TO ${recipientName}.

WRITING STYLE:
- Write FROM THE REP'S PERSPECTIVE, not from an AI assistant
- Use first-person language: "I am writing..." "We at Roof-ER..." "I would like to..."
- Do NOT write as Susan AI or include any AI commentary
- The rep is the sender, ${recipientName} is the recipient

ROOF-ER CONTEXT:
- Company: Roof-ER, professional roofing contractor
- Operating States: Virginia, Maryland, Pennsylvania
- Current State: ${selectedState}
${contextInfo.length > 0 ? `- Additional Context: ${contextInfo.join(', ')}` : ''}

STATE-SPECIFIC INFORMATION (${selectedState}):
- Building Code: ${stateRegs.buildingCode}
- Insurance Info: ${stateRegs.insuranceInfo}
- Permit Requirements: ${stateRegs.permitInfo}
- License Info: ${stateRegs.roofingLicense}

${templateContent ? `TEMPLATE TO FOLLOW (adapt to audience):\n${templateContent}\n\n` : ''}

${customInstructions ? `SPECIFIC INSTRUCTIONS:\n${customInstructions}\n\n` : ''}

${ragSection}

 EMAIL GENERATION REQUIREMENTS:
 1. **CRITICAL**: Analyze recipient type FIRST, then choose appropriate tone
 2. Write FROM the Roof-ER rep TO ${recipientName}
 3. Start with appropriate greeting based on audience formality level
 4. Match language style to recipient type (not just tone selector)
 5. Follow template structure if provided (but adapt language to audience)
 6. Incorporate state-specific regulations when relevant
 7. Be specific and actionable - avoid generic corporate speak
 8. End with a respectful, outcome‑focused request to update the estimate/decision to FULL APPROVAL based on the evidence provided (e.g., "We respectfully request that this be updated to a full replacement consistent with the attached documentation.")
 9. If ending with a question, prefer: "Is there anything else you need from us to make sure we get this to a full approval?"
 10. Do NOT ask to schedule calls/meetings by default; only if the recipient has already requested one

 WHAT TO AVOID:
 - Generic, robotic language that could be sent to anyone
 - Writing to wrong audience (e.g., technical adjuster language to homeowner)
 - Including AI commentary or meta-explanations
 - Using "WE'RE going to..." coaching style
 - Ending with generic invites to schedule a call/meeting instead of respectfully requesting full approval

IMPORTANT: Generate ONLY the email body from the rep's perspective to ${recipientName}. Make it specific to THIS recipient, THIS situation.
If no state-specific rule applies, keep guidance valid across VA/MD/PA and do not assume a state.
      `.trim();

      const response = await generateEmail(recipientName, subject, keyPoints);
      setGeneratedEmail(response);
      setEditableEmailBody(response);

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

      // Save email to history
      saveEmail({
        recipient: recipientName,
        subject,
        body: response,
        template: selectedTemplate,
        state: selectedState,
        tone: selectedTone,
        variables: templateVars,
      });

    } catch (error) {
      console.error('Failed to generate email:', error);
      setGeneratedEmail('Failed to generate email. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEnhanceEmail = async (type: 'improve' | 'grammar' | 'shorten' | 'lengthen') => {
    if (!generatedEmail) return;

    setIsEnhancing(true);
    setEnhancementType(type);

    try {
      const prompts = {
        improve: 'Improve this email to be more persuasive, professional, and effective while maintaining the same core message and tone:',
        grammar: 'Fix any grammar, spelling, or punctuation errors in this email while keeping the exact same message and tone:',
        shorten: 'Make this email more concise by removing unnecessary words while keeping all key information:',
        lengthen: 'Expand this email with more detail and supporting information while maintaining professional quality:',
      };

      const enhancePrompt = `${prompts[type]}\n\n${generatedEmail}\n\nReturn ONLY the improved email, no explanations.`;
      const enhanced = await generateEmail('', 'Enhanced Email', enhancePrompt);
      setGeneratedEmail(enhanced);
      setEditableEmailBody(enhanced);
    } catch (error) {
      console.error('Failed to enhance email:', error);
    } finally {
      setIsEnhancing(false);
      setEnhancementType(null);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(isEditingEmail ? editableEmailBody : generatedEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleDownload = () => {
    const emailText = isEditingEmail ? editableEmailBody : generatedEmail;
    const blob = new Blob([`Subject: ${subject}\n\n${emailText}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSendViaEmail = () => {
    const emailText = isEditingEmail ? editableEmailBody : generatedEmail;
    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailText)}`;
    window.location.href = mailtoLink;
  };

  const filteredTemplates = EMAIL_TEMPLATES.filter(t => {
    if (categoryFilter === 'all') return true;
    if (categoryFilter === 'state') return t.category === 'state-specific' && t.state === selectedState;
    return t.category === categoryFilter;
  });

  const filteredHistory = savedEmails.filter(email => {
    if (!historySearch) return true;
    const search = historySearch.toLowerCase();
    return (
      email.recipient.toLowerCase().includes(search) ||
      email.subject.toLowerCase().includes(search) ||
      email.body.toLowerCase().includes(search)
    );
  });

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll">
        <div className="roof-er-page-title">
          <Mail className="w-6 h-6 inline mr-2" style={{ color: 'var(--roof-red)' }} />
          Email Generator - Roof-ER Templates
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          borderBottom: '2px solid var(--border-default)',
          padding: '0 4px'
        }}>
          <button
            onClick={() => setActiveTab('compose')}
            style={{
              padding: '12px 24px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'compose' ? '3px solid var(--roof-red)' : '3px solid transparent',
              color: activeTab === 'compose' ? 'var(--roof-red)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: 600,
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '-2px'
            }}
          >
            <Edit3 className="w-4 h-4" />
            Compose Email
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              padding: '12px 24px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'history' ? '3px solid var(--roof-red)' : '3px solid transparent',
              color: activeTab === 'history' ? 'var(--roof-red)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: 600,
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '-2px'
            }}
          >
            <Clock className="w-4 h-4" />
            Email History ({savedEmails.length})
          </button>
        </div>

        {/* COMPOSE TAB */}
        {activeTab === 'compose' && (
          <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'grid', gridTemplateColumns: generatedEmail ? '1fr 1fr' : '1fr', gap: '24px' }}>
            {/* Form Section */}
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
              <form onSubmit={handleGenerate}>
                {/* Category Filter Pills */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-primary)'
                  }}>
                    <Filter className="w-4 h-4 inline mr-2" />
                    Template Category
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {[
                      { value: 'all', label: 'All Templates', count: EMAIL_TEMPLATES.length },
                      { value: 'state', label: `${selectedState} Templates`, count: EMAIL_TEMPLATES.filter(t => t.state === selectedState).length },
                      { value: 'insurance', label: 'Insurance', count: EMAIL_TEMPLATES.filter(t => t.category === 'insurance').length },
                      { value: 'customer', label: 'Customer', count: EMAIL_TEMPLATES.filter(t => t.category === 'customer').length },
                      { value: 'technical', label: 'Technical', count: EMAIL_TEMPLATES.filter(t => t.category === 'technical').length },
                    ].map((cat) => (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => setCategoryFilter(cat.value)}
                        style={{
                          padding: '8px 16px',
                          background: categoryFilter === cat.value ? 'var(--roof-red)' : 'var(--bg-elevated)',
                          border: `2px solid ${categoryFilter === cat.value ? 'var(--roof-red)' : 'var(--border-default)'}`,
                          borderRadius: '20px',
                          color: categoryFilter === cat.value ? '#fff' : 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: 600,
                          transition: 'all 0.2s ease',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {cat.label} <span style={{ opacity: 0.7 }}>({cat.count})</span>
                      </button>
                    ))}
                  </div>
                </div>

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
                    {filteredTemplates.map((template) => (
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

                {/* State Selection with Info */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text-primary)'
                    }}>
                      State
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowStateInfo(!showStateInfo)}
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
                      <FileText className="w-3 h-3" />
                      {showStateInfo ? 'Hide' : 'Show'} Regulations
                    </button>
                  </div>
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

                  {/* State Regulations Info */}
                  {showStateInfo && (
                    <div style={{
                      marginTop: '12px',
                      padding: '16px',
                      background: 'var(--bg-secondary)',
                      border: '2px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '13px',
                      lineHeight: '1.6'
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--roof-red)' }}>
                        {selectedState} Regulations & Requirements
                      </div>
                      {Object.entries(STATE_REGULATIONS[selectedState as keyof typeof STATE_REGULATIONS]).map(([key, value]) => (
                        <div key={key} style={{ marginBottom: '6px' }}>
                          <strong>{key.replace(/([A-Z])/g, ' $1').trim()}:</strong> {value}
                        </div>
                      ))}
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
                        <div style={{ fontSize: '20px', marginBottom: '4px' }}>{tone.icon}</div>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{tone.label}</div>
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

                {/* Template Variables */}
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
                    Template Variables (Optional - Personalizes Email)
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {TEMPLATE_VARIABLES.map((variable) => {
                      const Icon = variable.icon;
                      return (
                        <div key={variable.key}>
                          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                            <Icon className="w-3 h-3 inline mr-1" />
                            {variable.label}
                          </label>
                          <input
                            className="roof-er-input-field"
                            type="text"
                            placeholder={variable.placeholder}
                            value={templateVars[variable.key] || ''}
                            onChange={(e) => setTemplateVars({ ...templateVars, [variable.key]: e.target.value })}
                            style={{ width: '100%', padding: '8px 12px', fontSize: '13px' }}
                          />
                        </div>
                      );
                    })}
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
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '12px' }}>
                <div style={{
                  background: 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 100%)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px',
                  marginBottom: '16px'
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
                        onClick={() => setIsEditingEmail(!isEditingEmail)}
                        style={{
                          padding: '8px 12px',
                          background: isEditingEmail ? 'var(--roof-red)' : 'var(--bg-tertiary)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-md)',
                          color: isEditingEmail ? '#fff' : 'var(--text-primary)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '14px',
                          fontWeight: 500
                        }}
                      >
                        <Edit3 className="w-4 h-4" />
                        {isEditingEmail ? 'Preview' : 'Edit'}
                      </button>
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
                      </button>
                    </div>
                  </div>

                  {/* Email Preview or Editor */}
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
                      paddingTop: '12px'
                    }}>
                      {isEditingEmail ? (
                        <textarea
                          value={editableEmailBody}
                          onChange={(e) => setEditableEmailBody(e.target.value)}
                          style={{
                            width: '100%',
                            minHeight: '300px',
                            padding: '12px',
                            background: 'var(--bg-elevated)',
                            border: '2px solid var(--border-default)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--text-primary)',
                            fontSize: '14px',
                            lineHeight: '1.7',
                            fontFamily: 'inherit',
                            resize: 'vertical'
                          }}
                        />
                      ) : (
                        <div style={{
                          fontSize: '14px',
                          lineHeight: '1.7',
                          color: 'var(--text-primary)',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {editableEmailBody || generatedEmail}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* AI Enhancement Tools */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    marginBottom: '12px'
                  }}>
                    <button
                      onClick={() => handleEnhanceEmail('improve')}
                      disabled={isEnhancing}
                      style={{
                        padding: '10px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        color: '#fff',
                        cursor: isEnhancing ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        fontWeight: 600,
                        opacity: isEnhancing ? 0.5 : 1
                      }}
                    >
                      {isEnhancing && enhancementType === 'improve' ? (
                        <Spinner />
                      ) : (
                        <Wand2 className="w-4 h-4" />
                      )}
                      Improve Email
                    </button>
                    <button
                      onClick={() => handleEnhanceEmail('grammar')}
                      disabled={isEnhancing}
                      style={{
                        padding: '10px',
                        background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        color: '#fff',
                        cursor: isEnhancing ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        fontWeight: 600,
                        opacity: isEnhancing ? 0.5 : 1
                      }}
                    >
                      {isEnhancing && enhancementType === 'grammar' ? (
                        <Spinner />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Fix Grammar
                    </button>
                    <button
                      onClick={() => handleEnhanceEmail('shorten')}
                      disabled={isEnhancing}
                      style={{
                        padding: '10px',
                        background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        color: '#fff',
                        cursor: isEnhancing ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        fontWeight: 600,
                        opacity: isEnhancing ? 0.5 : 1
                      }}
                    >
                      {isEnhancing && enhancementType === 'shorten' ? (
                        <Spinner />
                      ) : (
                        <ChevronLeft className="w-4 h-4" />
                      )}
                      Make Shorter
                    </button>
                    <button
                      onClick={() => handleEnhanceEmail('lengthen')}
                      disabled={isEnhancing}
                      style={{
                        padding: '10px',
                        background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        color: '#fff',
                        cursor: isEnhancing ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        fontWeight: 600,
                        opacity: isEnhancing ? 0.5 : 1
                      }}
                    >
                      {isEnhancing && enhancementType === 'lengthen' ? (
                        <Spinner />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      Add Detail
                    </button>
                  </div>

                  {/* Send Button */}
                  <button
                    onClick={handleSendViaEmail}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: 'var(--roof-red)',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      color: '#fff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontSize: '15px',
                      fontWeight: 600,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Send className="w-5 h-5" />
                    Open in Email App
                  </button>
                </div>

                {/* Why It Works Box */}
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
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {/* Search Bar */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ position: 'relative' }}>
                <Search className="w-5 h-5" style={{
                  position: 'absolute',
                  left: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-tertiary)'
                }} />
                <input
                  type="text"
                  placeholder="Search emails by recipient, subject, or content..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '14px 16px 14px 48px',
                    background: 'var(--bg-elevated)',
                    border: '2px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    color: 'var(--text-primary)',
                    fontSize: '15px'
                  }}
                />
              </div>
            </div>

            {/* Email History List */}
            {filteredHistory.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: 'var(--text-secondary)'
              }}>
                <Archive className="w-16 h-16" style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
                  {historySearch ? 'No emails found' : 'No saved emails yet'}
                </div>
                <div style={{ fontSize: '14px' }}>
                  {historySearch ? 'Try a different search term' : 'Generate your first email to see it here'}
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '16px' }}>
                {filteredHistory.map((email) => (
                  <div
                    key={email.id}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '2px solid var(--border-default)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '20px',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer'
                    }}
                    onClick={() => setSelectedHistoryEmail(email)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                          {email.subject}
                        </div>
                        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                          To: {email.recipient}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock className="w-3 h-3" />
                            {new Date(email.createdAt).toLocaleString()}
                          </span>
                          <span style={{
                            padding: '2px 8px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600
                          }}>
                            {email.state}
                          </span>
                          <span style={{
                            padding: '2px 8px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '12px',
                            fontSize: '11px'
                          }}>
                            {email.tone}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            loadEmailFromHistory(email);
                          }}
                          style={{
                            padding: '8px 12px',
                            background: 'var(--roof-red)',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <RefreshCw className="w-3 h-3" />
                          Reuse
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Delete this email from history?')) {
                              deleteEmail(email.id);
                            }
                          }}
                          style={{
                            padding: '8px',
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                      lineHeight: '1.6',
                      maxHeight: '60px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {email.body.substring(0, 200)}...
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Email Detail Modal */}
            {selectedHistoryEmail && (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0, 0, 0, 0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000,
                  padding: '20px'
                }}
                onClick={() => setSelectedHistoryEmail(null)}
              >
                <div
                  style={{
                    background: 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-lg)',
                    maxWidth: '800px',
                    width: '100%',
                    maxHeight: '90vh',
                    overflow: 'auto',
                    padding: '24px'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
                    <div>
                      <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
                        {selectedHistoryEmail.subject}
                      </h2>
                      <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                        To: {selectedHistoryEmail.recipient}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedHistoryEmail(null)}
                      style={{
                        padding: '8px',
                        background: 'var(--bg-tertiary)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div style={{
                    background: 'var(--bg-secondary)',
                    padding: '20px',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '20px'
                  }}>
                    <div style={{
                      fontSize: '14px',
                      lineHeight: '1.7',
                      color: 'var(--text-primary)',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {selectedHistoryEmail.body}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      onClick={() => loadEmailFromHistory(selectedHistoryEmail)}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: 'var(--roof-red)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      <Edit3 className="w-4 h-4" />
                      Edit & Resend
                    </button>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(selectedHistoryEmail.body);
                        alert('Email copied to clipboard!');
                      }}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      <Copy className="w-4 h-4" />
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailPanel;
