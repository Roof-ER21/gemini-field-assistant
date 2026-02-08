/**
 * Profile Hero Section - Employee photo, name, title, contact buttons
 */

import React from 'react';

interface EmployeeProfile {
  id: string;
  name: string;
  title: string | null;
  role_type: string;
  email: string | null;
  phone_number: string | null;
  bio: string | null;
  image_url: string | null;
  start_year: number | null;
}

interface ProfileHeroSectionProps {
  profile: EmployeeProfile;
}

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
    'sales_rep': 'Sales Representative',
    'sales_manager': 'Sales Manager',
    'team_lead': 'Team Lead',
    'field_trainer': 'Field Trainer',
    'manager': 'Manager',
  };

  return roleLabels[profile.role_type] || 'Team Member';
};

const ProfileHeroSection: React.FC<ProfileHeroSectionProps> = ({ profile }) => {
  const yearsExperience = calculateYearsExperience(profile.start_year);
  const displayRole = getDisplayRole(profile);

  // Get initials for avatar fallback
  const initials = profile.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  return (
    <section className="relative bg-gradient-to-br from-neutral-950 via-neutral-900 to-black py-12 md:py-16">
      {/* Subtle red accent overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-red-600/5" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Employee Info Column */}
          <div className="text-center md:text-left">
            {/* Profile Photo */}
            <div className="w-32 h-32 md:w-48 md:h-48 rounded-full mx-auto md:mx-0 mb-6 bg-neutral-800 border-4 border-red-600/30 flex items-center justify-center overflow-hidden shadow-xl transition-transform duration-300 hover:scale-105 hover:border-red-600/50">
              {profile.image_url ? (
                <img
                  src={profile.image_url}
                  alt={profile.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-4xl md:text-6xl font-bold text-red-600">
                  {initials}
                </span>
              )}
            </div>

            {/* Name */}
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold mb-2 text-white drop-shadow-lg">
              {profile.name}
            </h1>

            {/* Role */}
            <p className="text-lg md:text-xl font-semibold mb-3 text-red-500">
              {displayRole}
            </p>

            {/* Years Experience Badge */}
            {yearsExperience && (
              <div className="inline-flex items-center gap-2 bg-red-600/20 text-red-500 px-4 py-2 rounded-full mb-4">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium">
                  {yearsExperience} {yearsExperience === 1 ? 'Year' : 'Years'} of Experience
                </span>
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
                <a
                  href={`tel:${profile.phone_number}`}
                  className="flex items-center justify-center gap-2 bg-white/10 border border-white/20 text-white hover:bg-white/20 px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>{profile.phone_number}</span>
                </a>
              )}
              {profile.email && (
                <a
                  href={`mailto:${profile.email}`}
                  className="flex items-center justify-center gap-2 bg-white/10 border border-white/20 text-white hover:bg-white/20 px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="truncate max-w-[200px]">{profile.email}</span>
                </a>
              )}
            </div>
          </div>

          {/* Video Placeholder Column */}
          <div className="relative">
            <div className="overflow-hidden shadow-2xl rounded-lg border-0">
              <div className="relative aspect-video bg-neutral-900">
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950">
                  <div className="text-center p-6">
                    <div className="w-20 h-20 rounded-full bg-red-600/20 flex items-center justify-center mx-auto mb-4">
                      <svg className="w-10 h-10 text-red-600" fill="currentColor" viewBox="0 0 24 24">
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
  );
};

export default ProfileHeroSection;
