import React, { useEffect, useState } from 'react';

interface SparklesProps {
  show: boolean;
  intensity?: 'low' | 'medium' | 'high';
}

interface Sparkle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
}

const Sparkles: React.FC<SparklesProps> = ({ show, intensity = 'medium' }) => {
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);

  useEffect(() => {
    if (!show) {
      setSparkles([]);
      return;
    }

    // Determine number of sparkles based on intensity
    const sparkleCount =
      intensity === 'low' ? 15 :
      intensity === 'medium' ? 30 :
      50;

    // Generate sparkles
    const newSparkles: Sparkle[] = Array.from({ length: sparkleCount }, (_, i) => {
      // Position sparkles in a circular pattern radiating from center
      const angle = (Math.PI * 2 * i) / sparkleCount + Math.random() * 0.5;
      const distance = 100 + Math.random() * 200; // Distance from center
      const centerX = 50; // Percentage
      const centerY = 50; // Percentage

      const x = centerX + Math.cos(angle) * (distance / 10); // Convert to percentage
      const y = centerY + Math.sin(angle) * (distance / 10); // Convert to percentage

      return {
        id: i,
        x,
        y,
        size: Math.random() * 8 + 4,
        delay: Math.random() * 500,
        duration: 800 + Math.random() * 400,
      };
    });

    setSparkles(newSparkles);

    // Clean up after animation completes (max duration + max delay)
    const timeout = setTimeout(() => {
      setSparkles([]);
    }, 2000);

    return () => {
      clearTimeout(timeout);
    };
  }, [show, intensity]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden" aria-hidden="true">
      {sparkles.map((sparkle) => (
        <div
          key={sparkle.id}
          className="absolute sparkle"
          style={{
            left: `${sparkle.x}%`,
            top: `${sparkle.y}%`,
            width: `${sparkle.size}px`,
            height: `${sparkle.size}px`,
            animationDelay: `${sparkle.delay}ms`,
            animationDuration: `${sparkle.duration}ms`,
          }}
        >
          {/* Star shape using CSS */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full"
          >
            <path
              d="M12 2L14.09 8.26L20 9.27L15.18 13.14L16.18 19.02L12 15.77L7.82 19.02L8.82 13.14L4 9.27L9.91 8.26L12 2Z"
              fill="url(#gold-gradient)"
              className="drop-shadow-[0_0_4px_rgba(255,215,0,0.8)]"
            />
            <defs>
              <linearGradient id="gold-gradient" x1="12" y1="2" x2="12" y2="19.02" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#FFD700" />
                <stop offset="50%" stopColor="#FFA500" />
                <stop offset="100%" stopColor="#FF8C00" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      ))}

      <style>{`
        @keyframes sparkle-animation {
          0% {
            opacity: 0;
            transform: scale(0) rotate(0deg);
          }
          50% {
            opacity: 1;
            transform: scale(1) rotate(180deg);
          }
          100% {
            opacity: 0;
            transform: scale(0.5) rotate(360deg);
          }
        }

        .sparkle {
          animation: sparkle-animation 1s ease-in-out forwards;
        }
      `}</style>
    </div>
  );
};

export default Sparkles;
