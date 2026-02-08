import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Phone, Mail, Play, Award, Calendar } from "lucide-react";

// Calculate years of experience from start year
const calculateYearsExperience = (startYear) => {
  if (!startYear) return null;
  const currentYear = new Date().getFullYear();
  const years = currentYear - startYear;
  if (years <= 0) return null;
  return years;
};

// Get display role from role_type
const getDisplayRole = (employee) => {
  if (employee.title) return employee.title;
  if (employee.role) return employee.role;

  const roleLabels = {
    'admin': 'Administrator',
    'sales_rep': 'Sales Representative',
    'sales_manager': 'Sales Manager',
    'team_lead': 'Team Lead',
    'field_trainer': 'Field Trainer',
    'manager': 'Manager',
  };

  return roleLabels[employee.role_type] || 'Team Member';
};

const EmployeeHeroSection = ({ employee }) => {
  // Welcome video - can be added later via videos API
  const welcomeVideo = null;
  const videoLoading = false;

  const yearsExperience = calculateYearsExperience(employee.start_year);
  const displayRole = getDisplayRole(employee);

  return (
    <section className="relative bg-gradient-to-br from-neutral-950 via-neutral-900 to-black py-12 md:py-16">
      {/* Subtle red accent overlay for brand consistency */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-primary/5" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Employee Info Column */}
          <div className="text-center md:text-left">
            {/* Profile Photo - Larger on desktop */}
            <div className="w-32 h-32 md:w-48 md:h-48 rounded-full mx-auto md:mx-0 mb-6 bg-muted border-4 border-primary/30 flex items-center justify-center overflow-hidden shadow-xl transition-transform duration-300 hover:scale-105 hover:border-primary/50">
              {employee.image_url ? (
                <img
                  src={employee.image_url}
                  alt={employee.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-4xl md:text-6xl font-bold text-primary">
                  {employee.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </span>
              )}
            </div>

            {/* Name */}
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold mb-2 text-white drop-shadow-lg">
              {employee.name}
            </h1>

            {/* Role */}
            <p className="text-lg md:text-xl font-semibold mb-3 text-primary">
              {displayRole}
            </p>

            {/* Years Experience Badge */}
            {yearsExperience && (
              <div className="inline-flex items-center gap-2 bg-primary/20 text-primary px-4 py-2 rounded-full mb-4">
                <Award className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {yearsExperience} {yearsExperience === 1 ? 'Year' : 'Years'} of Experience
                </span>
              </div>
            )}

            {/* Bio */}
            {employee.bio && (
              <p className="text-gray-300 text-sm md:text-base leading-relaxed mb-6 max-w-md mx-auto md:mx-0">
                {employee.bio}
              </p>
            )}

            {/* Contact Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
              {employee.phone_number && (
                <Button
                  variant="outline"
                  size="lg"
                  className="flex items-center gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white h-12"
                  asChild
                >
                  <a href={`tel:${employee.phone_number}`}>
                    <Phone className="w-5 h-5" />
                    <span>{employee.phone_number}</span>
                  </a>
                </Button>
              )}
              {employee.email && (
                <Button
                  variant="outline"
                  size="lg"
                  className="flex items-center gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white h-12"
                  asChild
                >
                  <a href={`mailto:${employee.email}`}>
                    <Mail className="w-5 h-5" />
                    <span className="truncate max-w-[200px]">{employee.email}</span>
                  </a>
                </Button>
              )}
            </div>
          </div>

          {/* Video Player Column */}
          <div className="relative">
            <Card className="overflow-hidden shadow-2xl border-0">
              <div className="relative aspect-video bg-neutral-900">
                {/* Video Loading Skeleton */}
                {videoLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 animate-pulse">
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-neutral-800 mx-auto mb-4" />
                      <div className="h-4 w-32 bg-neutral-800 rounded mx-auto" />
                    </div>
                  </div>
                )}

                {welcomeVideo ? (
                  <video
                    controls
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                    src={welcomeVideo.video_url}
                    crossOrigin="anonymous"
                    onLoadStart={() => console.log('Welcome video loading:', welcomeVideo.video_url)}
                    onCanPlay={() => {
                      console.log('Welcome video ready to play');
                      setVideoLoading(false);
                    }}
                    onError={(e) => {
                      const error = e.target.error;
                      console.error('Welcome video error details:', {
                        url: welcomeVideo.video_url,
                        code: error?.code,
                        message: error?.message
                      });
                      setVideoLoading(false);
                    }}
                  >
                    Your browser does not support the video tag.
                  </video>
                ) : !videoLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950">
                    <div className="text-center p-6">
                      <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                        <Play className="w-10 h-10 text-primary" />
                      </div>
                      <p className="text-white font-medium mb-1">Welcome Video</p>
                      <p className="text-sm text-gray-400">Coming soon</p>
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

export default EmployeeHeroSection;
