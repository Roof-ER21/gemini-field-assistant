import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, MessageSquare, Image, Mic, Mail, Map, Radio, BookOpen } from 'lucide-react';
import Logo from './icons/Logo';
import { cn } from '../lib/utils';
import NotificationBell from './NotificationBell';

type PanelType = 'chat' | 'image' | 'transcribe' | 'email' | 'stormmap' | 'live' | 'knowledge';

interface MobileHeaderProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

const MobileHeader: React.FC<MobileHeaderProps> = ({ activePanel, setActivePanel }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const menuItems = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'image', label: 'Image Analysis', icon: Image },
    { id: 'transcribe', label: 'Transcription', icon: Mic },
    { id: 'email', label: 'Email', icon: Mail },
    { id: 'stormmap', label: 'Storm Maps', icon: Map },
    { id: 'live', label: 'Live', icon: Radio },
    { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
  ];

  const activeItem = menuItems.find(item => item.id === activePanel);
  const ActiveIcon = activeItem?.icon || MessageSquare;

  return (
    <>
      {/* Mobile Header - Only visible on mobile */}
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className="md:hidden fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b border-[#262626] mobile-pt-safe"
        style={{ background: 'linear-gradient(180deg, #000000 0%, #0a0a0a 100%)' }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <motion.div
              whileTap={{ scale: 0.95 }}
              className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg shadow-red-600/30 glow-red-subtle touch-target"
            >
              <Logo className="h-5 w-5" />
            </motion.div>
            <div>
              <h1 className="text-base font-bold" style={{ fontFamily: 'Rajdhani, Orbitron, sans-serif' }}>
                <span style={{ color: '#ffffff' }}>Susan</span>
                <span style={{ color: '#dc2626', marginLeft: '4px' }}>21</span>
              </h1>
              <p className="text-[10px] text-[#a1a1aa] font-medium tracking-wider uppercase">
                {activeItem?.label || 'Assistant'}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Notification Bell */}
            <NotificationBell />

            {/* Menu Button */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="h-10 w-10 rounded-xl bg-[#171717] border border-[#262626] flex items-center justify-center shadow-lg touch-target"
            >
              <AnimatePresence mode="wait">
                {isMenuOpen ? (
                  <motion.div
                    key="close"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <X className="h-5 w-5 text-[#dc2626]" strokeWidth={2.5} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="menu"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Menu className="h-5 w-5 text-[#a1a1aa]" strokeWidth={2.5} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      </motion.header>

      {/* Mobile Menu Drawer */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="md:hidden fixed top-0 right-0 bottom-0 w-[280px] backdrop-blur-xl border-l border-[#262626] z-50 overflow-y-auto"
              style={{ background: 'linear-gradient(180deg, #000000 0%, #0a0a0a 100%)' }}
            >
              {/* Header */}
              <div className="p-6 border-b border-[#262626]">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg shadow-red-600/30">
                    <Logo className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">
                      <span style={{ color: '#ffffff' }}>Susan</span>
                      <span style={{ color: '#dc2626', marginLeft: '4px' }}>21</span>
                    </h2>
                    <p className="text-[10px] text-[#a1a1aa] font-medium tracking-wider">
                      AI ASSISTANT
                    </p>
                  </div>
                </div>
              </div>

              {/* Menu Items */}
              <nav className="p-4 space-y-2">
                {menuItems.map((item, index) => {
                  const Icon = item.icon;
                  const isActive = activePanel === item.id;

                  return (
                    <motion.button
                      key={item.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => {
                        setActivePanel(item.id as PanelType);
                        setIsMenuOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 touch-target tap-feedback",
                        isActive
                          ? 'bg-gradient-to-r from-[#dc2626] to-[#dc2626] text-white shadow-lg'
                          : 'bg-[#171717] border border-[#262626] text-[#a1a1aa] hover:bg-[#1a1a1a]'
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-5 w-5 flex-shrink-0",
                          isActive ? 'text-white' : 'text-[#dc2626]'
                        )}
                        strokeWidth={2}
                      />
                      <span className="text-sm font-medium">{item.label}</span>
                      {isActive && (
            <motion.div
                          layoutId="activeIndicator"
                          className="ml-auto h-2 w-2 rounded-full bg-white shadow-lg"
                          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        />
                      )}
                    </motion.button>
                  );
                })}
              </nav>

              {/* Footer */}
              <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-[#262626] mobile-pb-safe">
                <div className="text-center space-y-1">
                  <p className="text-[10px] text-[#a1a1aa] font-medium tracking-wider uppercase">
                    S21 Interface v3.1
                  </p>
                  <p className="text-[10px] text-[#a1a1aa]">
                    &copy; 2024 Weyland-Yutani Corp
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default MobileHeader;
