import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { homeownerBenefits } from "@/data/employeeData";
import { DollarSign, MapPin, Gift, Wrench, Search, FileText, Trash2, Home, Sun, CheckCircle, Users, Award, TrendingUp, ArrowRight } from 'lucide-react';
const WhyChooseUsSection = () => {
  const [selectedStep, setSelectedStep] = useState(null);
  
  const scrollToContact = () => {
    const contactSection = document.querySelector('#contact-form');
    if (contactSection) {
      contactSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  
  const formatCurrency = amount => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };
  const getStepIcon = iconName => {
    const icons = {
      Search,
      FileText,
      Trash2,
      Home,
      Sun,
      CheckCircle
    };
    const IconComponent = icons[iconName];
    return IconComponent ? <IconComponent className="w-6 h-6" /> : null;
  };
  return <section className="py-16 relative overflow-hidden bg-gradient-to-br from-primary/5 to-secondary/10">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm"></div>
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4 text-foreground">Why Choose Us</h2>
            <p className="text-xl text-foreground/80 max-w-3xl mx-auto">
              Local expertise, proven results, and complete project solutions
            </p>
          </div>

          {/* Local Trust Card */}
          <div className="max-w-3xl mx-auto mb-16">
            <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-lg hover:shadow-xl transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center mb-4">
                  <div className="bg-secondary/20 p-3 rounded-full mr-4">
                    <MapPin className="w-8 h-8 text-foreground" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-foreground">Local & Trusted</h3>
                    <p className="text-foreground/70">Your Neighborhood Experts</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="text-center p-3 bg-primary/10 rounded-lg">
                    <div className="text-2xl font-bold text-primary">
                      {homeownerBenefits.localTrust.yearsInBusiness}
                    </div>
                    <div className="text-xs text-foreground/70">Years in Business</div>
                  </div>
                  
                  <div className="text-center p-3 bg-primary/10 rounded-lg">
                    <div className="text-2xl font-bold text-primary">
                      {homeownerBenefits.localTrust.projectsCompleted}
                    </div>
                    <div className="text-xs text-foreground/70">Projects Completed</div>
                  </div>
                </div>
                
                <div className="space-y-2 mb-4">
                  {homeownerBenefits.localTrust.certifications.map((cert, index) => (
                    <div key={index} className="flex items-center">
                      <Award className="w-4 h-4 text-primary mr-2 flex-shrink-0" />
                      <span className="text-sm font-medium">{cert}</span>
                    </div>
                  ))}
                  <div className="flex items-center">
                    <CheckCircle className="w-4 h-4 text-primary mr-2 flex-shrink-0" />
                    <span className="text-sm font-medium">Lifetime Warranty</span>
                  </div>
                  <div className="flex items-center">
                    <Users className="w-4 h-4 text-primary mr-2 flex-shrink-0" />
                    <span className="text-sm font-medium">Family-Owned Business</span>
                  </div>
                </div>
                
                <Button variant="outline" onClick={() => window.open('https://www.theroofdocs.com/#our-project', '_blank')} className="w-full bg-red-700 hover:bg-red-600 text-white">
                  See Local Projects
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Complete Service Process */}
          <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-lg">
            <CardContent className="p-8">
              <div className="text-center mb-6">
                <div className="bg-secondary/20 p-4 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                  <Wrench className="w-10 h-10 text-foreground" />
                </div>
                <h3 className="text-3xl font-bold text-foreground mb-2">Complete Project Solution</h3>
                <p className="text-lg text-foreground/70 mb-6">From tear-off to solar - we handle everything</p>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                {homeownerBenefits.fullServiceProcess.map((step, index) => (
                  <div key={index} className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <div className="text-primary font-bold">
                          {getStepIcon(step.icon)}
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-foreground mb-1">
                        Step {step.step}: {step.title}
                      </h4>
                      <p className="text-foreground/70 text-sm">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="text-center pt-4 border-t border-border/50 space-y-3">
                <Button 
                  size="lg" 
                  variant="outline" 
                  onClick={() => window.open('https://www.theroofdocs.com/wp-content/uploads/2025/04/Step-By-Step-Roof-Replacement-Video.mp4', '_blank')} 
                  className="text-slate-50 bg-red-700 hover:bg-red-600 mr-3"
                >
                  See Our Complete Process
                </Button>
                <Button size="lg" onClick={scrollToContact}>
                  Get Your Free Inspection
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>;
};
export default WhyChooseUsSection;