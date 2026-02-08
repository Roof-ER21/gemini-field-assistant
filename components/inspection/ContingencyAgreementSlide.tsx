/**
 * ContingencyAgreementSlide - Insurance Claim Agreement (Contingency) with e-signatures
 * Based on ROOF-ER DMV Blank Contingency PDF
 */

import React, { useState } from 'react';
import { FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { SignaturePad } from './SignaturePad';

interface ContingencyAgreementData {
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  customerEmail: string;
  insuranceCompany: string;
  claimNumber: string;
  deductible: string;
  notes: string;
  agentSignature: string | null;
  customerSignature1: string | null;
  customerSignature2: string | null;
  signedAt: string | null;
}

interface ContingencyAgreementSlideProps {
  // Pre-filled from claim authorization
  initialData?: Partial<ContingencyAgreementData>;
  agentName?: string;
  onComplete: (data: ContingencyAgreementData) => void;
  onBack?: () => void;
}

export const ContingencyAgreementSlide: React.FC<ContingencyAgreementSlideProps> = ({
  initialData,
  agentName = 'ROOF-ER Representative',
  onComplete,
  onBack
}) => {
  const [formData, setFormData] = useState<ContingencyAgreementData>({
    customerName: initialData?.customerName || '',
    customerAddress: initialData?.customerAddress || '',
    customerPhone: initialData?.customerPhone || '',
    customerEmail: initialData?.customerEmail || '',
    insuranceCompany: initialData?.insuranceCompany || '',
    claimNumber: initialData?.claimNumber || '',
    deductible: initialData?.deductible || '',
    notes: initialData?.notes || '',
    agentSignature: null,
    customerSignature1: null,
    customerSignature2: null,
    signedAt: null
  });

  const [showSecondSignature, setShowSecondSignature] = useState(false);

  // Both agent and at least one customer must sign
  const isValid = formData.customerName.trim() !== '' &&
                  formData.insuranceCompany.trim() !== '' &&
                  formData.agentSignature !== null &&
                  formData.customerSignature1 !== null;

  const handleAgentSignatureChange = (signature: string | null) => {
    setFormData(prev => ({ ...prev, agentSignature: signature }));
  };

  const handleCustomerSignature1Change = (signature: string | null) => {
    setFormData(prev => ({
      ...prev,
      customerSignature1: signature,
      signedAt: signature ? new Date().toISOString() : prev.signedAt
    }));
  };

  const handleCustomerSignature2Change = (signature: string | null) => {
    setFormData(prev => ({ ...prev, customerSignature2: signature }));
  };

  const handleSubmit = () => {
    if (isValid) {
      onComplete(formData);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
      overflow: 'auto'
    }}>
      {/* Header */}
      <div style={{
        padding: '24px 40px',
        borderBottom: '1px solid #E5E7EB',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        background: 'white'
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '14px',
          background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <FileText size={28} color="white" />
        </div>
        <div>
          <h2 style={{
            fontSize: '24px',
            fontWeight: '700',
            color: '#111827',
            margin: 0
          }}>
            Insurance Claim Agreement
          </h2>
          <p style={{
            fontSize: '14px',
            color: '#6B7280',
            margin: '4px 0 0 0'
          }}>
            Contingency agreement for insurance claim work
          </p>
        </div>
      </div>

      {/* Form Content */}
      <div style={{
        flex: 1,
        padding: '32px 40px',
        overflow: 'auto'
      }}>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto'
        }}>
          {/* Pre-filled Info Display */}
          <div style={{
            background: '#F3F4F6',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px',
              fontSize: '14px'
            }}>
              <div>
                <span style={{ color: '#6B7280' }}>Customer: </span>
                <strong style={{ color: '#111827' }}>{formData.customerName || 'Not provided'}</strong>
              </div>
              <div>
                <span style={{ color: '#6B7280' }}>Phone: </span>
                <strong style={{ color: '#111827' }}>{formData.customerPhone || 'Not provided'}</strong>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ color: '#6B7280' }}>Address: </span>
                <strong style={{ color: '#111827' }}>{formData.customerAddress || 'Not provided'}</strong>
              </div>
              <div>
                <span style={{ color: '#6B7280' }}>Insurance: </span>
                <strong style={{ color: '#111827' }}>{formData.insuranceCompany || 'Not selected'}</strong>
              </div>
              <div>
                <span style={{ color: '#6B7280' }}>Claim #: </span>
                <strong style={{ color: '#111827' }}>{formData.claimNumber || 'Pending'}</strong>
              </div>
            </div>
          </div>

          {/* Deductible Input */}
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '24px',
            border: '1px solid #E5E7EB',
            marginBottom: '24px'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#6B7280',
                  display: 'block',
                  marginBottom: '6px'
                }}>
                  Deductible Amount
                </label>
                <input
                  type="text"
                  value={formData.deductible}
                  onChange={(e) => setFormData(prev => ({ ...prev, deductible: e.target.value }))}
                  placeholder="$1,000"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #D1D5DB',
                    fontSize: '15px',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#6B7280',
                  display: 'block',
                  marginBottom: '6px'
                }}>
                  Claim Number (if known)
                </label>
                <input
                  type="text"
                  value={formData.claimNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, claimNumber: e.target.value }))}
                  placeholder="Assigned after filing"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #D1D5DB',
                    fontSize: '15px',
                    outline: 'none'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Agreement Terms */}
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '24px',
            border: '1px solid #E5E7EB',
            marginBottom: '24px'
          }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#374151',
              margin: '0 0 16px 0'
            }}>
              Agreement Terms
            </h3>

            <div style={{
              fontSize: '14px',
              color: '#4B5563',
              lineHeight: '1.7',
              maxHeight: '200px',
              overflow: 'auto',
              padding: '16px',
              background: '#F9FAFB',
              borderRadius: '8px',
              border: '1px solid #E5E7EB'
            }}>
              <p style={{ margin: '0 0 12px 0' }}>
                Customer is contracting with The Roof Docs LLC, henceforth referred to as "Company,"
                to perform the scope of work approved by Insurance Company for the above property claim.
                Company is hereby authorized by the Customer to do any and all work approved by Insurance Company.
              </p>
              <p style={{ margin: '0 0 12px 0' }}>
                Customer shall pay applicable deductible at completion of the project and endorse over
                all insurance proceed checks to Company, including any supplement or supplemental payments
                made by Insurance Company.
              </p>
              <p style={{ margin: '0 0 12px 0', fontWeight: '600' }}>
                If Insurance Company does not approve a complete replacement value claim, this Agreement
                will be null and void.
              </p>
              <p style={{ margin: '0 0 12px 0' }}>
                If Customer cancels this contract outside of the rescission period or otherwise breaches
                this Insurance Claim Agreement, Customer and Company agree Customer will owe a fee of 15%
                of the total value of the claim shown in the estimate approved by the insurance company
                as a liquidated damages fee.
              </p>
              <p style={{ margin: 0 }}>
                If Customer fails to substantively respond or communicate with Company for a thirty-day
                period, Customer will have materially breached and cancelled this Agreement.
              </p>
            </div>
          </div>

          {/* Notes Field */}
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '24px',
            border: '1px solid #E5E7EB',
            marginBottom: '24px'
          }}>
            <label style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151',
              display: 'block',
              marginBottom: '12px'
            }}>
              Notes (optional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Any additional notes or special conditions..."
              rows={3}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid #D1D5DB',
                fontSize: '15px',
                outline: 'none',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Rescission Notice */}
          <div style={{
            background: '#FEF3C7',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
            border: '1px solid #FCD34D',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px'
          }}>
            <AlertCircle size={20} style={{ color: '#D97706', flexShrink: 0, marginTop: '2px' }} />
            <p style={{
              fontSize: '13px',
              color: '#92400E',
              margin: 0,
              lineHeight: '1.5'
            }}>
              <strong>Rescission Period:</strong> You, the buyer, may cancel this transaction at any time
              prior to midnight of the third business day after the date of this transaction.
            </p>
          </div>

          {/* Signature Section */}
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '24px',
            border: '1px solid #E5E7EB',
            marginBottom: '24px'
          }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#374151',
              margin: '0 0 8px 0'
            }}>
              Signatures
            </h3>
            <p style={{
              fontSize: '13px',
              color: '#6B7280',
              margin: '0 0 24px 0'
            }}>
              By signing below, I agree to the terms and conditions contained in this Agreement.
              I acknowledge receipt of a copy of this Agreement.
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '24px'
            }}>
              {/* Agent Signature */}
              <div>
                <SignaturePad
                  width={300}
                  height={120}
                  lineColor="#1f2937"
                  backgroundColor="#ffffff"
                  onSignatureChange={handleAgentSignatureChange}
                  label={`Agent of The Roof Docs LLC`}
                  required={true}
                />
                <p style={{
                  fontSize: '12px',
                  color: '#6B7280',
                  marginTop: '8px',
                  textAlign: 'center'
                }}>
                  {agentName}
                </p>
              </div>

              {/* Customer Signature 1 */}
              <div>
                <SignaturePad
                  width={300}
                  height={120}
                  lineColor="#1f2937"
                  backgroundColor="#ffffff"
                  onSignatureChange={handleCustomerSignature1Change}
                  label="Customer Signature"
                  required={true}
                />
                <p style={{
                  fontSize: '12px',
                  color: '#6B7280',
                  marginTop: '8px',
                  textAlign: 'center'
                }}>
                  {formData.customerName || 'Customer'}
                </p>
              </div>
            </div>

            {/* Second Customer Signature Toggle */}
            <div style={{ marginTop: '24px' }}>
              {!showSecondSignature ? (
                <button
                  onClick={() => setShowSecondSignature(true)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: '1px dashed #D1D5DB',
                    background: '#F9FAFB',
                    color: '#6B7280',
                    fontSize: '14px',
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  + Add Second Customer Signature (if applicable)
                </button>
              ) : (
                <div style={{ maxWidth: '300px' }}>
                  <SignaturePad
                    width={300}
                    height={120}
                    lineColor="#1f2937"
                    backgroundColor="#ffffff"
                    onSignatureChange={handleCustomerSignature2Change}
                    label="Second Customer Signature (optional)"
                    required={false}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Date */}
          <p style={{
            fontSize: '14px',
            color: '#6B7280',
            textAlign: 'center',
            marginBottom: '24px'
          }}>
            Date: {new Date().toLocaleDateString()}
          </p>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            gap: '16px',
            justifyContent: 'center'
          }}>
            {onBack && (
              <button
                onClick={onBack}
                style={{
                  padding: '14px 32px',
                  borderRadius: '12px',
                  border: '1px solid #D1D5DB',
                  background: 'white',
                  color: '#6B7280',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Back
              </button>
            )}

            <button
              onClick={handleSubmit}
              disabled={!isValid}
              style={{
                padding: '14px 48px',
                borderRadius: '12px',
                border: 'none',
                background: isValid
                  ? 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'
                  : '#E5E7EB',
                color: isValid ? 'white' : '#9CA3AF',
                fontSize: '16px',
                fontWeight: '700',
                cursor: isValid ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: isValid ? '0 8px 24px -8px rgba(22, 163, 74, 0.5)' : 'none'
              }}
            >
              <CheckCircle2 size={22} />
              Complete Agreement
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContingencyAgreementSlide;
