import React from 'react';

interface WaveformProps {
  isActive: boolean;
  color: string; // Tailwind class prefix e.g. 'bg-blue-500'
  label: string;
}

const Waveform: React.FC<WaveformProps> = ({ isActive, color, label }) => {
  return (
    <div className="flex flex-col items-center justify-center space-y-3">
      <style>
        {`
          @keyframes bar-dance {
            0%, 100% { height: 20%; transform: scaleY(1); }
            50% { height: 80%; transform: scaleY(1.1); }
          }
          .animate-bar {
             animation: bar-dance 0.5s ease-in-out infinite;
          }
        `}
      </style>
      <div className={`flex items-end justify-center space-x-1.5 h-16 w-32 transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-50'}`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`w-2.5 rounded-full ${color} ${isActive ? 'animate-bar shadow-[0_0_10px_currentColor]' : ''}`}
            style={{
              height: isActive ? undefined : '20%',
              animationDuration: `${0.4 + (i % 3) * 0.15}s`,
              animationDelay: `${i * 0.05}s`
            }}
          />
        ))}
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-neutral-500">{label}</span>
        <span className={`text-[9px] font-mono tracking-widest uppercase mt-1 transition-all duration-300 ${isActive ? 'text-red-500 opacity-100' : 'opacity-0 h-0'}`}>
           {isActive ? 'SPEAKING' : ''}
        </span>
      </div>
    </div>
  );
};

export default Waveform;