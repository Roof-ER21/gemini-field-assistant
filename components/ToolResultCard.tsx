/**
 * ToolResultCard
 * Renders agent tool execution results as compact inline cards in chat.
 * Matches the existing dark-gradient style used in ChatPanel.tsx.
 */

import React from 'react';
import {
  Cloud,
  Calendar,
  FileText,
  Mail,
  Users,
  Search,
  Briefcase,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import type { AgentToolResult } from '../services/susanAgentService';

const TOOL_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  lookup_hail_data:      { label: 'Hail Data Lookup',     icon: Cloud,     color: '#22c55e' },
  schedule_followup:     { label: 'Follow-Up Scheduled',  icon: Calendar,  color: '#3b82f6' },
  save_client_note:      { label: 'Client Note Saved',    icon: FileText,  color: '#a78bfa' },
  draft_email:           { label: 'Email Drafted',         icon: Mail,      color: '#f59e0b' },
  share_team_intel:      { label: 'Intel Shared',          icon: Users,     color: '#ec4899' },
  get_job_details:       { label: 'Job Details',           icon: Briefcase, color: '#06b6d4' },
  search_knowledge_base: { label: 'Knowledge Search',     icon: Search,    color: '#8b5cf6' },
};

const DEFAULT_META = { label: 'Tool Result', icon: CheckCircle, color: '#6b7280' };

/** Format a tool result value for display */
function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return val.length === 0 ? '(none)' : JSON.stringify(val, null, 1);
  if (typeof val === 'object') {
    // Show a few key fields if available
    const obj = val as Record<string, unknown>;
    const summary = Object.entries(obj)
      .slice(0, 5)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join('\n');
    return summary || JSON.stringify(val);
  }
  return String(val);
}

interface Props {
  toolResult: AgentToolResult;
}

const ToolResultCard: React.FC<Props> = ({ toolResult }) => {
  const meta = TOOL_META[toolResult.tool] || DEFAULT_META;
  const Icon = meta.icon;
  const success = toolResult.success !== false;

  // Extract displayable content from result
  const resultData = toolResult.result as Record<string, unknown> | string | null;
  let summaryLines: string[] = [];

  if (typeof resultData === 'string') {
    summaryLines = [resultData];
  } else if (resultData && typeof resultData === 'object') {
    const obj = resultData as Record<string, unknown>;
    // Pick the most useful fields to show
    const priorityKeys = ['message', 'summary', 'title', 'status', 'count', 'address', 'job_number', 'results'];
    for (const key of priorityKeys) {
      if (obj[key] !== undefined) {
        const val = formatValue(obj[key]);
        if (val.length < 200) {
          summaryLines.push(val);
        }
      }
    }
    // If no priority keys matched, show first 3 entries
    if (summaryLines.length === 0) {
      summaryLines = Object.entries(obj)
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${formatValue(v)}`);
    }
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(16,24,32,0.9) 0%, rgba(8,12,16,0.95) 100%)',
      border: `1px solid ${success ? `${meta.color}33` : 'rgba(239,68,68,0.3)'}`,
      borderRadius: '12px',
      padding: '12px 16px',
      marginTop: '6px',
      marginBottom: '6px',
      fontSize: '13px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          width: '28px',
          height: '28px',
          borderRadius: '8px',
          background: `${meta.color}22`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon style={{ width: '14px', height: '14px', color: meta.color }} />
        </div>
        <span style={{ fontWeight: 600, color: 'white', flex: 1 }}>
          {meta.label}
        </span>
        {success ? (
          <CheckCircle style={{ width: '14px', height: '14px', color: '#22c55e' }} />
        ) : (
          <XCircle style={{ width: '14px', height: '14px', color: '#ef4444' }} />
        )}
      </div>

      {/* Summary */}
      {summaryLines.length > 0 && (
        <div style={{
          marginTop: '8px',
          color: 'rgba(255,255,255,0.7)',
          fontSize: '12px',
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
          maxHeight: '120px',
          overflow: 'auto',
        }}>
          {summaryLines.join('\n')}
        </div>
      )}

      {/* Error */}
      {toolResult.error && (
        <div style={{
          marginTop: '8px',
          color: '#fca5a5',
          fontSize: '12px',
        }}>
          {toolResult.error}
        </div>
      )}
    </div>
  );
};

export default ToolResultCard;
