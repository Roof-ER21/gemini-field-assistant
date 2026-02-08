import React from 'react';
import { Card } from "@/components/ui/card";
import { projectImages } from "@/data/employeeData";

const ProjectGallery = () => {
  return (
    <section className="py-12 bg-secondary/20">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-8">Our Recent Projects</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {projectImages.map((image, index) => (
            <Card key={index} className="overflow-hidden hover:shadow-lg transition-shadow">
              <img 
                src={image} 
                alt={`Recent project ${index + 1}`}
                className="w-full aspect-video object-cover"
              />
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProjectGallery;