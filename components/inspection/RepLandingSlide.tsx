/**
 * RepLandingSlide - Professional Rep Landing Page as First Presentation Slide
 * Matches the MyProfilePanel/ProfilePage design aesthetic
 * Features rep photo prominently, QR code, credentials, and personalized homeowner greeting
 * Uses ROOF-ER brand colors: #c41e3a (red), dark theme with white accents
 */

import React, { useEffect, useState } from 'react';
import { User, Phone, Mail, Shield, Award, CheckCircle2, QrCode } from 'lucide-react';

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
      // Using QR Server API for generation - 200x200 for better visibility
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(profileUrl)}`;
      setQrCodeUrl(qrApiUrl);
    }
  }, [repProfile.slug]);

  const yearsExperience = repProfile.startYear
    ? new Date().getFullYear() - repProfile.startYear
    : null;

  // Generate initials if no photo
  const initials = repProfile.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'linear-gradient(180deg, #0a0a0a 0%, #171717 50%, #0a0a0a 100%)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Subtle gradient overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(circle at 50% 50%, rgba(220, 38, 38, 0.1) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      {/* Company Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 0 0 0',
        position: 'relative',
        zIndex: 10
      }}>
        {companyLogo ? (
          <img
            src={companyLogo}
            alt="Company Logo"
            style={{ height: '50px', objectFit: 'contain' }}
          />
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{
              width: '50px',
              height: '50px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 32px -8px rgba(220, 38, 38, 0.6)'
            }}>
              <Shield size={28} color="white" />
            </div>
            <div>
              <div style={{
                fontSize: '24px',
                fontWeight: '800',
                color: '#dc2626',
                letterSpacing: '-0.02em',
                textShadow: '0 0 20px rgba(220, 38, 38, 0.3)'
              }}>
                {repProfile.company || 'ROOF-ER'}
              </div>
              <div style={{
                fontSize: '11px',
                color: '#a1a1aa',
                marginTop: '2px',
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
              }}>
                Professional Roofing Solutions
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '80px',
        padding: '40px 60px',
        position: 'relative',
        zIndex: 10
      }}>
        {/* Left Side - Rep Profile */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: '450px'
        }}>
          {/* Personalized Greeting */}
          {homeownerName && (
            <div style={{
              textAlign: 'center',
              marginBottom: '32px',
              padding: '20px 32px',
              background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.1) 0%, rgba(220, 38, 38, 0.05) 100%)',
              borderRadius: '16px',
              border: '1px solid rgba(220, 38, 38, 0.2)'
            }}>
              <h3 style={{
                fontSize: '28px',
                fontWeight: '700',
                color: '#ffffff',
                margin: '0 0 8px 0',
                lineHeight: '1.3'
              }}>
                Welcome, <span style={{ color: '#dc2626' }}>{homeownerName}</span>
              </h3>
              {propertyAddress && (
                <p style={{
                  fontSize: '14px',
                  color: '#a1a1aa',
                  margin: 0
                }}>
                  {propertyAddress}
                </p>
              )}
            </div>
          )}

          {/* Profile Photo - Large and Prominent */}
          <div style={{
            width: '240px',
            height: '240px',
            borderRadius: '50%',
            background: repProfile.photoUrl
              ? '#262626'
              : 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 20px 60px -20px rgba(220, 38, 38, 0.6)',
            border: '4px solid rgba(220, 38, 38, 0.3)',
            marginBottom: '28px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {repProfile.photoUrl ? (
              <img
                src={repProfile.photoUrl}
                alt={repProfile.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
            ) : (
              <span style={{
                fontSize: '80px',
                fontWeight: '700',
                color: 'white',
                textShadow: '0 4px 12px rgba(0,0,0,0.3)'
              }}>
                {initials}
              </span>
            )}
          </div>

          {/* Name & Title */}
          <h2 style={{
            fontSize: '42px',
            fontWeight: '800',
            color: '#ffffff',
            margin: '0 0 8px 0',
            textAlign: 'center',
            textShadow: '0 2px 12px rgba(0,0,0,0.4)'
          }}>
            {repProfile.name}
          </h2>

          {repProfile.title && (
            <p style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#dc2626',
              margin: '0 0 20px 0',
              textAlign: 'center'
            }}>
              {repProfile.title}
            </p>
          )}

          {/* Experience Badge */}
          {yearsExperience !== null && yearsExperience > 0 && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: 'rgba(220, 38, 38, 0.2)',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              borderRadius: '24px',
              marginBottom: '24px'
            }}>
              <Award size={18} color="#dc2626" />
              <span style={{
                fontSize: '15px',
                color: '#dc2626',
                fontWeight: '600'
              }}>
                {yearsExperience}+ Years of Experience
              </span>
            </div>
          )}

          {/* Credentials */}
          {repProfile.credentials && repProfile.credentials.length > 0 && (
            <div style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
              justifyContent: 'center',
              maxWidth: '400px',
              marginBottom: '24px'
            }}>
              {repProfile.credentials.map((cred, i) => (
                <span key={i} style={{
                  padding: '8px 14px',
                  borderRadius: '20px',
                  background: '#171717',
                  border: '1px solid #262626',
                  color: '#4ade80',
                  fontSize: '13px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <CheckCircle2 size={14} />
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
            width: '100%',
            maxWidth: '380px'
          }}>
            {repProfile.phone && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 20px',
                background: '#171717',
                border: '1px solid #262626',
                borderRadius: '12px'
              }}>
                <Phone size={20} color="#dc2626" />
                <span style={{
                  fontSize: '17px',
                  color: '#ffffff',
                  fontWeight: '500'
                }}>
                  {repProfile.phone}
                </span>
              </div>
            )}
            {repProfile.email && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 20px',
                background: '#171717',
                border: '1px solid #262626',
                borderRadius: '12px'
              }}>
                <Mail size={20} color="#dc2626" />
                <span style={{
                  fontSize: '16px',
                  color: '#ffffff',
                  fontWeight: '500',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {repProfile.email}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side - QR Code & Call to Action */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '28px'
        }}>
          {/* Default message if no homeowner name */}
          {!homeownerName && (
            <div style={{
              textAlign: 'center',
              maxWidth: '380px',
              marginBottom: '12px'
            }}>
              <h3 style={{
                fontSize: '32px',
                fontWeight: '700',
                color: '#ffffff',
                margin: '0 0 12px 0',
                lineHeight: '1.3'
              }}>
                Your Roof Inspection<br />Starts Here
              </h3>
              <p style={{
                fontSize: '16px',
                color: '#a1a1aa',
                margin: 0
              }}>
                Professional assessment and personalized recommendations
              </p>
            </div>
          )}

          {/* QR Code Card - Matching MyProfilePanel design */}
          {qrCodeUrl && repProfile.slug && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '32px',
              background: '#0a0a0a',
              borderRadius: '20px',
              border: '1px solid #262626',
              boxShadow: '0 20px 60px -20px rgba(0,0,0,0.8)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '20px'
              }}>
                <QrCode size={20} color="#dc2626" />
                <h4 style={{
                  margin: 0,
                  color: '#ffffff',
                  fontSize: '18px',
                  fontWeight: '600'
                }}>
                  Save My Contact
                </h4>
              </div>

              <div style={{
                background: '#ffffff',
                padding: '16px',
                borderRadius: '12px',
                marginBottom: '16px'
              }}>
                <img
                  src={qrCodeUrl}
                  alt="Profile QR Code"
                  style={{
                    width: '180px',
                    height: '180px',
                    display: 'block'
                  }}
                />
              </div>

              <div style={{
                fontSize: '13px',
                color: '#a1a1aa',
                textAlign: 'center',
                marginBottom: '4px',
                fontFamily: 'monospace',
                background: '#171717',
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #262626'
              }}>
                /profile/{repProfile.slug}
              </div>

              <p style={{
                fontSize: '14px',
                color: '#71717a',
                margin: '12px 0 0 0',
                textAlign: 'center',
                maxWidth: '240px'
              }}>
                Scan with your phone camera to view my full profile and save my contact info
              </p>
            </div>
          )}

          {/* Today's Date */}
          <div style={{
            fontSize: '15px',
            color: '#52525b',
            textAlign: 'center',
            fontWeight: '500'
          }}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RepLandingSlide;
