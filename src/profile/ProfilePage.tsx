/**
 * Public Profile Landing Page
 * Matches the mypage21 design exactly
 */

import React, { useState, useEffect } from 'react';

interface EmployeeProfile {
  id: string;
  name: string;
  title: string | null;
  role_type: string;
  email: string | null;
  phone_number: string | null;
  bio: string | null;
  image_url: string | null;
  slug: string;
  start_year: number | null;
  is_active: boolean;
}

const API_BASE = '';

// Services data
const SERVICES = [
  { name: 'Roofing', description: 'Complete roof replacement and repairs' },
  { name: 'Siding', description: 'Vinyl, wood, and fiber cement siding' },
  { name: 'Gutters', description: 'Seamless gutter installation and repair' },
  { name: 'Windows & Doors', description: 'Energy-efficient windows and door installation' },
  { name: 'Solar', description: 'Solar panel installation and energy solutions' },
];

const SERVICE_OPTIONS = [
  { value: 'roof_inspection', label: 'Roof Inspection' },
  { value: 'roof_repair', label: 'Roof Repair' },
  { value: 'roof_replacement', label: 'Roof Replacement' },
  { value: 'storm_damage', label: 'Storm Damage' },
  { value: 'siding', label: 'Siding' },
  { value: 'gutters', label: 'Gutters' },
  { value: 'windows_doors', label: 'Windows & Doors' },
  { value: 'solar', label: 'Solar' },
  { value: 'other', label: 'Other' },
];

const calculateYearsExperience = (startYear: number | null): number | null => {
  if (!startYear) return null;
  const currentYear = new Date().getFullYear();
  const years = currentYear - startYear;
  return years > 0 ? years : null;
};

const getDisplayRole = (profile: EmployeeProfile): string => {
  if (profile.title) return profile.title;
  const roleLabels: Record<string, string> = {
    'admin': 'Administrator',
    'sales_rep': 'Sales',
    'sales_manager': 'Sales Manager',
    'team_lead': 'Team Lead',
    'field_trainer': 'Field Trainer',
    'manager': 'Manager',
  };
  return roleLabels[profile.role_type] || 'Team Member';
};

const ProfilePage: React.FC = () => {
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    service: '',
    message: '',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const slug = window.location.pathname.split('/profile/')[1]?.split('/')[0] || '';

  useEffect(() => {
    if (!slug) {
      setError('Profile not found');
      setLoading(false);
      return;
    }
    fetchProfile();
    trackScan();
  }, [slug]);

  const fetchProfile = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/profiles/slug/${slug}`);
      const data = await response.json();
      if (data.success && data.profile) {
        setProfile(data.profile);
      } else {
        setError('Profile not found');
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const trackScan = async () => {
    try {
      await fetch(`${API_BASE}/api/profiles/track-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileSlug: slug,
          source: document.referrer ? 'referral' : 'qr'
        })
      });
    } catch (err) {
      // Silent fail
    }
  };

  const scrollToContact = () => {
    const el = document.querySelector('#contact-form');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);

    try {
      const response = await fetch(`${API_BASE}/api/profiles/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: profile?.id,
          homeownerName: formData.name,
          homeownerEmail: formData.email,
          homeownerPhone: formData.phone || null,
          address: formData.address || null,
          serviceType: formData.service || null,
          message: formData.message || null,
        })
      });
      const data = await response.json();
      if (data.success) {
        setFormSubmitted(true);
      } else {
        setFormError(data.error || 'Failed to submit. Please try again.');
      }
    } catch (err) {
      setFormError('Failed to submit. Please try again.');
    } finally {
      setFormLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#dc2626]"></div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-center px-4">
          <h1 className="text-2xl font-bold text-white mb-2">Profile Not Found</h1>
          <p className="text-gray-400">The page you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  const yearsExperience = calculateYearsExperience(profile.start_year);
  const displayRole = getDisplayRole(profile);
  const initials = profile.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-[#0a0a0a] via-[#171717] to-black py-12 md:py-16">
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-[#dc2626]/5" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Employee Info */}
            <div className="text-center md:text-left">
              {/* Profile Photo */}
              <div className="w-32 h-32 md:w-48 md:h-48 rounded-full mx-auto md:mx-0 mb-6 bg-[#262626] border-4 border-[#dc2626]/30 flex items-center justify-center overflow-hidden shadow-xl">
                {profile.image_url ? (
                  <img src={profile.image_url} alt={profile.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl md:text-6xl font-bold text-[#dc2626]">{initials}</span>
                )}
              </div>

              {/* Name */}
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold mb-2 text-white">
                {profile.name}
              </h1>

              {/* Role */}
              <p className="text-lg md:text-xl font-semibold mb-3 text-[#dc2626]">
                {displayRole}
              </p>

              {/* Years Experience */}
              {yearsExperience && (
                <div className="inline-flex items-center gap-2 bg-[#dc2626]/20 text-[#dc2626] px-4 py-2 rounded-full mb-4">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                  <span className="text-sm font-medium">{yearsExperience} {yearsExperience === 1 ? 'Year' : 'Years'} of Experience</span>
                </div>
              )}

              {/* Bio */}
              {profile.bio && (
                <p className="text-gray-300 text-sm md:text-base leading-relaxed mb-6 max-w-md mx-auto md:mx-0">
                  {profile.bio}
                </p>
              )}

              {/* Contact Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
                {profile.phone_number && (
                  <a href={`tel:${profile.phone_number}`} className="flex items-center justify-center gap-2 bg-white/10 border border-white/20 text-white hover:bg-white/20 px-6 py-3 rounded-lg font-medium transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span>{profile.phone_number}</span>
                  </a>
                )}
                {profile.email && (
                  <a href={`mailto:${profile.email}`} className="flex items-center justify-center gap-2 bg-white/10 border border-white/20 text-white hover:bg-white/20 px-6 py-3 rounded-lg font-medium transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="truncate max-w-[200px]">{profile.email}</span>
                  </a>
                )}
              </div>
            </div>

            {/* Video Placeholder */}
            <div className="relative">
              <div className="overflow-hidden shadow-2xl rounded-lg border-0">
                <div className="relative aspect-video bg-[#171717]">
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#262626] to-[#0a0a0a]">
                    <div className="text-center p-6">
                      <div className="w-20 h-20 rounded-full bg-[#dc2626]/20 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-10 h-10 text-[#dc2626]" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                      <p className="text-white font-medium mb-1">Welcome Video</p>
                      <p className="text-sm text-gray-400">Coming soon</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Free Inspection CTA */}
      <section className="py-12 bg-[#dc2626] text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Get Your FREE Home Inspection Today!</h2>
          <p className="text-xl mb-6">Professional assessment of your roof, siding, gutters, windows, and doors</p>
          <button onClick={scrollToContact} className="bg-white text-[#dc2626] hover:bg-gray-100 font-semibold text-lg px-8 py-3 rounded-lg transition-colors">
            Schedule Free Inspection
          </button>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-12 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-8 text-[#1a1a1a]">Our Services</h2>
          <div className="max-w-4xl mx-auto bg-[#dc2626] text-white rounded-xl shadow-xl p-8">
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              {SERVICES.map((service, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-white"></div>
                  <div>
                    <h3 className="font-semibold text-lg mb-1">{service.name}</h3>
                    <p className="text-zinc-100 text-sm">{service.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center pt-4 border-t border-white/20">
              <button onClick={scrollToContact} className="bg-white text-[#dc2626] hover:bg-zinc-100 font-semibold py-3 px-8 rounded-lg transition-colors">
                Schedule Free Inspection
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-12 bg-[#f5f5f5]">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-8 text-[#1a1a1a]">Why Choose The Roof Docs?</h2>
          <div className="max-w-4xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {['Licensed & Insured', 'GAF Master Elite Contractor', 'Golden Pledge Warranty', 'Free Inspections', 'Local & Trusted', '5-Star Reviews'].map((item, i) => (
              <div key={i} className="flex items-center gap-3 bg-white p-4 rounded-lg shadow-sm">
                <div className="w-8 h-8 rounded-full bg-[#dc2626]/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#dc2626]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="font-medium text-[#1a1a1a]">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form */}
      <section id="contact-form" className="py-12 bg-[#1a1a1a]">
        <div className="container mx-auto px-4 max-w-2xl">
          <div className="bg-[#262626] rounded-xl shadow-xl p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-6 text-white">
              Request Your Free Estimate{profile ? ` with ${profile.name}` : ''}
            </h2>

            {formSubmitted ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-green-500 mb-2">Thank You!</h3>
                <p className="text-gray-300">{profile?.name} will contact you soon!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {formError && (
                  <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg text-sm">
                    {formError}
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full h-12 px-4 bg-[#1a1a1a] border border-[#404040] rounded-lg text-white placeholder-gray-500 focus:border-[#dc2626] focus:outline-none"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Email *</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full h-12 px-4 bg-[#1a1a1a] border border-[#404040] rounded-lg text-white placeholder-gray-500 focus:border-[#dc2626] focus:outline-none"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full h-12 px-4 bg-[#1a1a1a] border border-[#404040] rounded-lg text-white placeholder-gray-500 focus:border-[#dc2626] focus:outline-none"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Service Needed</label>
                    <select
                      value={formData.service}
                      onChange={(e) => setFormData({...formData, service: e.target.value})}
                      className="w-full h-12 px-4 bg-[#1a1a1a] border border-[#404040] rounded-lg text-white focus:border-[#dc2626] focus:outline-none"
                    >
                      <option value="">Select a service...</option>
                      {SERVICE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    className="w-full h-12 px-4 bg-[#1a1a1a] border border-[#404040] rounded-lg text-white placeholder-gray-500 focus:border-[#dc2626] focus:outline-none"
                    placeholder="123 Main Street, City, State"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Message</label>
                  <textarea
                    value={formData.message}
                    onChange={(e) => setFormData({...formData, message: e.target.value})}
                    rows={3}
                    className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#404040] rounded-lg text-white placeholder-gray-500 focus:border-[#dc2626] focus:outline-none resize-none"
                    placeholder="Tell us about your project..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={formLoading}
                  className={`w-full h-14 text-lg font-semibold rounded-lg transition-colors ${
                    formLoading ? 'bg-gray-600 cursor-wait' : 'bg-[#dc2626] hover:bg-[#b91c1c] cursor-pointer'
                  } text-white`}
                >
                  {formLoading ? 'Submitting...' : 'Request Free Estimate'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-black border-t border-[#262626]">
        <div className="container mx-auto px-4 text-center">
          <p className="text-lg font-bold text-white mb-2">The Roof Docs</p>
          <p className="text-sm text-gray-500">© {new Date().getFullYear()} The Roof Docs. All rights reserved.</p>
          <p className="text-xs text-gray-600 mt-2">Licensed & Insured | Serving VA, MD, PA & Surrounding Areas</p>
        </div>
      </footer>
    </div>
  );
};

export default ProfilePage;
