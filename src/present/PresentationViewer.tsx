/**
 * Public Presentation Viewer
 * View-only presentation page accessible without login at /present/:token
 */

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, MessageCircle, Home, Phone, Mail } from 'lucide-react';

const API_BASE = '';

// Types
interface PresentationSlide {
  id: string;
  slide_number: number;
  slide_type: 'cover' | 'photo' | 'analysis' | 'summary' | 'recommendations' | 'contact';
  title: string;
  content: string;
  photo_id?: string;
  photo_url?: string;
  ai_insights?: {
    damageDetected?: boolean;
    damageType?: string[];
    severity?: string;
    affectedArea?: string;
    estimatedSize?: string;
    claimViability?: string;
    policyLanguage?: string;
    insuranceArguments?: string[];
    recommendations?: string[];
    followUpQuestions?: string[];
    urgency?: string;
    confidence?: number;
    detailedAnalysis?: string;
  };
  layout: 'full-image' | 'split' | 'grid' | 'text-only';
}

interface Presentation {
  id: string;
  inspection_id: string;
  user_id: string;
  title: string;
  customer_name: string;
  property_address: string;
  presentation_type: 'standard' | 'insurance' | 'detailed';
  slides: PresentationSlide[];
  branding?: {
    logo_url?: string;
    company_name?: string;
    contact_info?: string;
  };
  share_token?: string;
  is_public: boolean;
  view_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

const PresentationViewer: React.FC = () => {
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showSusanChat, setShowSusanChat] = useState(false);

  // Extract token from URL
  const token = window.location.pathname.split('/present/')[1]?.split('/')[0] || '';

  useEffect(() => {
    if (!token) {
      setError('Invalid presentation link');
      setLoading(false);
      return;
    }
    fetchPresentation();
  }, [token]);

  const fetchPresentation = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/present/${token}`);
      const data = await response.json();

      if (response.ok && data.presentation) {
        setPresentation(data.presentation);

        // Track viewer session
        trackViewerSession();
      } else {
        setError(data.error || 'Presentation not found or no longer available');
      }
    } catch (err) {
      console.error('Failed to load presentation:', err);
      setError('Failed to load presentation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const trackViewerSession = async () => {
    try {
      // Track analytics for viewer session
      await fetch(`${API_BASE}/api/present/${token}/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          referrer: document.referrer || 'direct',
          userAgent: navigator.userAgent,
        })
      });
    } catch (err) {
      // Silent fail - analytics shouldn't block presentation
      console.debug('Analytics tracking failed:', err);
    }
  };

  const nextSlide = () => {
    if (presentation && currentSlide < presentation.slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextSlide();
      if (e.key === 'ArrowLeft') prevSlide();
      if (e.key === 'Escape' && showSusanChat) setShowSusanChat(false);
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentSlide, presentation, showSusanChat]);

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-brand-red mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading presentation...</p>
        </div>
      </div>
    );
  }

  // Error State
  if (error || !presentation) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
            <X className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Presentation Not Found</h1>
          <p className="text-gray-400 mb-6">
            {error || 'The presentation you\'re looking for doesn\'t exist or is no longer available.'}
          </p>
          <a
            href="https://theroofdocs.com"
            className="inline-flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            <Home className="w-5 h-5" />
            Visit The Roof Docs
          </a>
        </div>
      </div>
    );
  }

  const slide = presentation.slides[currentSlide];
  const companyName = presentation.branding?.company_name || 'The Roof Docs';
  const contactInfo = presentation.branding?.contact_info || '';

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-neutral-800 border-b border-neutral-700 px-4 md:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            {presentation.branding?.logo_url ? (
              <img
                src={presentation.branding.logo_url}
                alt={companyName}
                className="h-10 w-auto"
              />
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded bg-brand-red flex items-center justify-center">
                  <span className="text-white font-bold text-lg">RD</span>
                </div>
                <span className="text-white font-bold text-lg hidden sm:inline">{companyName}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400 hidden sm:inline">
              Slide {currentSlide + 1} of {presentation.slides.length}
            </span>
            <button
              onClick={() => setShowSusanChat(true)}
              className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Ask Susan AI</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Presentation Area */}
      <main className="flex-1 flex flex-col">
        {/* Slide Content */}
        <div className="flex-1 flex items-center justify-center px-4 py-6 md:py-8">
          <div className="w-full max-w-6xl">
            <SlideRenderer slide={slide} companyName={companyName} />
          </div>
        </div>

        {/* Navigation Controls */}
        <div className="bg-neutral-800 border-t border-neutral-700 px-4 py-4">
          <div className="max-w-7xl mx-auto">
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center justify-between">
              <button
                onClick={prevSlide}
                disabled={currentSlide === 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentSlide === 0
                    ? 'bg-neutral-700 text-gray-500 cursor-not-allowed'
                    : 'bg-neutral-700 hover:bg-neutral-600 text-white'
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
                Previous
              </button>

              {/* Slide Indicators */}
              <div className="flex items-center gap-2">
                {presentation.slides.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToSlide(index)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      index === currentSlide
                        ? 'bg-brand-red w-8'
                        : 'bg-neutral-600 hover:bg-neutral-500'
                    }`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>

              <button
                onClick={nextSlide}
                disabled={currentSlide === presentation.slides.length - 1}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentSlide === presentation.slides.length - 1
                    ? 'bg-neutral-700 text-gray-500 cursor-not-allowed'
                    : 'bg-neutral-700 hover:bg-neutral-600 text-white'
                }`}
              >
                Next
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Navigation */}
            <div className="flex md:hidden flex-col gap-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={prevSlide}
                  disabled={currentSlide === 0}
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentSlide === 0
                      ? 'bg-neutral-700 text-gray-500 cursor-not-allowed'
                      : 'bg-neutral-700 hover:bg-neutral-600 text-white'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Prev
                </button>

                <span className="text-sm text-gray-400">
                  {currentSlide + 1} / {presentation.slides.length}
                </span>

                <button
                  onClick={nextSlide}
                  disabled={currentSlide === presentation.slides.length - 1}
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentSlide === presentation.slides.length - 1
                      ? 'bg-neutral-700 text-gray-500 cursor-not-allowed'
                      : 'bg-neutral-700 hover:bg-neutral-600 text-white'
                  }`}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Mobile Slide Indicators */}
              <div className="flex items-center justify-center gap-1.5">
                {presentation.slides.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToSlide(index)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      index === currentSlide
                        ? 'bg-brand-red w-6'
                        : 'bg-neutral-600'
                    }`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-neutral-950 border-t border-neutral-800 px-4 py-6">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-lg font-bold text-white mb-2">{companyName}</p>
          {contactInfo && (
            <p className="text-sm text-gray-400 mb-3">{contactInfo}</p>
          )}
          <p className="text-xs text-gray-500">
            Powered by ROOFER S21 Field AI | © {new Date().getFullYear()} All rights reserved
          </p>
        </div>
      </footer>

      {/* Susan AI Chat Modal */}
      {showSusanChat && (
        <SusanChatWidget
          onClose={() => setShowSusanChat(false)}
          presentationTitle={presentation.title}
          customerName={presentation.customer_name}
        />
      )}
    </div>
  );
};

// Slide Renderer Component
const SlideRenderer: React.FC<{ slide: PresentationSlide; companyName: string }> = ({ slide, companyName }) => {
  if (slide.layout === 'text-only') {
    return (
      <div className="bg-neutral-800 rounded-xl p-8 md:p-12 min-h-[400px] flex flex-col justify-center">
        <h1 className="text-3xl md:text-5xl font-bold text-white mb-6 text-center">
          {slide.title}
        </h1>
        <div className="text-gray-300 text-lg md:text-xl whitespace-pre-wrap text-center max-w-3xl mx-auto">
          {slide.content}
        </div>

        {slide.slide_type === 'recommendations' && slide.ai_insights?.recommendations && (
          <div className="mt-8 space-y-3">
            {slide.ai_insights.recommendations.map((rec, idx) => (
              <div key={idx} className="flex items-start gap-3 bg-neutral-700/50 rounded-lg p-4">
                <div className="w-6 h-6 rounded-full bg-brand-red flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-sm font-bold">{idx + 1}</span>
                </div>
                <p className="text-gray-300">{rec}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (slide.layout === 'split' && slide.photo_url) {
    return (
      <div className="bg-neutral-800 rounded-xl overflow-hidden">
        <div className="grid md:grid-cols-2 gap-0">
          {/* Photo Side */}
          <div className="relative bg-black aspect-video md:aspect-auto">
            <img
              src={slide.photo_url}
              alt={slide.title}
              className="w-full h-full object-contain"
            />
          </div>

          {/* Analysis Side */}
          <div className="p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
              {slide.title}
            </h2>

            {slide.content && (
              <p className="text-gray-300 mb-6 whitespace-pre-wrap">
                {slide.content}
              </p>
            )}

            {slide.ai_insights && slide.ai_insights.damageDetected && (
              <div className="space-y-4">
                {/* Severity Badge */}
                {slide.ai_insights.severity && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">Severity:</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      slide.ai_insights.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                      slide.ai_insights.severity === 'severe' ? 'bg-orange-500/20 text-orange-400' :
                      slide.ai_insights.severity === 'moderate' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {slide.ai_insights.severity.charAt(0).toUpperCase() + slide.ai_insights.severity.slice(1)}
                    </span>
                  </div>
                )}

                {/* Damage Type */}
                {slide.ai_insights.damageType && slide.ai_insights.damageType.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2">Damage Type:</p>
                    <div className="flex flex-wrap gap-2">
                      {slide.ai_insights.damageType.map((type, idx) => (
                        <span key={idx} className="px-3 py-1 bg-neutral-700 rounded-full text-sm text-white">
                          {type}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Affected Area */}
                {slide.ai_insights.affectedArea && (
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Affected Area:</p>
                    <p className="text-white">{slide.ai_insights.affectedArea}</p>
                  </div>
                )}

                {/* Insurance Arguments */}
                {slide.ai_insights.insuranceArguments && slide.ai_insights.insuranceArguments.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2">Key Points:</p>
                    <ul className="space-y-2">
                      {slide.ai_insights.insuranceArguments.slice(0, 3).map((arg, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className="text-brand-red mt-1">•</span>
                          <span>{arg}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default text-only fallback
  return (
    <div className="bg-neutral-800 rounded-xl p-8 md:p-12">
      <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">{slide.title}</h2>
      <p className="text-gray-300 whitespace-pre-wrap">{slide.content}</p>
    </div>
  );
};

// Susan AI Chat Widget Component
const SusanChatWidget: React.FC<{
  onClose: () => void;
  presentationTitle: string;
  customerName: string;
}> = ({ onClose, presentationTitle, customerName }) => {
  const [message, setMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    {
      role: 'assistant',
      content: `Hi! I'm Susan, your roofing AI assistant. I'm here to answer any questions about ${customerName}'s roof inspection. What would you like to know?`
    }
  ]);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!message.trim() || loading) return;

    const userMessage = message.trim();
    setMessage('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      // Simulate AI response (replace with actual API call)
      setTimeout(() => {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: 'I\'m here to help answer questions about this roof inspection. For detailed assistance, please contact your roofing professional directly using the contact information provided.'
        }]);
        setLoading(false);
      }, 1000);
    } catch (err) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I apologize, but I\'m having trouble responding right now. Please contact your roofing professional directly for assistance.'
      }]);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-neutral-800 w-full md:max-w-lg md:rounded-xl flex flex-col h-full md:h-[600px] max-h-screen">
        {/* Header */}
        <div className="bg-brand-red px-4 py-4 flex items-center justify-between md:rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-brand-red" />
            </div>
            <div>
              <h3 className="font-bold text-white">Susan AI</h3>
              <p className="text-xs text-white/80">Roofing Assistant</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatMessages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  msg.role === 'user'
                    ? 'bg-brand-red text-white'
                    : 'bg-neutral-700 text-gray-100'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-neutral-700 rounded-lg px-4 py-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-neutral-700 p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask about this inspection..."
              className="flex-1 bg-neutral-700 border border-neutral-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-brand-red"
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={loading || !message.trim()}
              className="bg-brand-red hover:bg-red-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors font-medium"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresentationViewer;
