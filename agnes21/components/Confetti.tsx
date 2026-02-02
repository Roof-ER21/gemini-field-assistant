import React, { useEffect, useRef } from 'react';

interface ConfettiProps {
  show: boolean;
  onComplete?: () => void;
}

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  size: number;
  opacity: number;
}

const COLORS = [
  '#FF0000', // Red (Agnes theme)
  '#FFD700', // Gold
  '#FF6B6B', // Light red
  '#FFA500', // Orange
  '#FFFF00', // Yellow
  '#FF1493', // Deep pink
  '#FF4500', // Orange red
  '#FFB800', // Amber
];

const Confetti: React.FC<ConfettiProps> = ({ show, onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<ConfettiParticle[]>([]);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!show) {
      // Clean up
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      particlesRef.current = [];

      // Clear canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize particles
    const particleCount = 80;
    particlesRef.current = Array.from({ length: particleCount }, () => {
      const x = Math.random() * canvas.width;
      const y = -20 - Math.random() * 100; // Start above screen
      const vx = (Math.random() - 0.5) * 4; // Horizontal velocity
      const vy = Math.random() * 3 + 2; // Falling speed
      const rotation = Math.random() * 360;
      const rotationSpeed = (Math.random() - 0.5) * 10;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const size = Math.random() * 8 + 4;
      const opacity = 1;

      return { x, y, vx, vy, rotation, rotationSpeed, color, size, opacity };
    });

    startTimeRef.current = Date.now();

    // Animation loop
    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const duration = 3000; // 3 seconds

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach((particle) => {
        // Update position
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.rotation += particle.rotationSpeed;
        particle.vy += 0.1; // Gravity

        // Fade out in last 500ms
        if (elapsed > duration - 500) {
          particle.opacity = Math.max(0, 1 - (elapsed - (duration - 500)) / 500);
        }

        // Draw particle
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate((particle.rotation * Math.PI) / 180);
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = particle.color;

        // Draw confetti as rectangles
        ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);

        ctx.restore();
      });

      if (elapsed < duration) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete
        if (onComplete) {
          onComplete();
        }
      }
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [show, onComplete]);

  if (!show) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[100]"
      aria-hidden="true"
    />
  );
};

export default Confetti;
