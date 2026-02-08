import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Phone, Mail, Users, LogOut, LogIn, Shield, LayoutDashboard } from "lucide-react";
import { useAuth } from '@/hooks/useAuth';
import { useManagerAccess } from '@/hooks/useRoleAccess';
import NotificationCenter from '@/components/NotificationCenter';
import { ThemeToggle } from '@/components/ThemeToggle';

const Header = () => {
  const { user, signOut } = useAuth();
  const { hasAccess: hasManagerAccess } = useManagerAccess();

  return (
    <header className="bg-background border-b sticky top-0 z-50">
      <div className="container mx-auto px-3 md:px-4 py-3 md:py-4">
        <div className="flex items-center justify-between gap-2">
          {/* Logo - Smaller on mobile */}
          <Link to="/" className="flex-shrink-0">
            <img
              src="/lovable-uploads/c3c87251-3538-4279-b118-7d323f2cbd24.png"
              alt="Company Logo"
              className="h-8 md:h-10 w-auto"
            />
          </Link>

          {/* Navigation - Better spacing with gap */}
          <div className="flex items-center gap-1.5 md:gap-3 flex-wrap justify-end">
            <ThemeToggle />

            {/* Contact Buttons - Primary CTAs */}
            <div className="flex items-center gap-1.5 md:gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-2 md:px-3"
                asChild
              >
                <a href="tel:+17032393738" className="flex items-center gap-1.5">
                  <Phone className="w-4 h-4" />
                  <span className="hidden lg:inline text-xs">(703) 239-3738</span>
                </a>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-9 px-2 md:px-3"
                asChild
              >
                <a href="mailto:info@theroofdocs.com" className="flex items-center gap-1.5">
                  <Mail className="w-4 h-4" />
                  <span className="hidden lg:inline text-xs">Email</span>
                </a>
              </Button>
            </div>

            {/* Staff Navigation */}
            {user ? (
              <div className="flex items-center gap-1.5 md:gap-2">
                <Link to="/directory">
                  <Button variant="ghost" size="sm" className="h-9 px-2 md:px-3">
                    <Users className="w-4 h-4" />
                    <span className="hidden md:inline ml-1.5 text-xs">Directory</span>
                  </Button>
                </Link>

                <NotificationCenter />

                <Link to="/dashboard">
                  <Button variant="ghost" size="sm" className="h-9 px-2 md:px-3">
                    <LayoutDashboard className="w-4 h-4" />
                    <span className="hidden md:inline ml-1.5 text-xs">Dashboard</span>
                  </Button>
                </Link>

                {hasManagerAccess && (
                  <Link to="/admin">
                    <Button variant="ghost" size="sm" className="h-9 px-2 md:px-3">
                      <Shield className="w-4 h-4" />
                      <span className="hidden md:inline ml-1.5 text-xs">Admin</span>
                    </Button>
                  </Link>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={signOut}
                  className="h-9 px-2 md:px-3 text-destructive hover:text-destructive"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden md:inline ml-1.5 text-xs">Sign Out</span>
                </Button>
              </div>
            ) : (
              <Link to="/auth">
                <Button variant="default" size="sm" className="h-9 px-3">
                  <LogIn className="w-4 h-4" />
                  <span className="hidden sm:inline ml-1.5 text-xs">Staff Login</span>
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
