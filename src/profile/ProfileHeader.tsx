/**
 * Profile Page Header - The Roof Docs branding
 */

import React from 'react';

const ProfileHeader: React.FC = () => {
  return (
    <header className="bg-neutral-950 border-b border-neutral-800 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img
              src="/roofdocs-logo.png"
              alt="The Roof Docs"
              className="h-10 w-auto"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="text-xl font-bold text-white">The Roof Docs</span>
          </div>

          {/* CTA Button */}
          <a
            href="#contact-form"
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors text-sm md:text-base"
          >
            Free Inspection
          </a>
        </div>
      </div>
    </header>
  );
};

export default ProfileHeader;
