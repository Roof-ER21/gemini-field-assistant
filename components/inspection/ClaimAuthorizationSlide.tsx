/**
 * ClaimAuthorizationSlide - Claim Authorization Form slide with e-signature
 * Based on ROOF-ER Claim Authorization Form PDF
 */

import React, { useState } from 'react';
import { FileText, CheckCircle2, ArrowRight } from 'lucide-react';
import { SignaturePad } from './SignaturePad';

interface ClaimAuthorizationData {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerEmail: string;
  insuranceCompany: string;
  claimNumber: string;
  customerSignature: string | null;
  signedAt: string | null;
}

interface ClaimAuthorizationSlideProps {
  // Pre-filled from homeowner info
  initialData?: Partial<ClaimAuthorizationData>;
  onComplete: (data: ClaimAuthorizationData) => void;
  onSkip?: () => void;
}

// Common insurance companies in DMV area
const INSURANCE_COMPANIES = [
  'State Farm',
  'Allstate',
  'USAA',
  'Nationwide',
  'Liberty Mutual',
  'Farmers Insurance',
  'Progressive',
  'Travelers',
  'Erie Insurance',
  'American Family',
  'Amica',
  'Hartford',
  'Geico',
  'Other'
];

export const ClaimAuthorizationSlide: React.FC<ClaimAuthorizationSlideProps> = ({
  initialData,
  onComplete,
  onSkip
}) => {
  const [formData, setFormData] = useState<ClaimAuthorizationData>({
    customerName: initialData?.customerName || '',
    customerPhone: initialData?.customerPhone || '',
    customerAddress: initialData?.customerAddress || '',
    customerEmail: initialData?.customerEmail || '',
    insuranceCompany: initialData?.insuranceCompany || '',
    claimNumber: initialData?.claimNumber || '',
    customerSignature: null,
    signedAt: null
  });

  const [showOtherInsurance, setShowOtherInsurance] = useState(false);

  const isValid = formData.customerName.trim() !== '' &&
                  formData.insuranceCompany.trim() !== '' &&
                  formData.customerSignature !== null;

  const handleSignatureChange = (signature: string | null) => {
    setFormData(prev => ({
      ...prev,
      customerSignature: signature,
      signedAt: signature ? new Date().toISOString() : null
    }));
  };

  const handleSubmit = () => {
    if (isValid) {
      onComplete(formData);
    }
  };

  const handleInsuranceChange = (value: string) => {
    if (value === 'Other') {
      setShowOtherInsurance(true);
      setFormData(prev => ({ ...prev, insuranceCompany: '' }));
    } else {
      setShowOtherInsurance(false);
      setFormData(prev => ({ ...prev, insuranceCompany: value }));
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
            Claim Authorization Form
          </h2>
          <p style={{
            fontSize: '14px',
            color: '#6B7280',
            margin: '4px 0 0 0'
          }}>
            Authorize ROOF-ER to communicate with your insurance company
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
          maxWidth: '700px',
          margin: '0 auto'
        }}>
          {/* Customer Info Section */}
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
              margin: '0 0 20px 0'
            }}>
              Customer Information
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Customer Name */}
              <div>
                <label style={{
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#6B7280',
                  display: 'block',
                  marginBottom: '6px'
                }}>
                  Customer Name <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.customerName}
                  onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
                  placeholder="John Smith"
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

              {/* Phone */}
              <div>
                <label style={{
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#6B7280',
                  display: 'block',
                  marginBottom: '6px'
                }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.customerPhone}
                  onChange={(e) => setFormData(prev => ({ ...prev, customerPhone: e.target.value }))}
                  placeholder="(555) 123-4567"
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

              {/* Address - Full Width */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#6B7280',
                  display: 'block',
                  marginBottom: '6px'
                }}>
                  Project Address
                </label>
                <input
                  type="text"
                  value={formData.customerAddress}
                  onChange={(e) => setFormData(prev => ({ ...prev, customerAddress: e.target.value }))}
                  placeholder="123 Main Street, Springfield, VA 22150"
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

              {/* Email */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#6B7280',
                  display: 'block',
                  marginBottom: '6px'
                }}>
                  Email
                </label>
                <input
                  type="email"
                  value={formData.customerEmail}
                  onChange={(e) => setFormData(prev => ({ ...prev, customerEmail: e.target.value }))}
                  placeholder="john@example.com"
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

          {/* Insurance Info Section */}
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
              margin: '0 0 20px 0'
            }}>
              Insurance Information
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Insurance Company */}
              <div>
                <label style={{
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#6B7280',
                  display: 'block',
                  marginBottom: '6px'
                }}>
                  Insurance Company <span style={{ color: '#DC2626' }}>*</span>
                </label>
                {showOtherInsurance ? (
                  <input
                    type="text"
                    value={formData.insuranceCompany}
                    onChange={(e) => setFormData(prev => ({ ...prev, insuranceCompany: e.target.value }))}
                    placeholder="Enter insurance company name"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #D1D5DB',
                      fontSize: '15px',
                      outline: 'none'
                    }}
                  />
                ) : (
                  <select
                    value={formData.insuranceCompany}
                    onChange={(e) => handleInsuranceChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #D1D5DB',
                      fontSize: '15px',
                      outline: 'none',
                      background: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Select insurance company</option>
                    {INSURANCE_COMPANIES.map(company => (
                      <option key={company} value={company}>{company}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Claim Number */}
              <div>
                <label style={{
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#6B7280',
                  display: 'block',
                  marginBottom: '6px'
                }}>
                  Claim Number (optional)
                </label>
                <input
                  type="text"
                  value={formData.claimNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, claimNumber: e.target.value }))}
                  placeholder="Will be assigned after filing"
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

          {/* Authorization Text */}
          <div style={{
            background: '#FEF3C7',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
            border: '1px solid #FCD34D'
          }}>
            <p style={{
              fontSize: '14px',
              color: '#92400E',
              margin: 0,
              lineHeight: '1.6'
            }}>
              I, <strong>{formData.customerName || '[Customer Name]'}</strong>, authorize The Roof Docs LLC
              t/d/b/a ROOF-ER to communicate directly with my insurance company regarding my recent
              home insurance claim. I authorize ROOF-ER to contact my insurance company on my behalf
              in order to discuss/resolve/finalize the scope of repairs, differences in estimating methods,
              and/or any additional inspections, as required.
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
              margin: '0 0 20px 0'
            }}>
              Customer Signature
            </h3>

            <SignaturePad
              width={500}
              height={150}
              lineColor="#1f2937"
              backgroundColor="#ffffff"
              onSignatureChange={handleSignatureChange}
              label="Sign to authorize"
              required={true}
            />

            <p style={{
              fontSize: '12px',
              color: '#9CA3AF',
              marginTop: '12px',
              textAlign: 'center'
            }}>
              Date: {new Date().toLocaleDateString()}
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            gap: '16px',
            justifyContent: 'center'
          }}>
            {onSkip && (
              <button
                onClick={onSkip}
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
                Skip for Now
              </button>
            )}

            <button
              onClick={handleSubmit}
              disabled={!isValid}
              style={{
                padding: '14px 40px',
                borderRadius: '12px',
                border: 'none',
                background: isValid
                  ? 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)'
                  : '#E5E7EB',
                color: isValid ? 'white' : '#9CA3AF',
                fontSize: '16px',
                fontWeight: '600',
                cursor: isValid ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: isValid ? '0 8px 24px -8px rgba(220, 38, 38, 0.5)' : 'none'
              }}
            >
              {isValid ? <CheckCircle2 size={20} /> : null}
              Sign & Continue
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClaimAuthorizationSlide;
