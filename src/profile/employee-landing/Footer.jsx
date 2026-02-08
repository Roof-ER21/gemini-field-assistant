import React from 'react';
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-primary text-primary-foreground py-8">
      <div className="container mx-auto px-4 text-center">
        <Button variant="outline" className="mb-4 bg-primary-foreground text-primary hover:bg-primary-foreground/90" asChild>
          <a href="https://www.theroofdocs.com" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-4 h-4 mr-2" />
            Visit Our Main Website
          </a>
        </Button>
        <p className="text-sm opacity-80">© 2024 The Roof Docs. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;