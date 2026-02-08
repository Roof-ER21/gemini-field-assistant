/**
 * RepLandingSlide - Rep Landing Page as First Presentation Slide
 * Features rep photo, credentials, QR code, and personalized homeowner greeting
 * Based on ROOF-ER brand styling
 */

import React, { useEffect, useState } from 'react';
import { User, Phone, Mail, Shield, Award, CheckCircle2 } from 'lucide-react';

interface RepProfile {
  name: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  credentials?: string[];
  slug?: string;
  startYear?: number;
}

interface RepLandingSlideProps {
  repProfile: RepProfile;
  homeownerName?: string;
  propertyAddress?: string;
  companyLogo?: string;
}

export const RepLandingSlide: React.FC<RepLandingSlideProps> = ({
  repProfile,
  homeownerName,
  propertyAddress,
  companyLogo
}) => {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  // Generate QR code URL
  useEffect(() => {
    if (repProfile.slug) {
      const profileUrl = `${window.location.origin}/profile/${repProfile.slug}`;
      // Using QR Server API for generation
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&color=c41e3a&bgcolor=ffffff&data=${encodeURIComponent(profileUrl)}`;
      setQrCodeUrl(qrApiUrl);
    }
  }, [repProfile.slug]);

  const yearsExperience = repProfile.startYear
    ? new Date().getFullYear() - repProfile.startYear
    : null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: '60px',
      background: 'linear-gradient(180deg, #ffffff 0%, #f5f5f5 100%)'
    }}>
      {/* Company Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '48px'
      }}>
        {companyLogo ? (
          <img
            src={companyLogo}
            alt="Company Logo"
            style={{ height: '60px', objectFit: 'contain' }}
          />
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #c41e3a 0%, #a01830 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Shield size={32} color="white" />
            </div>
            <div>
              <span style={{
                fontSize: '28px',
                fontWeight: '800',
                color: '#c41e3a',
                letterSpacing: '-0.02em'
              }}>
                ROOF-ER
              </span>
              <p style={{
                fontSize: '14px',
                color: '#6B7280',
                margin: '2px 0 0 0'
              }}>
                {repProfile.company || 'Professional Roofing Solutions'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Container */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '60px',
        maxWidth: '1000px'
      }}>
        {/* Rep Photo & Info */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          {/* Photo */}
          <div style={{
            width: '180px',
            height: '180px',
            borderRadius: '50%',
            background: repProfile.photoUrl
              ? `url(${repProfile.photoUrl}) center/cover`
              : 'linear-gradient(135deg, #c41e3a 0%, #a01830 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 20px 60px -20px rgba(196, 30, 58, 0.4)',
            border: '5px solid white',
            marginBottom: '24px'
          }}>
            {!repProfile.photoUrl && <User size={80} color="white" />}
          </div>

          {/* Name & Title */}
          <h2 style={{
            fontSize: '36px',
            fontWeight: '800',
            color: '#1f2937',
            margin: 0,
            textAlign: 'center'
          }}>
            {repProfile.name}
          </h2>

          {repProfile.title && (
            <p style={{
              fontSize: '18px',
              fontWeight: '500',
              color: '#c41e3a',
              margin: '8px 0 0 0',
              textAlign: 'center'
            }}>
              {repProfile.title}
            </p>
          )}

          {/* Experience Badge */}
          {yearsExperience !== null && yearsExperience > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '16px',
              padding: '8px 16px',
              background: '#f0f0f0',
              borderRadius: '20px'
            }}>
              <Award size={16} color="#4b5563" />
              <span style={{ fontSize: '14px', color: '#4b5563', fontWeight: '500' }}>
                {yearsExperience}+ Years Experience
              </span>
            </div>
          )}

          {/* Credentials */}
          {repProfile.credentials && repProfile.credentials.length > 0 && (
            <div style={{
              display: 'flex',
              gap: '8px',
              marginTop: '20px',
              flexWrap: 'wrap',
              justifyContent: 'center',
              maxWidth: '300px'
            }}>
              {repProfile.credentials.map((cred, i) => (
                <span key={i} style={{
                  padding: '6px 12px',
                  borderRadius: '16px',
                  background: '#dcfce7',
                  color: '#166534',
                  fontSize: '12px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <CheckCircle2 size={12} />
                  {cred}
                </span>
              ))}
            </div>
          )}

          {/* Contact Info */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            marginTop: '24px',
            alignItems: 'center'
          }}>
            {repProfile.phone && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 20px',
                background: 'white',
                borderRadius: '10px',
                border: '1px solid #e5e7eb'
              }}>
                <Phone size={18} color="#c41e3a" />
                <span style={{ fontSize: '16px', color: '#1f2937', fontWeight: '500' }}>
                  {repProfile.phone}
                </span>
              </div>
            )}
            {repProfile.email && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 20px',
                background: 'white',
                borderRadius: '10px',
                border: '1px solid #e5e7eb'
              }}>
                <Mail size={18} color="#c41e3a" />
                <span style={{ fontSize: '15px', color: '#1f2937', fontWeight: '500' }}>
                  {repProfile.email}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side - QR Code & Message */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px'
        }}>
          {/* Personalized Message */}
          <div style={{
            textAlign: 'center',
            maxWidth: '400px'
          }}>
            <h3 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#1f2937',
              margin: 0,
              lineHeight: '1.3'
            }}>
              {homeownerName ? (
                <>
                  Thank you, <span style={{ color: '#c41e3a' }}>{homeownerName}</span>,
                  <br />for trusting us with your home
                </>
              ) : (
                'Your Roof is in Good Hands'
              )}
            </h3>

            {propertyAddress && (
              <p style={{
                fontSize: '16px',
                color: '#6B7280',
                margin: '16px 0 0 0'
              }}>
                {propertyAddress}
              </p>
            )}
          </div>

          {/* QR Code Box */}
          {qrCodeUrl && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '24px',
              background: 'white',
              borderRadius: '20px',
              border: '2px solid #e5e7eb',
              boxShadow: '0 10px 40px -10px rgba(0,0,0,0.1)'
            }}>
              <img
                src={qrCodeUrl}
                alt="Profile QR Code"
                style={{
                  width: '150px',
                  height: '150px',
                  borderRadius: '8px'
                }}
              />
              <p style={{
                fontSize: '14px',
                color: '#6B7280',
                margin: '16px 0 0 0',
                textAlign: 'center'
              }}>
                Scan to save my contact
              </p>
            </div>
          )}

          {/* Today's Date */}
          <p style={{
            fontSize: '16px',
            color: '#9CA3AF',
            margin: 0
          }}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </p>
        </div>
      </div>
    </div>
  );
};

export default RepLandingSlide;
