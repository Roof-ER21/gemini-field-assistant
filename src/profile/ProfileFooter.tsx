/**
 * Profile Footer - Company info, links, copyright
 */

import React from 'react';

const ProfileFooter: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-black py-8 border-t border-neutral-800">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Logo and Company Name */}
          <div className="flex items-center gap-3">
            <img
              src="/roofdocs-logo.png"
              alt="The Roof Docs"
              className="h-8 w-auto"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="text-lg font-bold text-white">The Roof Docs</span>
          </div>

          {/* Quick Links */}
          <div className="flex items-center gap-6 text-sm">
            <a
              href="#contact-form"
              className="text-gray-400 hover:text-white transition-colors"
            >
              Contact
            </a>
            <span className="text-neutral-700">|</span>
            <a
              href="tel:+1-555-ROOF-DOC"
              className="text-gray-400 hover:text-white transition-colors"
            >
              Call Us
            </a>
          </div>

          {/* Copyright */}
          <div className="text-sm text-gray-500">
            © {currentYear} The Roof Docs. All rights reserved.
          </div>
        </div>

        {/* Bottom Note */}
        <div className="mt-6 pt-6 border-t border-neutral-800 text-center">
          <p className="text-xs text-gray-600">
            Licensed & Insured | Serving VA, MD, PA & Surrounding Areas
          </p>
        </div>
      </div>
    </footer>
  );
};

export default ProfileFooter;
