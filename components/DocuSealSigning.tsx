/**
 * DocuSeal Signing Component
 *
 * Wraps the @docuseal/react embed widget for in-app document signing.
 * Falls back to showing a message if DocuSeal is not configured.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { DocusealForm } from '@docuseal/react';
import { FileSignature, CheckCircle, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { getApiBaseUrl } from '../services/config';
import { authService } from '../services/authService';

const API = getApiBaseUrl();

interface DocuSealSigningProps {
  /** Existing agreement ID to link the submission to */
  agreementId?: string;
  /** DocuSeal template ID to use */
  templateId: number;
  /** Pre-fill data */
  customerName?: string;
  customerEmail?: string;
  customerAddress?: string;
  insuranceCompany?: string;
  claimNumber?: string;
  agentName?: string;
  /** Whether to send email notification to signer */
  sendEmail?: boolean;
  /** Called when signing is complete */
  onComplete?: (data: { submissionId: number; status: string }) => void;
  /** Called on error */
  onError?: (error: string) => void;
}

const DocuSealSigning: React.FC<DocuSealSigningProps> = ({
  agreementId,
  templateId,
  customerName,
  customerEmail,
  customerAddress,
  insuranceCompany,
  claimNumber,
  agentName,
  sendEmail = false,
  onComplete,
  onError,
}) => {
  const [embedSrc, setEmbedSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [submissionId, setSubmissionId] = useState<number | null>(null);

  const createSubmission = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const email = authService.getCurrentUser()?.email || '';
      const res = await fetch(`${API}/docuseal/submissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': email,
        },
        body: JSON.stringify({
          agreementId,
          templateId,
          customerName,
          customerEmail,
          customerAddress,
          insuranceCompany,
          claimNumber,
          agentName,
          sendEmail,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create signing session');
      }

      const data = await res.json();
      setEmbedSrc(data.embedSrc);
      setSubmissionId(data.submissionId);

      if (!data.embedSrc) {
        throw new Error('No embed URL returned. Check DocuSeal configuration.');
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to initialize signing';
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [agreementId, templateId, customerName, customerEmail, customerAddress, insuranceCompany, claimNumber, agentName, sendEmail, onError]);

  useEffect(() => {
    createSubmission();
  }, [createSubmission]);

  const handleComplete = useCallback((data: any) => {
    setCompleted(true);
    onComplete?.({
      submissionId: submissionId || data?.submission_id || 0,
      status: 'signed',
    });
  }, [submissionId, onComplete]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        gap: '12px',
        color: '#a1a1aa',
      }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: '14px' }}>Preparing document for signing...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '32px',
        gap: '12px',
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: '12px',
      }}>
        <AlertCircle size={32} style={{ color: '#ef4444' }} />
        <div style={{ fontSize: '14px', color: '#fca5a5', textAlign: 'center' }}>{error}</div>
        <button
          onClick={createSubmission}
          style={{
            padding: '8px 16px',
            background: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (completed) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px',
        gap: '12px',
        background: 'rgba(34, 197, 94, 0.1)',
        border: '1px solid rgba(34, 197, 94, 0.2)',
        borderRadius: '12px',
      }}>
        <CheckCircle size={48} style={{ color: '#22c55e' }} />
        <div style={{ fontSize: '18px', fontWeight: 600, color: '#22c55e' }}>Document Signed!</div>
        <div style={{ fontSize: '13px', color: '#a1a1aa' }}>
          The signed document has been saved to the agreement record.
        </div>
      </div>
    );
  }

  if (!embedSrc) {
    return (
      <div style={{
        padding: '32px',
        textAlign: 'center',
        color: '#a1a1aa',
        fontSize: '14px',
      }}>
        <FileSignature size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
        <div>DocuSeal signing widget unavailable</div>
      </div>
    );
  }

  return (
    <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
      <DocusealForm
        src={embedSrc}
        onComplete={handleComplete}
        style={{ width: '100%', minHeight: '600px' }}
      />
    </div>
  );
};

export default DocuSealSigning;
