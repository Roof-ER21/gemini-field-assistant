import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { services } from "@/data/employeeData";
const ServicesSection = () => {
  const scrollToContact = () => {
    const contactSection = document.querySelector('#contact-form');
    if (contactSection) {
      contactSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return <section className="py-12 bg-[#b42c2c]/0">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-8 text-slate-950">Our Services</h2>
        <Card className="max-w-4xl mx-auto bg-[#ec1f1f]/[0.94] text-white shadow-xl">
          <CardContent className="p-8">
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              {services.map((service, index) => (
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
              <button 
                onClick={scrollToContact}
                className="bg-white text-[#ec1f1f] hover:bg-zinc-100 font-semibold py-3 px-8 rounded-lg transition-colors"
              >
                Schedule Free Inspection
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>;
};
export default ServicesSection;