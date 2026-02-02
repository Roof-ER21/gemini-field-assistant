import React, { useEffect, useState } from 'react';
import { Mic } from 'lucide-react';

interface MicLevelMeterProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
}

const MicLevelMeter: React.FC<MicLevelMeterProps> = ({ analyser, isActive }) => {
  const [micLevel, setMicLevel] = useState<number>(0);

  useEffect(() => {
    if (!analyser || !isActive) {
      setMicLevel(0);
      return;
    }

    let animationFrameId: number;

    const updateMicLevel = () => {
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);

      // Calculate average volume (0-255)
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

      // Convert to 0-100 scale
      const normalizedLevel = Math.min(100, Math.round((average / 255) * 100));

      setMicLevel(normalizedLevel);
      animationFrameId = requestAnimationFrame(updateMicLevel);
    };

    updateMicLevel();

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [analyser, isActive]);

  const getMeterColor = (): string => {
    if (micLevel < 10) return 'bg-red-500';
    if (micLevel > 90) return 'bg-orange-500';
    return 'bg-green-500';
  };

  const getWarningMessage = (): string | null => {
    if (micLevel < 10 && isActive) return 'Speak louder';
    if (micLevel > 90) return 'Too loud';
    return null;
  };

  const warningMessage = getWarningMessage();

  return (
    <div className="flex flex-col items-center space-y-2 w-full max-w-xs">
      {/* Meter Bar */}
      <div className="w-full bg-neutral-800 rounded-full h-3 overflow-hidden border border-neutral-700 shadow-inner">
        <div
          className={`h-full ${getMeterColor()} transition-all duration-150 ease-out shadow-lg`}
          style={{ width: `${micLevel}%` }}
        />
      </div>

      {/* Info Row */}
      <div className="flex items-center justify-between w-full text-xs">
        <div className="flex items-center space-x-2 text-neutral-400">
          <Mic className="w-3 h-3" />
          <span className="font-mono">MIC LEVEL</span>
        </div>
        <span className={`font-mono font-bold ${
          micLevel < 10 ? 'text-red-400' :
          micLevel > 90 ? 'text-orange-400' :
          'text-green-400'
        }`}>
          {micLevel}
        </span>
      </div>

      {/* Warning Messages */}
      {warningMessage && (
        <div className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider animate-pulse ${
          micLevel < 10 ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
          'bg-orange-500/20 text-orange-400 border border-orange-500/30'
        }`}>
          {micLevel < 10 && '🔇 '}
          {micLevel > 90 && '📢 '}
          {warningMessage.toUpperCase()}
        </div>
      )}
    </div>
  );
};

export default MicLevelMeter;
