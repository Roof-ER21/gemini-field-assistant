/**
 * DamageAnnotationOverlay - Canvas-based damage annotation renderer
 * Draws circles, arrows, and labels on photos to highlight damage
 * Supports interactive editing: drag, resize, add, delete
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { DamageRegion, DamageAnnotation } from './NewInspectionFlow';

// ============================================================================
// TYPES
// ============================================================================

interface DamageAnnotationOverlayProps {
  imageUrl: string;
  regions: DamageRegion[];
  annotations: DamageAnnotation[];
  onRegionsChange?: (regions: DamageRegion[]) => void;
  onAnnotationsChange?: (annotations: DamageAnnotation[]) => void;
  editable?: boolean;
  showLabels?: boolean;
  annotationColor?: string;
  selectedTool?: 'select' | 'circle' | 'arrow' | null;
  onToolComplete?: () => void;
}

interface Point {
  x: number;
  y: number;
}

type SelectedItem = {
  type: 'region' | 'annotation';
  id: string;
} | null;

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_COLOR = '#c41e3a'; // ROOF-ER red
const HANDLE_SIZE = 10;
const MIN_RADIUS = 0.02;
const DEFAULT_RADIUS = 0.06;

// ============================================================================
// COMPONENT
// ============================================================================

export const DamageAnnotationOverlay: React.FC<DamageAnnotationOverlayProps> = ({
  imageUrl,
  regions,
  annotations,
  onRegionsChange,
  onAnnotationsChange,
  editable = false,
  showLabels = true,
  annotationColor = DEFAULT_COLOR,
  selectedTool = null,
  onToolComplete
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Load image and set dimensions
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);

      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const aspectRatio = img.height / img.width;
        const height = containerWidth * aspectRatio;
        setDimensions({ width: containerWidth, height });
      }
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && imageRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const aspectRatio = imageRef.current.height / imageRef.current.width;
        setDimensions({ width: containerWidth, height: containerWidth * aspectRatio });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Draw everything on canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;

    if (!canvas || !ctx || !img || !imageLoaded) return;

    const { width, height } = dimensions;
    if (width === 0 || height === 0) return;

    // Set canvas size with device pixel ratio for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Draw image
    ctx.drawImage(img, 0, 0, width, height);

    // Setup drawing style
    ctx.strokeStyle = annotationColor;
    ctx.fillStyle = annotationColor;
    ctx.lineWidth = 3;
    ctx.font = 'bold 14px Arial';
    ctx.textBaseline = 'middle';

    // Draw damage regions (circles)
    regions.forEach(region => {
      const x = region.x * width;
      const y = region.y * height;
      const r = (region.radius || DEFAULT_RADIUS) * Math.min(width, height);

      // Draw circle
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();

      // Highlight if selected
      if (selectedItem?.type === 'region' && selectedItem.id === region.id) {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, r + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = annotationColor;

        // Draw resize handle if editable
        if (editable) {
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = annotationColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x + r, y, HANDLE_SIZE / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.lineWidth = 3;
        }
      }

      // Draw label
      if (showLabels && region.label) {
        const labelX = x + r + 12;
        const labelY = y;

        // Label background
        const metrics = ctx.measureText(region.label);
        const padding = 6;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(
          labelX - padding,
          labelY - 10 - padding,
          metrics.width + padding * 2,
          20 + padding
        );

        // Label text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(region.label, labelX, labelY);
        ctx.fillStyle = annotationColor;
      }
    });

    // Draw annotations (arrows)
    annotations.forEach(anno => {
      if (anno.type === 'arrow' && anno.toX !== undefined && anno.toY !== undefined) {
        const fromX = anno.fromX * width;
        const fromY = anno.fromY * height;
        const toX = anno.toX * width;
        const toY = anno.toY * height;

        drawArrow(ctx, fromX, fromY, toX, toY, annotationColor);

        // Highlight if selected
        if (selectedItem?.type === 'annotation' && selectedItem.id === anno.id) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(fromX, fromY, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(toX, toY, 6, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw label at arrow start
        if (showLabels && anno.label) {
          const metrics = ctx.measureText(anno.label);
          const padding = 4;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.fillRect(
            fromX - metrics.width / 2 - padding,
            fromY - 30 - padding,
            metrics.width + padding * 2,
            20 + padding
          );
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(anno.label, fromX, fromY - 20);
          ctx.textAlign = 'left';
        }
      }
    });

  }, [dimensions, regions, annotations, imageLoaded, annotationColor, showLabels, selectedItem, editable]);

  // Redraw when dependencies change
  useEffect(() => {
    draw();
  }, [draw]);

  // Arrow drawing helper
  const drawArrow = (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color: string
  ) => {
    const headLen = 15;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;

    // Line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLen * Math.cos(angle - Math.PI / 6),
      toY - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      toX - headLen * Math.cos(angle + Math.PI / 6),
      toY - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  };

  // Get normalized coordinates from mouse event
  const getNormalizedCoords = (e: React.MouseEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / dimensions.width;
    const y = (e.clientY - rect.top) / dimensions.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  // Find item at point
  const findItemAtPoint = (point: Point): SelectedItem => {
    const { width, height } = dimensions;

    // Check regions
    for (const region of regions) {
      const dx = point.x - region.x;
      const dy = point.y - region.y;
      const r = region.radius || DEFAULT_RADIUS;
      const normalizedDist = Math.sqrt(dx * dx + dy * dy);

      if (normalizedDist <= r * 1.2) {
        return { type: 'region', id: region.id };
      }
    }

    // Check annotations
    for (const anno of annotations) {
      if (anno.type === 'arrow' && anno.toX !== undefined && anno.toY !== undefined) {
        // Check if near start or end point
        const distToStart = Math.sqrt(
          Math.pow(point.x - anno.fromX, 2) + Math.pow(point.y - anno.fromY, 2)
        );
        const distToEnd = Math.sqrt(
          Math.pow(point.x - anno.toX, 2) + Math.pow(point.y - anno.toY, 2)
        );

        if (distToStart < 0.05 || distToEnd < 0.05) {
          return { type: 'annotation', id: anno.id };
        }
      }
    }

    return null;
  };

  // Check if clicking resize handle
  const isOnResizeHandle = (point: Point, region: DamageRegion): boolean => {
    const r = region.radius || DEFAULT_RADIUS;
    const handleX = region.x + r;
    const handleY = region.y;
    const dist = Math.sqrt(Math.pow(point.x - handleX, 2) + Math.pow(point.y - handleY, 2));
    return dist < 0.03;
  };

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!editable) return;

    const point = getNormalizedCoords(e);

    // If using a tool, create new item
    if (selectedTool === 'circle') {
      const newRegion: DamageRegion = {
        id: `region_${Date.now()}`,
        type: 'hail_impact',
        shape: 'circle',
        x: point.x,
        y: point.y,
        radius: DEFAULT_RADIUS,
        label: 'Damage',
        confidence: 1.0
      };
      onRegionsChange?.([...regions, newRegion]);
      setSelectedItem({ type: 'region', id: newRegion.id });
      onToolComplete?.();
      return;
    }

    if (selectedTool === 'arrow') {
      setDragStart(point);
      return;
    }

    // Otherwise, select/drag existing items
    const item = findItemAtPoint(point);
    setSelectedItem(item);

    if (item) {
      // Check for resize handle on regions
      if (item.type === 'region') {
        const region = regions.find(r => r.id === item.id);
        if (region && isOnResizeHandle(point, region)) {
          setIsResizing(true);
        } else {
          setIsDragging(true);
        }
      } else {
        setIsDragging(true);
      }
      setDragStart(point);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!editable || !dragStart) return;

    const point = getNormalizedCoords(e);

    // Creating arrow - show preview (handled in draw)
    if (selectedTool === 'arrow') {
      // Could add preview here
      return;
    }

    if (isDragging && selectedItem) {
      const dx = point.x - dragStart.x;
      const dy = point.y - dragStart.y;

      if (selectedItem.type === 'region') {
        const updated = regions.map(r => {
          if (r.id === selectedItem.id) {
            return {
              ...r,
              x: Math.max(0.05, Math.min(0.95, r.x + dx)),
              y: Math.max(0.05, Math.min(0.95, r.y + dy))
            };
          }
          return r;
        });
        onRegionsChange?.(updated);
      } else if (selectedItem.type === 'annotation') {
        const updated = annotations.map(a => {
          if (a.id === selectedItem.id) {
            return {
              ...a,
              fromX: Math.max(0, Math.min(1, a.fromX + dx)),
              fromY: Math.max(0, Math.min(1, a.fromY + dy)),
              toX: a.toX !== undefined ? Math.max(0, Math.min(1, a.toX + dx)) : undefined,
              toY: a.toY !== undefined ? Math.max(0, Math.min(1, a.toY + dy)) : undefined
            };
          }
          return a;
        });
        onAnnotationsChange?.(updated);
      }

      setDragStart(point);
    }

    if (isResizing && selectedItem?.type === 'region') {
      const region = regions.find(r => r.id === selectedItem.id);
      if (region) {
        const dx = point.x - region.x;
        const dy = point.y - region.y;
        const newRadius = Math.max(MIN_RADIUS, Math.sqrt(dx * dx + dy * dy));

        const updated = regions.map(r => {
          if (r.id === selectedItem.id) {
            return { ...r, radius: newRadius };
          }
          return r;
        });
        onRegionsChange?.(updated);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (selectedTool === 'arrow' && dragStart) {
      const point = getNormalizedCoords(e);
      const dist = Math.sqrt(
        Math.pow(point.x - dragStart.x, 2) + Math.pow(point.y - dragStart.y, 2)
      );

      // Only create arrow if dragged enough
      if (dist > 0.05) {
        const newAnnotation: DamageAnnotation = {
          id: `arrow_${Date.now()}`,
          type: 'arrow',
          fromX: dragStart.x,
          fromY: dragStart.y,
          toX: point.x,
          toY: point.y,
          label: 'Damage'
        };
        onAnnotationsChange?.([...annotations, newAnnotation]);
        setSelectedItem({ type: 'annotation', id: newAnnotation.id });
      }
      onToolComplete?.();
    }

    setIsDragging(false);
    setIsResizing(false);
    setDragStart(null);
  };

  // Delete selected item
  const deleteSelected = useCallback(() => {
    if (!selectedItem) return;

    if (selectedItem.type === 'region') {
      onRegionsChange?.(regions.filter(r => r.id !== selectedItem.id));
    } else {
      onAnnotationsChange?.(annotations.filter(a => a.id !== selectedItem.id));
    }
    setSelectedItem(null);
  }, [selectedItem, regions, annotations, onRegionsChange, onAnnotationsChange]);

  // Keyboard handler for delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItem && editable) {
        e.preventDefault();
        deleteSelected();
      }
      if (e.key === 'Escape') {
        setSelectedItem(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem, editable, deleteSelected]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        cursor: selectedTool === 'circle' ? 'crosshair' :
                selectedTool === 'arrow' ? 'crosshair' :
                isDragging ? 'grabbing' :
                isResizing ? 'ew-resize' : 'default'
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          display: 'block',
          borderRadius: '8px'
        }}
      />

      {/* Selected item controls */}
      {editable && selectedItem && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          display: 'flex',
          gap: '8px',
          zIndex: 10
        }}>
          <button
            onClick={deleteSelected}
            style={{
              padding: '8px 16px',
              background: '#EF4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            Delete
          </button>
        </div>
      )}

      {/* Loading state */}
      {!imageLoaded && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)',
          color: 'white',
          borderRadius: '8px'
        }}>
          Loading image...
        </div>
      )}
    </div>
  );
};

export default DamageAnnotationOverlay;
