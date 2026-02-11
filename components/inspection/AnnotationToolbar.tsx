/**
 * AnnotationToolbar - Tools for editing damage annotations
 * Provides buttons to add circles, arrows, and delete selected items
 */

import React from 'react';
import { Circle, ArrowRight, Trash2, MousePointer, Eye, EyeOff, RotateCcw } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export type AnnotationTool = 'select' | 'circle' | 'arrow' | null;

interface AnnotationToolbarProps {
  selectedTool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  onDelete?: () => void;
  onClear?: () => void;
  showAnnotations: boolean;
  onToggleAnnotations: () => void;
  hasSelection?: boolean;
  hasAnnotations?: boolean;
  disabled?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({
  selectedTool,
  onToolChange,
  onDelete,
  onClear,
  showAnnotations,
  onToggleAnnotations,
  hasSelection = false,
  hasAnnotations = false,
  disabled = false
}) => {
  const buttonStyle = (isActive: boolean, isDestructive = false): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px 16px',
    background: isActive
      ? '#c41e3a'
      : isDestructive
        ? 'transparent'
        : '#1F2937',
    color: isActive ? 'white' : isDestructive ? '#EF4444' : '#E5E7EB',
    border: isDestructive ? '1px solid #EF4444' : '1px solid #374151',
    borderRadius: '8px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s ease'
  });

  const handleToolClick = (tool: AnnotationTool) => {
    if (disabled) return;
    onToolChange(selectedTool === tool ? null : tool);
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px 16px',
      background: '#111827',
      borderRadius: '12px',
      flexWrap: 'wrap'
    }}>
      {/* Selection Tools */}
      <div style={{
        display: 'flex',
        gap: '6px',
        paddingRight: '12px',
        borderRight: '1px solid #374151'
      }}>
        <button
          onClick={() => handleToolClick('select')}
          style={buttonStyle(selectedTool === 'select')}
          title="Select & Move (drag to reposition)"
          disabled={disabled}
        >
          <MousePointer size={18} />
          <span>Select</span>
        </button>
      </div>

      {/* Drawing Tools */}
      <div style={{
        display: 'flex',
        gap: '6px',
        paddingRight: '12px',
        borderRight: '1px solid #374151'
      }}>
        <button
          onClick={() => handleToolClick('circle')}
          style={buttonStyle(selectedTool === 'circle')}
          title="Add Circle (click to place)"
          disabled={disabled}
        >
          <Circle size={18} />
          <span>Circle</span>
        </button>

        <button
          onClick={() => handleToolClick('arrow')}
          style={buttonStyle(selectedTool === 'arrow')}
          title="Add Arrow (click and drag)"
          disabled={disabled}
        >
          <ArrowRight size={18} />
          <span>Arrow</span>
        </button>
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex',
        gap: '6px',
        paddingRight: '12px',
        borderRight: '1px solid #374151'
      }}>
        <button
          onClick={onDelete}
          style={{
            ...buttonStyle(false, true),
            opacity: hasSelection && !disabled ? 1 : 0.4
          }}
          title="Delete selected annotation (Delete key)"
          disabled={!hasSelection || disabled}
        >
          <Trash2 size={18} />
          <span>Delete</span>
        </button>

        <button
          onClick={onClear}
          style={{
            ...buttonStyle(false, true),
            opacity: hasAnnotations && !disabled ? 1 : 0.4
          }}
          title="Clear all annotations"
          disabled={!hasAnnotations || disabled}
        >
          <RotateCcw size={18} />
          <span>Clear All</span>
        </button>
      </div>

      {/* View Toggle */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={onToggleAnnotations}
          style={buttonStyle(showAnnotations)}
          title={showAnnotations ? 'Hide annotations' : 'Show annotations'}
          disabled={disabled}
        >
          {showAnnotations ? <Eye size={18} /> : <EyeOff size={18} />}
          <span>{showAnnotations ? 'Visible' : 'Hidden'}</span>
        </button>
      </div>

      {/* Tool instructions */}
      {selectedTool && (
        <div style={{
          marginLeft: 'auto',
          fontSize: '13px',
          color: '#9CA3AF',
          fontStyle: 'italic'
        }}>
          {selectedTool === 'select' && 'Click to select, drag to move'}
          {selectedTool === 'circle' && 'Click on damage to add circle'}
          {selectedTool === 'arrow' && 'Click and drag to draw arrow'}
        </div>
      )}
    </div>
  );
};

export default AnnotationToolbar;
