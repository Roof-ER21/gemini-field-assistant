
import React, { useEffect, useRef } from 'react';

interface AgnesAvatarProps {
  isActive: boolean;
  isListening: boolean;
  analyser: AnalyserNode | null;
}

const AgnesAvatar: React.FC<AgnesAvatarProps> = ({ isActive, isListening, analyser }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set high resolution
    const size = 300;
    canvas.width = size * 2;
    canvas.height = size * 2;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(2, 2);

    const dataArray = new Uint8Array(analyser ? analyser.frequencyBinCount : 0);

    let frame = 0;

    const render = () => {
      frame++;
      ctx.clearRect(0, 0, size, size);

      // Get Audio Data if active
      let averageVolume = 0;
      if (isActive && analyser) {
        analyser.getByteFrequencyData(dataArray);
        // Calculate average volume from a portion of the spectrum
        let sum = 0;
        const binCount = dataArray.length;
        for (let i = 0; i < binCount; i++) {
          sum += dataArray[i];
        }
        averageVolume = sum / binCount;
      }

      const centerX = size / 2;
      const centerY = size / 2;
      
      // Normalize volume for animation (0 to 1)
      const intensity = Math.min(1, averageVolume / 100); 
      const pulse = isActive ? 1 + (intensity * 0.4) : 1 + Math.sin(frame * 0.05) * 0.05;

      // --- LAYER 1: OUTER RING (Static / Rotating) ---
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(frame * 0.005);
      ctx.beginPath();
      ctx.arc(0, 0, 110, 0, Math.PI * 2);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Dashed Ring
      ctx.rotate(frame * -0.01);
      ctx.beginPath();
      ctx.setLineDash([10, 20]);
      ctx.arc(0, 0, 125 + (intensity * 10), 0, Math.PI * 2);
      ctx.strokeStyle = isActive ? '#7f1d1d' : '#262626'; // Red-900 vs Neutral-800
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // --- LAYER 2: THE IRIS (Reacts to Sound) ---
      ctx.save();
      ctx.translate(centerX, centerY);
      
      // Jitter effect when speaking loud
      if (isActive && intensity > 0.3) {
         ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
      }

      // Main Glow
      const gradient = ctx.createRadialGradient(0, 0, 10, 0, 0, 80 * pulse);
      if (isActive) {
        gradient.addColorStop(0, '#ffffff'); // Hot center
        gradient.addColorStop(0.3, '#ef4444'); // Red mid
        gradient.addColorStop(1, 'rgba(220, 38, 38, 0)'); // Fade out
      } else if (isListening) {
        // Calm Blue/White pulse when listening
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.4, '#525252'); 
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
      } else {
        // Dormant
        gradient.addColorStop(0, '#333');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
      }
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, 80 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Inner Tech Circle (The "Pupil")
      ctx.beginPath();
      ctx.arc(0, 0, 30 * (isActive ? (0.8 + intensity) : 1), 0, Math.PI * 2);
      ctx.fillStyle = isActive ? '#000' : '#171717';
      ctx.fill();
      ctx.strokeStyle = isActive ? '#fff' : '#555';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();

      // --- LAYER 3: INTERFACE ELEMENTS ---
      // Scanning lines if listening
      if (isListening && !isActive) {
         ctx.save();
         ctx.globalAlpha = 0.3;
         const scanY = (frame * 2) % size;
         ctx.fillStyle = '#fff';
         ctx.fillRect(0, scanY, size, 2);
         ctx.restore();
      }

      // Waveform Ring (Data visualization around core)
      if (isActive && analyser) {
         ctx.save();
         ctx.translate(centerX, centerY);
         ctx.beginPath();
         const radius = 90;
         for (let i = 0; i < dataArray.length; i+=4) { // Skip some for performance
            const v = dataArray[i] / 128.0;
            const angle = (i / dataArray.length) * Math.PI * 2;
            const r = radius + (v * 20);
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
         }
         ctx.closePath();
         ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)'; // Red-500 transparent
         ctx.lineWidth = 1;
         ctx.stroke();
         ctx.restore();
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, isListening, analyser]);

  return (
    <div className="relative flex flex-col items-center justify-center">
      {/* Holographic container effect */}
      <div className="relative rounded-full p-1 border border-neutral-800 bg-black/50 shadow-[0_0_50px_rgba(220,38,38,0.1)]">
         <canvas ref={canvasRef} className="rounded-full opacity-90" />
      </div>
      
      {/* Label */}
      <div className="absolute -bottom-8 flex flex-col items-center">
        <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-red-500">Agnes 21</span>
        <span className={`text-[9px] font-mono tracking-widest uppercase mt-1 transition-all duration-300 ${isActive ? 'text-white opacity-100' : 'text-neutral-600 opacity-0'}`}>
           {isActive ? 'TRANSMITTING' : 'STANDBY'}
        </span>
      </div>
    </div>
  );
};

export default AgnesAvatar;
