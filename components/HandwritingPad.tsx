/**
 * HandwritingPad — Canvas-based finger-drawing input for deaf communication.
 *
 * Lets a deaf homeowner draw letters/words with their finger on the phone
 * screen when quick-tap responses don't cover what they want to say.
 *
 * Features:
 *   - Touch/mouse drawing on a canvas
 *   - Clear button to reset
 *   - Submit sends the canvas image for text extraction (Gemini vision)
 *   - Undo last stroke
 *   - High contrast (white lines on dark background)
 *   - Large touch-friendly controls
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Eraser, Send, Undo2, X } from 'lucide-react';

interface HandwritingPadProps {
  /** Called when the user submits their handwriting */
  onSubmit: (text: string) => void;
  /** Called when the user closes the pad */
  onClose: () => void;
  /** Optional: Gemini API key for handwriting recognition */
  apiKey?: string;
}

interface Stroke {
  points: { x: number; y: number }[];
}

const HandwritingPad: React.FC<HandwritingPadProps> = ({ onSubmit, onClose, apiKey }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [recognizedText, setRecognizedText] = useState('');
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  // Setup canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;

    // Draw guide lines
    drawGuideLines(ctx, rect.width, rect.height);
  }, []);

  const drawGuideLines = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;

    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Bottom third line (baseline guide)
    ctx.beginPath();
    ctx.moveTo(0, height * 0.7);
    ctx.lineTo(width, height * 0.7);
    ctx.stroke();

    ctx.restore();
  };

  const redrawCanvas = useCallback((strokeList: Stroke[], current: Stroke | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();

    // Clear
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Guide lines
    drawGuideLines(ctx, rect.width, rect.height);

    // Draw all saved strokes
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of strokeList) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }

    // Draw current stroke
    if (current && current.points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(current.points[0].x, current.points[0].y);
      for (let i = 1; i < current.points.length; i++) {
        ctx.lineTo(current.points[i].x, current.points[i].y);
      }
      ctx.stroke();
    }
  }, []);

  // Get position from touch or mouse event
  const getPosition = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      const touch = e.touches[0];
      if (!touch) return null;
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }

    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  };

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const pos = getPosition(e);
    if (!pos) return;

    setIsDrawing(true);
    setCurrentStroke({ points: [pos] });
  };

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing || !currentStroke) return;

    const pos = getPosition(e);
    if (!pos) return;

    const updated = { points: [...currentStroke.points, pos] };
    setCurrentStroke(updated);
    redrawCanvas(strokes, updated);
  };

  const handleEnd = () => {
    if (!isDrawing || !currentStroke) return;

    setIsDrawing(false);
    if (currentStroke.points.length > 1) {
      setStrokes(prev => [...prev, currentStroke]);
      setHasContent(true);
    }
    setCurrentStroke(null);
    redrawCanvas([...strokes, currentStroke], null);
  };

  const handleUndo = () => {
    setStrokes(prev => {
      const updated = prev.slice(0, -1);
      setHasContent(updated.length > 0);
      redrawCanvas(updated, null);
      return updated;
    });
  };

  const handleClear = () => {
    setStrokes([]);
    setCurrentStroke(null);
    setHasContent(false);
    setRecognizedText('');

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    drawGuideLines(ctx, rect.width, rect.height);
  };

  const handleSubmit = async () => {
    if (!hasContent) return;

    // If we have recognized text, submit it directly
    if (recognizedText) {
      onSubmit(recognizedText);
      handleClear();
      return;
    }

    // Try to recognize via Gemini Vision
    if (apiKey) {
      setIsRecognizing(true);
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];

        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey });

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{
            role: 'user',
            parts: [
              {
                text: 'This is a handwritten message from a deaf person. Read the handwriting and respond with ONLY the text they wrote. If you cannot read it, respond with "[unreadable]". Do not add any commentary.',
              },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: base64,
                },
              },
            ],
          }],
        });

        const text = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text && text !== '[unreadable]') {
          setRecognizedText(text);
          onSubmit(text);
          handleClear();
        } else {
          setRecognizedText('[Could not read handwriting]');
        }
      } catch (err) {
        console.error('[HandwritingPad] Recognition error:', err);
        setRecognizedText('[Recognition failed]');
      } finally {
        setIsRecognizing(false);
      }
    } else {
      // No API key — submit as image description
      onSubmit('[Handwritten message]');
      handleClear();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <span style={{ color: '#fff', fontSize: '18px', fontWeight: 600 }}>
          Write your message
        </span>
        <button
          onClick={onClose}
          aria-label="Close handwriting pad"
          style={{
            background: 'none',
            border: 'none',
            color: '#999',
            cursor: 'pointer',
            padding: '8px',
          }}
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Recognized text preview */}
      {recognizedText && (
        <div
          style={{
            padding: '8px 16px',
            background: 'rgba(34, 197, 94, 0.1)',
            borderBottom: '1px solid rgba(34, 197, 94, 0.2)',
            color: '#22c55e',
            fontSize: '16px',
          }}
        >
          Recognized: <strong>{recognizedText}</strong>
        </div>
      )}

      {/* Canvas */}
      <div style={{ flex: 1, padding: '8px', position: 'relative' }}>
        <canvas
          ref={canvasRef}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '12px',
            border: '2px solid rgba(255,255,255,0.15)',
            background: '#111',
            touchAction: 'none',
            cursor: 'crosshair',
          }}
          aria-label="Handwriting canvas — draw your message here"
        />

        {!hasContent && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'rgba(255,255,255,0.25)',
              fontSize: '20px',
              pointerEvents: 'none',
              textAlign: 'center',
            }}
          >
            Draw your message here
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          padding: '12px 16px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <button
          onClick={handleUndo}
          disabled={strokes.length === 0}
          aria-label="Undo last stroke"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '14px',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.05)',
            color: strokes.length === 0 ? '#555' : '#fff',
            fontSize: '15px',
            fontWeight: 500,
            cursor: strokes.length === 0 ? 'default' : 'pointer',
          }}
        >
          <Undo2 className="w-5 h-5" />
          Undo
        </button>

        <button
          onClick={handleClear}
          disabled={!hasContent}
          aria-label="Clear drawing"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '14px',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.05)',
            color: !hasContent ? '#555' : '#fff',
            fontSize: '15px',
            fontWeight: 500,
            cursor: !hasContent ? 'default' : 'pointer',
          }}
        >
          <Eraser className="w-5 h-5" />
          Clear
        </button>

        <button
          onClick={handleSubmit}
          disabled={!hasContent || isRecognizing}
          aria-label="Submit handwriting"
          style={{
            flex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '14px',
            borderRadius: '10px',
            border: 'none',
            background: hasContent && !isRecognizing ? '#b60807' : '#333',
            color: '#fff',
            fontSize: '16px',
            fontWeight: 600,
            cursor: hasContent && !isRecognizing ? 'pointer' : 'default',
          }}
        >
          <Send className="w-5 h-5" />
          {isRecognizing ? 'Reading...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default HandwritingPad;
