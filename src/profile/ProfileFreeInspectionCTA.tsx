/**
 * Free Inspection CTA Section
 */

import React from 'react';

const ProfileFreeInspectionCTA: React.FC = () => {
  return (
    <section className="bg-red-600 py-8">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
          Get Your Free Roof Inspection Today
        </h2>
        <p className="text-white/90 mb-6 max-w-2xl mx-auto">
          Our certified inspectors will thoroughly assess your roof and provide a detailed report - completely free of charge.
        </p>
        <a
          href="#contact-form"
          className="inline-block bg-white text-red-600 hover:bg-gray-100 px-8 py-4 rounded-lg font-bold text-lg transition-colors"
        >
          Schedule Free Inspection
        </a>
      </div>
    </section>
  );
};

export default ProfileFreeInspectionCTA;
