import React from 'react';
import {
  MessageSquare,
  BookOpen,
  Image,
  Mic,
  Mail,
  Building2,
  Radio,
  Target,
  FileText,
  DollarSign,
  ArrowRight,
  Zap,
  CheckCircle,
  TrendingUp
} from 'lucide-react';

type PanelType = 'chat' | 'image' | 'transcribe' | 'email' | 'maps' | 'live' | 'knowledge';

interface HomePageProps {
  setActivePanel: (panel: PanelType) => void;
}

const HomePage: React.FC<HomePageProps> = ({ setActivePanel }) => {
  const quickActions = [
    {
      id: 'chat',
      title: 'Start Chat',
      description: 'Get instant AI assistance',
      icon: MessageSquare,
      color: '#ef4444',
      gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
    },
    {
      id: 'image',
      title: 'Upload & Analyze',
      description: 'Docs, approvals, denials, photos',
      icon: Image,
      color: '#f59e0b',
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
    },
    {
      id: 'email',
      title: 'Generate Email',
      description: 'Professional communication',
      icon: Mail,
      color: '#3b82f6',
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
    },
    {
      id: 'maps',
      title: 'Insurance Directory',
      description: 'Find insurance contacts',
      icon: Building2,
      color: '#8b5cf6',
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
    }
  ];

  const features = [
    {
      id: 'chat',
      title: 'AI Chat Assistant',
      description: 'Get expert answers on roofing, insurance claims, and GAF products',
      icon: MessageSquare,
      stats: '4 AI Systems'
    },
    {
      id: 'knowledge',
      title: 'Knowledge Base',
      description: 'Access 130+ documents including GAF specs and insurance guides',
      icon: BookOpen,
      stats: '130 Documents'
    },
    {
      id: 'image',
      title: 'Upload Analysis',
      description: 'Upload approvals/denials/partials & photos for guidance',
      icon: Image,
      stats: 'Docs + Photos'
    },
    {
      id: 'transcribe',
      title: 'Voice Transcription',
      description: 'Convert voice notes to text for easy documentation',
      icon: Mic,
      stats: 'Real-time'
    },
    {
      id: 'email',
      title: 'Email Generator',
      description: 'Professional emails for customers and insurance companies',
      icon: Mail,
      stats: 'Templates Ready'
    },
    {
      id: 'maps',
      title: 'Insurance Companies',
      description: 'Directory of 50+ insurance contacts with login portals',
      icon: Building2,
      stats: '50+ Companies'
    }
  ];

  const stats = [
    { label: 'AI Systems', value: '4', icon: Zap },
    { label: 'Documents', value: '130', icon: BookOpen },
    { label: 'Insurance Cos', value: '50+', icon: Building2 },
    { label: 'Ready', value: '100%', icon: CheckCircle }
  ];

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-primary)',
      padding: '0'
    }}>
      {/* Hero Section */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
        padding: '2rem 1.5rem',
        textAlign: 'center'
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'rgba(239, 68, 68, 0.1)',
          padding: '0.5rem 1rem',
          borderRadius: '50px',
          marginBottom: '1rem',
          border: '1px solid rgba(239, 68, 68, 0.3)'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#10b981',
            boxShadow: '0 0 8px #10b981',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
          }} />
          <span style={{
            fontSize: '0.875rem',
            color: 'rgba(255, 255, 255, 0.9)',
            fontWeight: '500'
          }}>
            4 AI Systems Active
          </span>
        </div>

        <h1 style={{
          fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
          fontWeight: '700',
          color: '#fff',
          marginBottom: '0.5rem',
          lineHeight: '1.2'
        }}>
          Welcome to <span style={{ color: '#ef4444' }}>S21</span> Field AI
        </h1>

        <p style={{
          fontSize: 'clamp(1rem, 3vw, 1.125rem)',
          color: 'rgba(255, 255, 255, 0.7)',
          maxWidth: '600px',
          margin: '0 auto 2rem',
          lineHeight: '1.6'
        }}>
          Your AI-powered roofing assistant. Get instant answers, analyze damage, generate emails, and access insurance contacts.
        </p>

        {/* Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '1rem',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div key={index} style={{
                background: 'rgba(255, 255, 255, 0.05)',
                backdropFilter: 'blur(10px)',
                padding: '1rem',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                textAlign: 'center'
              }}>
                <Icon style={{
                  width: '1.5rem',
                  height: '1.5rem',
                  color: '#ef4444',
                  margin: '0 auto 0.5rem'
                }} />
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: '700',
                  color: '#fff',
                  marginBottom: '0.25rem'
                }}>
                  {stat.value}
                </div>
                <div style={{
                  fontSize: '0.75rem',
                  color: 'rgba(255, 255, 255, 0.6)'
                }}>
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '1.5rem' }}>
        {/* Quick Actions */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{
            fontSize: 'clamp(1.25rem, 4vw, 1.5rem)',
            fontWeight: '600',
            color: '#fff',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <Zap style={{ width: '1.25rem', height: '1.25rem', color: '#ef4444' }} />
            Quick Actions
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1rem'
          }}>
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => setActivePanel(action.id as PanelType)}
                  style={{
                    background: action.gradient,
                    border: 'none',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(239, 68, 68, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '1rem'
                  }}>
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.2)',
                      backdropFilter: 'blur(10px)',
                      padding: '0.75rem',
                      borderRadius: '12px',
                      flexShrink: 0
                    }}>
                      <Icon style={{
                        width: '1.5rem',
                        height: '1.5rem',
                        color: '#fff'
                      }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '1.125rem',
                        fontWeight: '600',
                        color: '#fff',
                        marginBottom: '0.25rem'
                      }}>
                        {action.title}
                      </div>
                      <div style={{
                        fontSize: '0.875rem',
                        color: 'rgba(255, 255, 255, 0.9)',
                        lineHeight: '1.4'
                      }}>
                        {action.description}
                      </div>
                    </div>
                    <ArrowRight style={{
                      width: '1.25rem',
                      height: '1.25rem',
                      color: 'rgba(255, 255, 255, 0.8)',
                      flexShrink: 0,
                      marginTop: '0.25rem'
                    }} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* All Features */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{
            fontSize: 'clamp(1.25rem, 4vw, 1.5rem)',
            fontWeight: '600',
            color: '#fff',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <TrendingUp style={{ width: '1.25rem', height: '1.25rem', color: '#ef4444' }} />
            All Features
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1rem'
          }}>
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.id}
                  onClick={() => setActivePanel(feature.id as PanelType)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '1rem',
                    marginBottom: '0.75rem'
                  }}>
                    <div style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      padding: '0.625rem',
                      borderRadius: '10px',
                      border: '1px solid rgba(239, 68, 68, 0.2)'
                    }}>
                      <Icon style={{
                        width: '1.25rem',
                        height: '1.25rem',
                        color: '#ef4444'
                      }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '1rem',
                        fontWeight: '600',
                        color: '#fff',
                        marginBottom: '0.25rem'
                      }}>
                        {feature.title}
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#10b981',
                        fontWeight: '500'
                      }}>
                        {feature.stats}
                      </div>
                    </div>
                  </div>
                  <p style={{
                    fontSize: '0.875rem',
                    color: 'rgba(255, 255, 255, 0.6)',
                    lineHeight: '1.5',
                    margin: 0
                  }}>
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Quick Reference */}
        <section>
          <h2 style={{
            fontSize: 'clamp(1.25rem, 4vw, 1.5rem)',
            fontWeight: '600',
            color: '#fff',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <Target style={{ width: '1.25rem', height: '1.25rem', color: '#ef4444' }} />
            Quick Reference
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1rem'
          }}>
            {[
              {
                title: 'Handle Objection',
                description: 'Get response scripts for common customer objections',
                icon: Target
              },
              {
                title: 'Document Job',
                description: 'Create professional job reports with photos and details',
                icon: FileText
              },
              {
                title: 'Price Quote',
                description: 'Generate accurate estimates with material and labor costs',
                icon: DollarSign
              }
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <div
                  key={index}
                  style={{
                    background: 'rgba(239, 68, 68, 0.05)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginBottom: '0.5rem'
                  }}>
                    <Icon style={{
                      width: '1.125rem',
                      height: '1.125rem',
                      color: '#ef4444'
                    }} />
                    <div style={{
                      fontSize: '1rem',
                      fontWeight: '600',
                      color: '#fff'
                    }}>
                      {item.title}
                    </div>
                  </div>
                  <p style={{
                    fontSize: '0.875rem',
                    color: 'rgba(255, 255, 255, 0.6)',
                    lineHeight: '1.5',
                    margin: 0
                  }}>
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Mobile Tip */}
        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '12px',
          textAlign: 'center'
        }}>
          <p style={{
            fontSize: '0.875rem',
            color: 'rgba(255, 255, 255, 0.8)',
            margin: 0,
            lineHeight: '1.5'
          }}>
            💡 <strong>Tip:</strong> Tap the menu icon (☰) in the top-left to access all features on mobile
          </p>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        @media (max-width: 768px) {
          section {
            margin-bottom: 1.5rem !important;
          }
        }
      `}</style>
    </div>
  );
};

export default HomePage;
