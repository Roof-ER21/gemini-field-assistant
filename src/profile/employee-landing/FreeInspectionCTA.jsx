import React from 'react';
import { Button } from "@/components/ui/button";

const FreeInspectionCTA = () => {
  const scrollToContact = () => {
    const contactSection = document.querySelector('#contact-form');
    if (contactSection) {
      contactSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section className="py-12 bg-primary text-primary-foreground">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl font-bold mb-4">Get Your FREE Home Inspection Today!</h2>
        <p className="text-xl mb-6">Professional assessment of your roof, siding, gutters, windows, and doors</p>
        <Button size="lg" variant="secondary" className="text-lg px-8 py-3" onClick={scrollToContact}>
          Schedule Free Inspection
        </Button>
      </div>
    </section>
  );
};

export default FreeInspectionCTA;