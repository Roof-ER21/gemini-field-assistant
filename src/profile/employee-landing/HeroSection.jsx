import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Phone, Mail, Play } from "lucide-react";
import { employee } from "@/data/employeeData";

const HeroSection = () => {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  // Welcome video - can be added later via videos API
  const welcomeVideo = null;

  return (
    <section className="relative bg-gradient-to-br from-primary/10 to-secondary/10 py-12">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="text-center md:text-left">
            <img 
              src={employee.headshot} 
              alt={employee.name}
              className="w-32 h-32 rounded-full mx-auto md:mx-0 mb-4 object-cover border-4 border-primary/20"
            />
            <h1 className="text-4xl font-bold text-foreground mb-2">{employee.name}</h1>
            <p className="text-xl text-muted-foreground mb-4">{employee.title}</p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center md:justify-start mb-6">
              <Button variant="outline" className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                {employee.phone}
              </Button>
              <Button variant="outline" className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                {employee.email}
              </Button>
            </div>
          </div>
          
          {/* Video Player */}
          <div className="relative">
            <Card className="overflow-hidden">
              <div className="relative aspect-video bg-muted">
                {welcomeVideo ? (
                  !isVideoPlaying ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Button 
                        size="lg" 
                        onClick={() => setIsVideoPlaying(true)}
                        className="rounded-full w-16 h-16 p-0"
                      >
                        <Play className="w-6 h-6 ml-1" />
                      </Button>
                    </div>
                  ) : (
                    <video 
                      controls 
                      autoPlay 
                      className="w-full h-full object-cover"
                      src={welcomeVideo.file_url}
                    >
                      Your browser does not support the video tag.
                    </video>
                  )
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Play className="w-16 h-16 text-muted-foreground mb-4 mx-auto" />
                      <p className="text-muted-foreground">Welcome Video</p>
                      <p className="text-sm text-muted-foreground">Upload a video to get started</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;