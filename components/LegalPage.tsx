/**
 * Legal Page Component
 * Privacy Policy and Terms of Service for Susan AI-21
 * Required for App Store compliance
 */

import React, { useState } from 'react';
import { X, Shield, FileText, ChevronDown, ChevronUp } from 'lucide-react';

interface LegalPageProps {
  onClose: () => void;
  initialTab?: 'privacy' | 'terms';
}

const LegalPage: React.FC<LegalPageProps> = ({ onClose, initialTab = 'privacy' }) => {
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>(initialTab);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev =>
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    );
  };

  const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => {
    const isExpanded = expandedSections.includes(id);
    return (
      <div
        className="mb-4"
        style={{
          background: '#0a0a0a',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid #262626'
        }}
      >
        <button
          onClick={() => toggleSection(id)}
          className="w-full px-4 py-3 flex items-center justify-between text-left"
          style={{
            color: '#ffffff',
            background: isExpanded ? 'rgba(220, 38, 38, 0.1)' : 'transparent'
          }}
        >
          <span className="font-medium">{title}</span>
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {isExpanded && (
          <div
            className="px-4 pb-4 text-sm leading-relaxed"
            style={{ color: '#d4d4d8' }}
          >
            {children}
          </div>
        )}
      </div>
    );
  };

  const PrivacyPolicy = () => (
    <div>
      <p className="mb-4 text-sm" style={{ color: '#a1a1aa' }}>
        Last updated: January 26, 2026
      </p>

      <Section id="intro" title="Introduction">
        <p className="mb-3">
          Susan AI-21 ("we", "our", or "us") is committed to protecting your privacy.
          This Privacy Policy explains how we collect, use, disclose, and safeguard your
          information when you use our mobile application and related services.
        </p>
      </Section>

      <Section id="data-collection" title="Information We Collect">
        <p className="mb-3"><strong>Account Information:</strong></p>
        <ul className="list-disc pl-5 mb-3">
          <li>Email address (for authentication)</li>
          <li>Name (optional, for personalization)</li>
          <li>State preference (for regulatory guidance)</li>
        </ul>

        <p className="mb-3"><strong>Usage Data:</strong></p>
        <ul className="list-disc pl-5 mb-3">
          <li>Chat conversations with Susan AI</li>
          <li>Uploaded documents and images (analyzed, then deleted)</li>
          <li>Email drafts generated through the app</li>
          <li>Voice transcriptions</li>
          <li>Feature usage patterns</li>
        </ul>

        <p className="mb-3"><strong>Device Information:</strong></p>
        <ul className="list-disc pl-5">
          <li>Device type and operating system</li>
          <li>IP address</li>
          <li>Browser type (for web access)</li>
        </ul>
      </Section>

      <Section id="data-use" title="How We Use Your Information">
        <ul className="list-disc pl-5">
          <li>To provide and maintain our services</li>
          <li>To personalize your experience with state-specific guidance</li>
          <li>To improve our AI assistant's responses</li>
          <li>To send you important service updates</li>
          <li>To ensure security and prevent fraud</li>
          <li>To comply with legal obligations</li>
        </ul>
      </Section>

      <Section id="ai-disclosure" title="AI Processing Disclosure">
        <p className="mb-3">
          Susan AI-21 uses artificial intelligence (Google Gemini) to:
        </p>
        <ul className="list-disc pl-5 mb-3">
          <li>Analyze roof damage photos and documents</li>
          <li>Generate email drafts and responses</li>
          <li>Provide insurance claim guidance</li>
          <li>Transcribe voice recordings</li>
          <li>Answer questions about roofing regulations</li>
        </ul>
        <p>
          Your conversations may be processed by AI models to improve response quality.
          We do not use your data to train public AI models without explicit consent.
        </p>
      </Section>

      <Section id="data-sharing" title="Information Sharing">
        <p className="mb-3">We do NOT sell your personal information. We may share data with:</p>
        <ul className="list-disc pl-5">
          <li><strong>Service Providers:</strong> Cloud hosting, AI processing (Google)</li>
          <li><strong>Legal Requirements:</strong> When required by law or court order</li>
          <li><strong>Business Transfers:</strong> In connection with merger or acquisition</li>
        </ul>
      </Section>

      <Section id="data-retention" title="Data Retention">
        <ul className="list-disc pl-5">
          <li><strong>Chat History:</strong> Retained until you delete it or your account</li>
          <li><strong>Uploaded Files:</strong> Processed immediately, not stored permanently</li>
          <li><strong>Account Data:</strong> Retained until account deletion</li>
          <li><strong>Analytics:</strong> Aggregated and anonymized after 90 days</li>
        </ul>
      </Section>

      <Section id="your-rights" title="Your Rights (GDPR/CCPA)">
        <p className="mb-3">You have the right to:</p>
        <ul className="list-disc pl-5 mb-3">
          <li><strong>Access:</strong> Request a copy of your data</li>
          <li><strong>Rectification:</strong> Correct inaccurate data</li>
          <li><strong>Erasure:</strong> Delete your account and all data</li>
          <li><strong>Portability:</strong> Export your data in JSON format</li>
          <li><strong>Objection:</strong> Opt out of certain data processing</li>
        </ul>
        <p>
          Exercise these rights through the "Your Data" section in your profile settings.
        </p>
      </Section>

      <Section id="security" title="Security Measures">
        <ul className="list-disc pl-5">
          <li>Encryption in transit (HTTPS/TLS)</li>
          <li>Secure cloud infrastructure (Railway)</li>
          <li>Regular security audits</li>
          <li>Access controls and authentication</li>
          <li>No storage of passwords (passwordless login)</li>
        </ul>
      </Section>

      <Section id="children" title="Children's Privacy">
        <p>
          Our services are not intended for users under 18 years of age.
          We do not knowingly collect data from children. If you believe
          we have inadvertently collected such data, please contact us
          for immediate removal.
        </p>
      </Section>

      <Section id="contact" title="Contact Us">
        <p>
          For privacy inquiries or to exercise your rights, contact us at:
        </p>
        <p className="mt-2">
          <strong>Email:</strong> privacy@roofer.com<br />
          <strong>Address:</strong> ROOFER - The Roof Docs<br />
          Virginia, Maryland, Pennsylvania, USA
        </p>
      </Section>
    </div>
  );

  const TermsOfService = () => (
    <div>
      <p className="mb-4 text-sm" style={{ color: '#a1a1aa' }}>
        Last updated: January 26, 2026
      </p>

      <Section id="acceptance" title="Acceptance of Terms">
        <p>
          By accessing or using Susan AI-21, you agree to be bound by these Terms of Service.
          If you disagree with any part of these terms, you may not access the service.
        </p>
      </Section>

      <Section id="description" title="Service Description">
        <p className="mb-3">
          Susan AI-21 is an AI-powered assistant designed for roofing professionals to:
        </p>
        <ul className="list-disc pl-5">
          <li>Analyze roof damage photos and documents</li>
          <li>Generate professional email drafts</li>
          <li>Provide state-specific insurance guidance</li>
          <li>Transcribe voice recordings</li>
          <li>Access roofing knowledge base</li>
        </ul>
      </Section>

      <Section id="eligibility" title="Eligibility">
        <p>
          You must be at least 18 years old and a roofing industry professional
          to use this service. By using Susan AI-21, you represent that you meet
          these requirements.
        </p>
      </Section>

      <Section id="account" title="Account Responsibilities">
        <ul className="list-disc pl-5">
          <li>You are responsible for maintaining account security</li>
          <li>You must provide accurate registration information</li>
          <li>You must not share your account with others</li>
          <li>You must notify us immediately of unauthorized access</li>
        </ul>
      </Section>

      <Section id="acceptable-use" title="Acceptable Use">
        <p className="mb-3">You agree NOT to:</p>
        <ul className="list-disc pl-5">
          <li>Use the service for illegal purposes</li>
          <li>Generate fraudulent insurance claims or documentation</li>
          <li>Attempt to bypass security measures</li>
          <li>Reverse engineer or copy our technology</li>
          <li>Use automated systems to access the service</li>
          <li>Harass, abuse, or harm others through the service</li>
        </ul>
      </Section>

      <Section id="ai-limitations" title="AI Limitations Disclaimer">
        <p className="mb-3">
          <strong>Important:</strong> Susan AI-21 is an AI assistant and:
        </p>
        <ul className="list-disc pl-5">
          <li>Does NOT provide legal, financial, or licensed professional advice</li>
          <li>May occasionally produce inaccurate information</li>
          <li>Should not replace professional judgment</li>
          <li>Recommendations should be verified by qualified professionals</li>
        </ul>
        <p className="mt-3">
          You are solely responsible for decisions made based on AI guidance.
        </p>
      </Section>

      <Section id="intellectual-property" title="Intellectual Property">
        <p className="mb-3">
          <strong>Our Content:</strong> Susan AI-21, its features, and content are owned
          by ROOFER - The Roof Docs and protected by intellectual property laws.
        </p>
        <p>
          <strong>Your Content:</strong> You retain ownership of content you upload.
          By uploading, you grant us a license to process it for service delivery.
        </p>
      </Section>

      <Section id="liability" title="Limitation of Liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, SUSAN AI-21 AND ITS OPERATORS
          SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
          OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR BUSINESS
          OPPORTUNITIES, ARISING FROM YOUR USE OF THE SERVICE.
        </p>
      </Section>

      <Section id="indemnification" title="Indemnification">
        <p>
          You agree to indemnify and hold harmless Susan AI-21, ROOFER - The Roof Docs,
          and their officers, directors, employees, and agents from any claims,
          damages, or expenses arising from your use of the service or violation
          of these terms.
        </p>
      </Section>

      <Section id="termination" title="Termination">
        <p>
          We may terminate or suspend your account at any time for violations
          of these terms. You may also delete your account at any time through
          the profile settings. Upon termination, your right to use the service
          ceases immediately.
        </p>
      </Section>

      <Section id="changes" title="Changes to Terms">
        <p>
          We reserve the right to modify these terms at any time. We will notify
          you of material changes via email or in-app notification. Continued use
          after changes constitutes acceptance.
        </p>
      </Section>

      <Section id="governing-law" title="Governing Law">
        <p>
          These terms are governed by the laws of the Commonwealth of Virginia,
          United States, without regard to conflict of law principles.
        </p>
      </Section>

      <Section id="contact-terms" title="Contact">
        <p>
          For questions about these Terms, contact us at:
        </p>
        <p className="mt-2">
          <strong>Email:</strong> legal@roofer.com<br />
          <strong>Company:</strong> ROOFER - The Roof Docs
        </p>
      </Section>
    </div>
  );

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{
        background: 'rgba(0, 0, 0, 0.90)',
        zIndex: 10000,
        animation: 'fadeIn 0.2s ease-in-out'
      }}
    >
      <div
        className="w-full max-w-2xl"
        style={{
          background: 'linear-gradient(135deg, #171717 0%, #0a0a0a 100%)',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(220, 38, 38, 0.3)',
          animation: 'slideUp 0.3s ease-out',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{
            borderBottom: '1px solid #262626',
            background: '#000000'
          }}
        >
          <div className="flex items-center gap-3">
            {activeTab === 'privacy' ? (
              <Shield className="w-6 h-6" style={{ color: '#dc2626' }} />
            ) : (
              <FileText className="w-6 h-6" style={{ color: '#dc2626' }} />
            )}
            <h2
              className="text-xl font-semibold"
              style={{ color: '#ffffff', letterSpacing: '-0.02em' }}
            >
              {activeTab === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full transition-all"
            style={{
              background: '#0a0a0a',
              color: '#a1a1aa'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(220, 38, 38, 0.2)';
              e.currentTarget.style.color = '#dc2626';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#0a0a0a';
              e.currentTarget.style.color = '#a1a1aa';
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex border-b"
          style={{ borderColor: '#262626' }}
        >
          <button
            onClick={() => setActiveTab('privacy')}
            className="flex-1 py-3 px-4 font-medium text-sm flex items-center justify-center gap-2 transition-all"
            style={{
              background: activeTab === 'privacy' ? 'rgba(220, 38, 38, 0.1)' : 'transparent',
              color: activeTab === 'privacy' ? '#dc2626' : '#a1a1aa',
              borderBottom: activeTab === 'privacy' ? '2px solid #dc2626' : '2px solid transparent'
            }}
          >
            <Shield className="w-4 h-4" />
            Privacy Policy
          </button>
          <button
            onClick={() => setActiveTab('terms')}
            className="flex-1 py-3 px-4 font-medium text-sm flex items-center justify-center gap-2 transition-all"
            style={{
              background: activeTab === 'terms' ? 'rgba(220, 38, 38, 0.1)' : 'transparent',
              color: activeTab === 'terms' ? '#dc2626' : '#a1a1aa',
              borderBottom: activeTab === 'terms' ? '2px solid #dc2626' : '2px solid transparent'
            }}
          >
            <FileText className="w-4 h-4" />
            Terms of Service
          </button>
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto p-6"
          style={{ maxHeight: 'calc(90vh - 140px)' }}
        >
          {activeTab === 'privacy' ? <PrivacyPolicy /> : <TermsOfService />}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 text-center text-xs"
          style={{
            borderTop: '1px solid #262626',
            color: '#71717a',
            background: '#000000'
          }}
        >
          Susan AI-21 by ROOFER - The Roof Docs
        </div>
      </div>
    </div>
  );
};

export default LegalPage;
