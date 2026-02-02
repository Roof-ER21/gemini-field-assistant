import React from 'react';
import { Trophy } from 'lucide-react';
import { getUserProgress } from '../utils/gamification';

interface XPBarProps {
  userId?: string;
  compact?: boolean;
}

const XPBar: React.FC<XPBarProps> = ({ userId, compact = false }) => {
  const progress = getUserProgress(userId);

  // Calculate progress percentage
  const currentLevelXP = progress.totalXP - (progress.currentLevel > 1 ? 50 * Math.pow(progress.currentLevel - 1, 2) : 0);
  const nextLevelXP = 50 * Math.pow(progress.currentLevel, 2);
  const xpInCurrentLevel = progress.totalXP - (progress.currentLevel > 1 ? 50 * Math.pow(progress.currentLevel, 2) : 0);
  const xpNeededForLevel = 50 * Math.pow(progress.currentLevel + 1, 2) - 50 * Math.pow(progress.currentLevel, 2);
  const percentage = Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForLevel) * 100));

  if (compact) {
    return (
      <div className="flex items-center space-x-2 bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2 border border-neutral-800">
        <Trophy className="w-4 h-4 text-yellow-500" />
        <div className="flex flex-col min-w-[120px]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider">
              Level {progress.currentLevel}
            </span>
            <span className="text-[9px] text-neutral-400">
              {xpInCurrentLevel}/{xpNeededForLevel} XP
            </span>
          </div>
          <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden border border-yellow-900/30">
            <div
              className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 transition-all duration-500 ease-out"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black/60 backdrop-blur-sm rounded-xl p-4 border border-yellow-900/30">
      <div className="flex items-center space-x-3 mb-3">
        <div className="p-2 rounded-lg bg-yellow-900/20 border border-yellow-700/30">
          <Trophy className="w-6 h-6 text-yellow-500" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-yellow-500 uppercase tracking-wider">
              Level {progress.currentLevel}
            </h3>
            <span className="text-xs text-neutral-400">
              {xpInCurrentLevel}/{xpNeededForLevel} XP
            </span>
          </div>
          <div className="w-full h-3 bg-neutral-900 rounded-full overflow-hidden border border-yellow-900/30">
            <div
              className="h-full bg-gradient-to-r from-red-600 via-yellow-600 to-yellow-400 transition-all duration-500 ease-out relative"
              style={{ width: `${percentage}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between text-[10px] text-neutral-500 uppercase tracking-wider">
        <span>Total XP: {progress.totalXP}</span>
        <span>{progress.xpToNextLevel} to next level</span>
      </div>
    </div>
  );
};

export default XPBar;
