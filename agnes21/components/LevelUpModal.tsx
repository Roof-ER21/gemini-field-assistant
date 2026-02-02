import React, { useEffect, useState } from 'react';
import { X, Trophy, Star, Sparkles, Zap } from 'lucide-react';
import { getUserProgress } from '../utils/gamification';

interface LevelUpModalProps {
  show: boolean;
  previousLevel: number;
  newLevel: number;
  unlocksAtThisLevel: string[];
  onClose: () => void;
  userId?: string;
}

const LevelUpModal: React.FC<LevelUpModalProps> = ({
  show,
  previousLevel,
  newLevel,
  unlocksAtThisLevel,
  onClose,
  userId
}) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const progress = getUserProgress(userId);

  useEffect(() => {
    if (show) {
      setIsAnimating(true);
      // Auto-close after 5 seconds
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setIsAnimating(false);
    }
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.95)', top: 0, left: 0, right: 0, bottom: 0, position: 'fixed' }}>
      {/* Animated Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Rays */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] animate-spin-slow opacity-30">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute top-1/2 left-1/2 w-1 h-full bg-gradient-to-t from-transparent via-yellow-500/30 to-transparent"
              style={{
                transform: `rotate(${i * 30}deg) translateX(-50%)`,
                transformOrigin: 'center top'
              }}
            />
          ))}
        </div>

        {/* Floating Particles */}
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${2 + Math.random() * 3}s`
            }}
          >
            <Star className="w-4 h-4 text-yellow-400 opacity-70" />
          </div>
        ))}
      </div>

      {/* Modal Content */}
      <div className={`relative bg-gradient-to-br from-neutral-900 via-black to-neutral-900 rounded-2xl border-2 border-yellow-500 shadow-2xl max-w-md w-full overflow-hidden ${isAnimating ? 'animate-scaleIn' : ''}`}>
        {/* Glow Effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-transparent to-red-500/10 pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-black/50 hover:bg-black/70 transition-all border border-neutral-800 hover:border-neutral-600"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-neutral-400" />
        </button>

        {/* Content */}
        <div className="relative p-8 text-center">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 animate-ping opacity-75">
                <Trophy className="w-24 h-24 text-yellow-500" />
              </div>
              <Trophy className="w-24 h-24 text-yellow-500 relative animate-bounce" />
            </div>
          </div>

          {/* Headline */}
          <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-red-500 to-yellow-400 uppercase tracking-wider mb-2 animate-pulse">
            LEVEL UP!
          </h2>

          {/* Level Display */}
          <div className="flex items-center justify-center space-x-4 mb-6">
            <div className="flex flex-col items-center">
              <span className="text-sm text-neutral-500 uppercase tracking-wider mb-1">Previous</span>
              <div className="bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2">
                <span className="text-2xl font-bold text-neutral-400">{previousLevel}</span>
              </div>
            </div>

            <div className={`${isAnimating ? 'animate-pulse' : ''}`}>
              <Zap className="w-8 h-8 text-yellow-500" />
            </div>

            <div className="flex flex-col items-center">
              <span className="text-sm text-yellow-500 uppercase tracking-wider mb-1">New Level</span>
              <div className="bg-gradient-to-br from-yellow-600 to-red-600 border-2 border-yellow-400 rounded-lg px-4 py-2 shadow-lg shadow-yellow-500/50">
                <span className="text-3xl font-black text-white">{newLevel}</span>
              </div>
            </div>
          </div>

          {/* Unlocks */}
          {unlocksAtThisLevel.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-center space-x-2 mb-3">
                <Sparkles className="w-5 h-5 text-yellow-500" />
                <h3 className="text-sm font-bold text-yellow-500 uppercase tracking-wider">New Unlocks</h3>
                <Sparkles className="w-5 h-5 text-yellow-500" />
              </div>
              <div className="space-y-2">
                {unlocksAtThisLevel.map((unlock, index) => (
                  <div
                    key={index}
                    className="bg-gradient-to-r from-yellow-900/20 to-red-900/20 border border-yellow-700/30 rounded-lg px-4 py-3 animate-slideInUp"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <p className="text-sm font-semibold text-yellow-400">{unlock}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* XP Progress Bar */}
          <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4 border border-yellow-900/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-yellow-500 uppercase tracking-wider">
                Level {progress.currentLevel}
              </span>
              <span className="text-xs text-neutral-400">
                {progress.totalXP - (50 * Math.pow(progress.currentLevel, 2))}/{50 * Math.pow(progress.currentLevel + 1, 2) - 50 * Math.pow(progress.currentLevel, 2)} XP
              </span>
            </div>
            <div className="w-full h-3 bg-neutral-900 rounded-full overflow-hidden border border-yellow-900/30">
              <div
                className="h-full bg-gradient-to-r from-red-600 via-yellow-600 to-yellow-400 transition-all duration-1000 ease-out"
                style={{
                  width: `${Math.min(100, Math.max(0, ((progress.totalXP - (50 * Math.pow(progress.currentLevel, 2))) / (50 * Math.pow(progress.currentLevel + 1, 2) - 50 * Math.pow(progress.currentLevel, 2))) * 100))}%`
                }}
              />
            </div>
          </div>

          {/* Continue Button */}
          <button
            onClick={onClose}
            className="mt-6 w-full bg-gradient-to-r from-yellow-600 to-red-600 hover:from-yellow-500 hover:to-red-500 text-white font-bold py-3 px-6 rounded-lg uppercase tracking-wider transition-all border-2 border-yellow-400 shadow-lg shadow-yellow-500/30 hover:shadow-yellow-500/50 hover:scale-105"
          >
            Continue Training
          </button>
        </div>
      </div>
    </div>
  );
};

export default LevelUpModal;
