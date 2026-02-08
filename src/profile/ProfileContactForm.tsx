/**
 * Profile Contact Form - Lead capture that integrates with canvassing system
 */

import React, { useState } from 'react';

interface EmployeeProfile {
  id: string;
  name: string;
  slug: string;
}

interface ProfileContactFormProps {
  profile: EmployeeProfile;
}

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

const API_BASE = '';

const ProfileContactForm: React.FC<ProfileContactFormProps> = ({ profile }) => {
  const [formData, setFormData] = useState({
    homeowner_name: '',
    homeowner_email: '',
    homeowner_phone: '',
    street_address: '',
    city: '',
    state: '',
    zip: '',
    service: '',
    preferred_contact: 'phone',
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate required fields
      if (!formData.homeowner_name.trim() || !formData.homeowner_email.trim()) {
        setError('Name and email are required.');
        setLoading(false);
        return;
      }

      // Basic email validation
      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
      if (!emailRegex.test(formData.homeowner_email.trim())) {
        setError('Please enter a valid email address.');
        setLoading(false);
        return;
      }

      // Combine address fields
      const addressParts = [
        formData.street_address?.trim(),
        formData.city?.trim(),
        formData.state?.trim(),
        formData.zip?.trim()
      ].filter(Boolean);
      const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : null;

      // Build message with preferred contact method
      let enrichedMessage = formData.message?.trim() || '';
      if (formData.preferred_contact) {
        const contactLabels: Record<string, string> = { phone: 'Phone', email: 'Email', text: 'Text' };
        enrichedMessage = `[Preferred Contact: ${contactLabels[formData.preferred_contact]}]\n\n${enrichedMessage}`;
      }

      // Submit to SA21's lead API
      const response = await fetch(`${API_BASE}/api/profiles/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: profile.id,
          homeownerName: formData.homeowner_name.trim(),
          homeownerEmail: formData.homeowner_email.trim().toLowerCase(),
          homeownerPhone: formData.homeowner_phone.trim() || null,
          address: fullAddress,
          serviceType: formData.service || null,
          message: enrichedMessage || null,
        })
      });

      const data = await response.json();

      if (data.success) {
        setSubmitted(true);
      } else {
        setError(data.error || 'Failed to submit. Please try again.');
      }
    } catch (err) {
      console.error('Submission error:', err);
      setError('Failed to submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Success confirmation screen
  if (submitted) {
    return (
      <section id="contact-form" className="py-12 bg-neutral-950">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="bg-neutral-900 rounded-lg shadow-lg p-8 text-center border border-neutral-800">
            <div className="mb-6">
              <svg className="w-20 h-20 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold mb-4 text-green-500">
              Thank You!
            </h2>
            <p className="text-lg text-gray-300 mb-6">
              Your request has been submitted successfully.
              {profile && ` ${profile.name} will contact you soon!`}
            </p>
            <div className="bg-neutral-800 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-400">
                We typically respond within 24 hours. If you need immediate assistance, please call us directly.
              </p>
            </div>
            <button
              onClick={() => {
                setSubmitted(false);
                setFormData({
                  homeowner_name: '',
                  homeowner_email: '',
                  homeowner_phone: '',
                  street_address: '',
                  city: '',
                  state: '',
                  zip: '',
                  service: '',
                  preferred_contact: 'phone',
                  message: '',
                });
              }}
              className="bg-transparent border border-neutral-600 text-gray-300 hover:bg-neutral-800 px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Submit Another Request
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="contact-form" className="py-12 bg-neutral-950">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-neutral-900 rounded-lg shadow-lg p-6 md:p-8 border border-neutral-800">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-6 md:mb-8 text-white">
            Request Your Free Estimate{profile ? ` with ${profile.name}` : ''}
          </h2>

          {error && (
            <div className="bg-red-900/50 border border-red-600 text-red-300 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name & Email Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="homeowner_name" className="block text-sm font-medium text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  id="homeowner_name"
                  type="text"
                  value={formData.homeowner_name}
                  onChange={(e) => setFormData({...formData, homeowner_name: e.target.value})}
                  placeholder="John Doe"
                  required
                  maxLength={100}
                  className="w-full h-12 px-4 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-gray-500 focus:border-red-600 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="homeowner_email" className="block text-sm font-medium text-gray-300 mb-1">
                  Email *
                </label>
                <input
                  id="homeowner_email"
                  type="email"
                  value={formData.homeowner_email}
                  onChange={(e) => setFormData({...formData, homeowner_email: e.target.value})}
                  placeholder="john@example.com"
                  required
                  maxLength={255}
                  className="w-full h-12 px-4 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-gray-500 focus:border-red-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Phone & Service Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="homeowner_phone" className="block text-sm font-medium text-gray-300 mb-1">
                  Phone Number
                </label>
                <input
                  id="homeowner_phone"
                  type="tel"
                  value={formData.homeowner_phone}
                  onChange={(e) => setFormData({...formData, homeowner_phone: e.target.value})}
                  placeholder="(555) 123-4567"
                  maxLength={20}
                  className="w-full h-12 px-4 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-gray-500 focus:border-red-600 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="service" className="block text-sm font-medium text-gray-300 mb-1">
                  Service Needed
                </label>
                <select
                  id="service"
                  value={formData.service}
                  onChange={(e) => setFormData({...formData, service: e.target.value})}
                  className="w-full h-12 px-4 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:border-red-600 focus:outline-none appearance-none cursor-pointer"
                >
                  <option value="">Select a service...</option>
                  {SERVICE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Address Section */}
            <div className="space-y-4">
              <div>
                <label htmlFor="street_address" className="block text-sm font-medium text-gray-300 mb-1">
                  Street Address
                </label>
                <input
                  id="street_address"
                  type="text"
                  value={formData.street_address}
                  onChange={(e) => setFormData({...formData, street_address: e.target.value})}
                  placeholder="123 Main Street"
                  maxLength={200}
                  className="w-full h-12 px-4 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-gray-500 focus:border-red-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="col-span-2 md:col-span-2">
                  <label htmlFor="city" className="block text-sm font-medium text-gray-300 mb-1">
                    City
                  </label>
                  <input
                    id="city"
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({...formData, city: e.target.value})}
                    placeholder="City"
                    maxLength={100}
                    className="w-full h-12 px-4 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-gray-500 focus:border-red-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="state" className="block text-sm font-medium text-gray-300 mb-1">
                    State
                  </label>
                  <input
                    id="state"
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData({...formData, state: e.target.value.toUpperCase()})}
                    placeholder="VA"
                    maxLength={2}
                    className="w-full h-12 px-4 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-gray-500 focus:border-red-600 focus:outline-none uppercase"
                  />
                </div>
                <div>
                  <label htmlFor="zip" className="block text-sm font-medium text-gray-300 mb-1">
                    ZIP
                  </label>
                  <input
                    id="zip"
                    type="text"
                    value={formData.zip}
                    onChange={(e) => setFormData({...formData, zip: e.target.value})}
                    placeholder="12345"
                    maxLength={10}
                    className="w-full h-12 px-4 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-gray-500 focus:border-red-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Preferred Contact Method */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Preferred Contact Method
              </label>
              <div className="flex flex-wrap gap-4">
                {[
                  { value: 'phone', label: 'Phone', icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z' },
                  { value: 'email', label: 'Email', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                  { value: 'text', label: 'Text', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
                ].map((option) => (
                  <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="preferred_contact"
                      value={option.value}
                      checked={formData.preferred_contact === option.value}
                      onChange={(e) => setFormData({...formData, preferred_contact: e.target.value})}
                      className="w-4 h-4 text-red-600 bg-neutral-800 border-neutral-600 focus:ring-red-600"
                    />
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={option.icon} />
                    </svg>
                    <span className="text-gray-300">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Message */}
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-1">
                Additional Details
              </label>
              <textarea
                id="message"
                value={formData.message}
                onChange={(e) => setFormData({...formData, message: e.target.value})}
                placeholder="Tell us about your project, any specific concerns, or preferred times for contact..."
                rows={4}
                maxLength={1000}
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-gray-500 focus:border-red-600 focus:outline-none resize-y"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full h-14 text-lg font-semibold rounded-lg transition-colors ${
                loading
                  ? 'bg-neutral-700 text-gray-400 cursor-wait'
                  : 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
              }`}
            >
              {loading ? 'Submitting...' : 'Request Free Estimate'}
            </button>

            <p className="text-xs text-center text-gray-500">
              By submitting this form, you agree to be contacted about our services.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
};

export default ProfileContactForm;
