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
  lookup_hail_data:       { label: 'Hail Data Lookup',      icon: Cloud,       color: '#22c55e' },
  schedule_followup:      { label: 'Follow-Up Scheduled',   icon: Calendar,    color: '#3b82f6' },
  save_client_note:       { label: 'Client Note Saved',     icon: FileText,    color: '#a78bfa' },
  draft_email:            { label: 'Email Drafted',          icon: Mail,        color: '#f59e0b' },
  send_email:             { label: 'Email Sent',             icon: Mail,        color: '#22c55e' },
  share_team_intel:       { label: 'Intel Shared',           icon: Users,       color: '#ec4899' },
  get_job_details:        { label: 'Job Details',            icon: Briefcase,   color: '#06b6d4' },
  search_knowledge_base:  { label: 'Knowledge Search',      icon: Search,      color: '#8b5cf6' },
  generate_storm_report:  { label: 'Storm Report Generated', icon: FileText,   color: '#dc2626' },
  record_claim_outcome:   { label: 'Claim Outcome Recorded', icon: CheckCircle, color: '#f59e0b' },
  send_notification:      { label: 'Notification Sent',     icon: Mail,        color: '#3b82f6' },
};

const DEFAULT_META = { label: 'Tool Result', icon: CheckCircle, color: '#6b7280' };

/** Keys that should never be displayed in tool results */
const REDACTED_KEYS = new Set(['apiKey', 'api_key', 'secret', 'password', 'token', 'authorization', 'cookie']);

/** Format a tool result value for display, redacting sensitive fields */
function formatValue(val: unknown, key?: string): string {
  if (key && REDACTED_KEYS.has(key.toLowerCase())) return '***';
  if (val === null || val === undefined) return '—';
  if (typeof val === 'string') return val.slice(0, 500);
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) {
    if (val.length === 0) return '(none)';
    // Show items as comma list, not raw JSON
    return val.map(v => typeof v === 'string' ? v : JSON.stringify(v)).slice(0, 5).join(', ') + (val.length > 5 ? ` (+${val.length - 5} more)` : '');
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    const summary = Object.entries(obj)
      .filter(([k]) => !REDACTED_KEYS.has(k.toLowerCase()))
      .slice(0, 5)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 100) : JSON.stringify(v)}`)
      .join('\n');
    return summary || '(details)';
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
      background: 'var(--bg-card)',
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
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
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
          color: 'var(--text-secondary)',
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
