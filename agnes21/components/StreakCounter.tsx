import React, { useState, useEffect } from 'react';
import { getStreak, getStreakCalendar, StreakData } from '../utils/sessionStorage';
import { Flame, Trophy, Calendar, X } from 'lucide-react';

interface StreakCounterProps {
  className?: string;
  showCalendar?: boolean;
}

const StreakCounter: React.FC<StreakCounterProps> = ({ className = '', showCalendar = false }) => {
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    loadStreak();
  }, []);

  const loadStreak = () => {
    const currentStreak = getStreak();
    setStreak(currentStreak);
  };

  if (!streak) return null;

  const calendar = getStreakCalendar(30);

  // Get streak color based on length
  const getStreakColor = () => {
    if (streak.currentStreak >= 30) return 'text-purple-400 bg-purple-500/20 border-purple-500/30';
    if (streak.currentStreak >= 7) return 'text-orange-400 bg-orange-500/20 border-orange-500/30';
    if (streak.currentStreak >= 3) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
    return 'text-neutral-400 bg-neutral-800/50 border-neutral-700';
  };

  // Get flame color
  const getFlameColor = () => {
    if (streak.currentStreak >= 30) return 'text-purple-500';
    if (streak.currentStreak >= 7) return 'text-orange-500';
    if (streak.currentStreak >= 3) return 'text-yellow-500';
    return 'text-neutral-500';
  };

  const getMotivationalMessage = () => {
    if (streak.currentStreak === 0) return "Start your streak today!";
    if (streak.currentStreak === 1) return "Great start! Keep it up!";
    if (streak.currentStreak < 7) return "You're on fire! Keep practicing!";
    if (streak.currentStreak < 30) return "🔥 Hot streak! Don't break it!";
    if (streak.currentStreak < 100) return "🌟 Legendary! You're unstoppable!";
    return "💯 ELITE STATUS! Master level achieved!";
  };

  return (
    <>
      {/* Main Streak Badge */}
      <div className={`relative ${className}`}>
        <button
          onClick={() => showCalendar && setIsCalendarOpen(!isCalendarOpen)}
          className={`group flex items-center space-x-3 px-4 py-2.5 rounded-full ${getStreakColor()} border backdrop-blur-sm transition-all duration-300 hover:scale-105 ${showCalendar ? 'cursor-pointer' : 'cursor-default'}`}
        >
          {/* Flame Icon */}
          <div className="relative">
            <Flame
              className={`w-5 h-5 ${getFlameColor()} ${streak.currentStreak > 0 ? 'animate-pulse' : ''}`}
              fill={streak.currentStreak > 0 ? 'currentColor' : 'none'}
            />
            {streak.currentStreak >= 7 && (
              <div className={`absolute -top-1 -right-1 w-2 h-2 ${streak.currentStreak >= 30 ? 'bg-purple-500' : 'bg-orange-500'} rounded-full animate-ping`} />
            )}
          </div>

          {/* Streak Count */}
          <div className="flex flex-col items-start">
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              {streak.currentStreak === 0 ? 'No Streak' : 'Day Streak'}
            </span>
            <span className={`text-lg font-bold ${getFlameColor()}`}>
              {streak.currentStreak > 0 ? `${streak.currentStreak} ${streak.currentStreak === 1 ? 'Day' : 'Days'}` : 'Start Today'}
            </span>
          </div>

          {/* Longest Streak Badge */}
          {streak.longestStreak > 0 && (
            <div className="flex items-center space-x-1 px-2 py-1 bg-neutral-900/50 rounded-full">
              <Trophy className="w-3 h-3 text-yellow-500" />
              <span className="text-xs font-mono text-yellow-500">{streak.longestStreak}</span>
            </div>
          )}
        </button>

        {/* Motivational Message */}
        {streak.currentStreak > 0 && (
          <div className="absolute -bottom-6 left-0 right-0 text-center">
            <span className="text-xs text-neutral-500 font-medium">
              {getMotivationalMessage()}
            </span>
          </div>
        )}
      </div>

      {/* Calendar Modal */}
      {isCalendarOpen && showCalendar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative bg-neutral-900 border border-neutral-800 rounded-2xl p-8 max-w-2xl w-full shadow-2xl">
            {/* Close Button */}
            <button
              onClick={() => setIsCalendarOpen(false)}
              className="absolute top-4 right-4 p-2 hover:bg-neutral-800 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-neutral-400" />
            </button>

            {/* Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center space-x-3 mb-2">
                <Calendar className="w-7 h-7 text-red-500" />
                <span>Practice Calendar</span>
              </h2>
              <p className="text-neutral-400">Last 30 days of training sessions</p>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700">
                <div className="flex items-center space-x-2 mb-1">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span className="text-xs text-neutral-400 uppercase tracking-wider">Current</span>
                </div>
                <span className="text-2xl font-bold text-orange-400">{streak.currentStreak}</span>
              </div>
              <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700">
                <div className="flex items-center space-x-2 mb-1">
                  <Trophy className="w-4 h-4 text-yellow-500" />
                  <span className="text-xs text-neutral-400 uppercase tracking-wider">Longest</span>
                </div>
                <span className="text-2xl font-bold text-yellow-400">{streak.longestStreak}</span>
              </div>
              <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700">
                <div className="flex items-center space-x-2 mb-1">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span className="text-xs text-neutral-400 uppercase tracking-wider">Total Days</span>
                </div>
                <span className="text-2xl font-bold text-blue-400">{streak.practiceDates.length}</span>
              </div>
            </div>

            {/* Milestones */}
            <div className="mb-6 flex items-center space-x-3">
              <span className="text-sm font-medium text-neutral-400">Milestones:</span>
              <div className={`px-3 py-1 rounded-full text-xs font-bold ${streak.milestones.sevenDays ? 'bg-green-500/20 text-green-400' : 'bg-neutral-800 text-neutral-600'}`}>
                {streak.milestones.sevenDays ? '✓' : ''} 7 Days
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-bold ${streak.milestones.thirtyDays ? 'bg-orange-500/20 text-orange-400' : 'bg-neutral-800 text-neutral-600'}`}>
                {streak.milestones.thirtyDays ? '✓' : ''} 30 Days
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-bold ${streak.milestones.hundredDays ? 'bg-purple-500/20 text-purple-400' : 'bg-neutral-800 text-neutral-600'}`}>
                {streak.milestones.hundredDays ? '✓' : ''} 100 Days
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-2">
              {calendar.map((day, idx) => {
                const date = new Date(day.date);
                const dayNum = date.getDate();
                const isToday = day.date === new Date().toISOString().split('T')[0];

                return (
                  <div
                    key={idx}
                    className={`aspect-square flex flex-col items-center justify-center rounded-lg border transition-all ${
                      day.practiced
                        ? 'bg-green-500/20 border-green-500/50 text-green-400'
                        : 'bg-neutral-800/30 border-neutral-700 text-neutral-600'
                    } ${isToday ? 'ring-2 ring-red-500' : ''}`}
                  >
                    <span className="text-[10px] font-medium uppercase">{day.dayOfWeek}</span>
                    <span className="text-lg font-bold">{dayNum}</span>
                    {day.practiced && <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-0.5" />}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-6 flex items-center justify-center space-x-6 text-xs text-neutral-400">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500/20 border border-green-500/50 rounded" />
                <span>Practiced</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-neutral-800/30 border border-neutral-700 rounded" />
                <span>Missed</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 border-2 border-red-500 rounded" />
                <span>Today</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default StreakCounter;
