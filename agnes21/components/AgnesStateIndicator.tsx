import React from 'react';
import { Mic, Brain, MessageCircle, Award } from 'lucide-react';

enum AgnesState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  SCORING = 'SCORING',
  RESPONDING = 'RESPONDING'
}

interface AgnesStateIndicatorProps {
  state: AgnesState;
  className?: string;
}

const AgnesStateIndicator: React.FC<AgnesStateIndicatorProps> = ({ state, className = '' }) => {
  const getStateConfig = () => {
    switch (state) {
      case AgnesState.LISTENING:
        return {
          icon: <Mic className="w-4 h-4" />,
          text: 'Agnes is listening...',
          color: 'text-blue-400',
          bgColor: 'bg-blue-500/20',
          borderColor: 'border-blue-500/30',
          pulseColor: 'bg-blue-500',
          emoji: '🎤'
        };
      case AgnesState.THINKING:
        return {
          icon: <Brain className="w-4 h-4" />,
          text: 'Agnes is thinking...',
          color: 'text-purple-400',
          bgColor: 'bg-purple-500/20',
          borderColor: 'border-purple-500/30',
          pulseColor: 'bg-purple-500',
          emoji: '💭'
        };
      case AgnesState.SCORING:
        return {
          icon: <Award className="w-4 h-4" />,
          text: 'Scoring your pitch...',
          color: 'text-yellow-400',
          bgColor: 'bg-yellow-500/20',
          borderColor: 'border-yellow-500/30',
          pulseColor: 'bg-yellow-500',
          emoji: '🎯'
        };
      case AgnesState.RESPONDING:
        return {
          icon: <MessageCircle className="w-4 h-4" />,
          text: 'Agnes is responding...',
          color: 'text-red-400',
          bgColor: 'bg-red-500/20',
          borderColor: 'border-red-500/30',
          pulseColor: 'bg-red-500',
          emoji: '🗣️'
        };
      case AgnesState.IDLE:
      default:
        return {
          icon: <div className="w-4 h-4 rounded-full bg-neutral-600" />,
          text: 'Agnes is idle',
          color: 'text-neutral-500',
          bgColor: 'bg-neutral-800/50',
          borderColor: 'border-neutral-700',
          pulseColor: 'bg-neutral-600',
          emoji: '⏸️'
        };
    }
  };

  const config = getStateConfig();

  return (
    <>
      <div className={`flex items-center space-x-3 px-4 py-2 rounded-full ${config.bgColor} border ${config.borderColor} backdrop-blur-sm transition-all duration-300 ${className}`}>
        {/* Animated Pulse Dot */}
        {state !== AgnesState.IDLE && (
          <div className="relative flex items-center justify-center">
            <div className={`absolute w-3 h-3 ${config.pulseColor} rounded-full animate-ping opacity-75`} />
            <div className={`w-2 h-2 ${config.pulseColor} rounded-full`} />
          </div>
        )}

        {/* Icon */}
        <div className={config.color}>
          {config.icon}
        </div>

        {/* Text */}
        <span className={`text-sm font-medium tracking-wide ${config.color}`}>
          <span className="mr-1">{config.emoji}</span>
          {config.text}
        </span>
      </div>
      {/* ARIA Live Region for State Changes */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {config.text}
      </div>
    </>
  );
};

export { AgnesState };
export default AgnesStateIndicator;
