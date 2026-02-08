/**
 * SignaturePad - Canvas-based signature capture component
 * Supports touch (iPad/mobile) and mouse input
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Trash2, RotateCcw, Check } from 'lucide-react';

interface SignaturePadProps {
  width?: number;
  height?: number;
  lineColor?: string;
  lineWidth?: number;
  backgroundColor?: string;
  onSignatureChange?: (signatureDataUrl: string | null) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  width = 500,
  height = 200,
  lineColor = '#1f2937',
  lineWidth = 2,
  backgroundColor = '#ffffff',
  onSignatureChange,
  label = 'Sign Here',
  required = false,
  disabled = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size with device pixel ratio for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Set drawing styles
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }, [width, height, lineColor, lineWidth, backgroundColor]);

  // Get coordinates from event
  const getCoordinates = useCallback((e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    let x: number, y: number;

    if ('touches' in e) {
      // Touch event
      const touch = e.touches[0] || e.changedTouches[0];
      x = touch.clientX - rect.left;
      y = touch.clientY - rect.top;
    } else {
      // Mouse event
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    return { x, y };
  }, []);

  // Start drawing
  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();

    const coords = getCoordinates(e);
    setIsDrawing(true);
    setLastPoint(coords);
  }, [disabled, getCoordinates]);

  // Draw
  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !lastPoint) return;

    const coords = getCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    setLastPoint(coords);
    setHasSignature(true);
  }, [isDrawing, disabled, lastPoint, getCoordinates]);

  // Stop drawing
  const stopDrawing = useCallback(() => {
    if (isDrawing && hasSignature) {
      // Notify parent of signature change
      const canvas = canvasRef.current;
      if (canvas && onSignatureChange) {
        onSignatureChange(canvas.toDataURL('image/png'));
      }
    }
    setIsDrawing(false);
    setLastPoint(null);
  }, [isDrawing, hasSignature, onSignatureChange]);

  // Clear signature
  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    setHasSignature(false);

    if (onSignatureChange) {
      onSignatureChange(null);
    }
  }, [backgroundColor, width, height, onSignatureChange]);

  // Get signature data URL
  const getSignatureDataUrl = useCallback((): string | null => {
    if (!hasSignature) return null;
    const canvas = canvasRef.current;
    return canvas ? canvas.toDataURL('image/png') : null;
  }, [hasSignature]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      opacity: disabled ? 0.5 : 1
    }}>
      {/* Label */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <label style={{
          fontSize: '14px',
          fontWeight: '600',
          color: '#374151',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          {label}
          {required && <span style={{ color: '#DC2626' }}>*</span>}
        </label>

        {/* Status indicator */}
        {hasSignature && (
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            fontWeight: '500',
            color: '#16A34A'
          }}>
            <Check size={14} />
            Signed
          </span>
        )}
      </div>

      {/* Canvas Container */}
      <div style={{
        position: 'relative',
        border: hasSignature ? '2px solid #16A34A' : '2px dashed #D1D5DB',
        borderRadius: '12px',
        overflow: 'hidden',
        background: backgroundColor,
        cursor: disabled ? 'not-allowed' : 'crosshair'
      }}>
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{
            display: 'block',
            touchAction: 'none' // Prevent scrolling while drawing
          }}
        />

        {/* Placeholder text */}
        {!hasSignature && !disabled && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            color: '#9CA3AF',
            fontSize: '16px',
            fontStyle: 'italic'
          }}>
            Sign here with your finger or mouse
          </div>
        )}

        {/* Clear button */}
        {hasSignature && !disabled && (
          <button
            onClick={clearSignature}
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.9)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              transition: 'transform 0.1s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Signature line */}
      <div style={{
        borderTop: '1px solid #374151',
        marginTop: '-40px',
        marginLeft: '16px',
        marginRight: '16px',
        paddingTop: '4px',
        position: 'relative',
        pointerEvents: 'none'
      }}>
        <span style={{
          position: 'absolute',
          top: '4px',
          left: '0',
          fontSize: '10px',
          color: '#6B7280',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          X
        </span>
      </div>
    </div>
  );
};

export default SignaturePad;
