/**
 * CalendarWidget — compact month grid + today's events for the dashboard.
 * Uses CSS custom properties for theming; all styles are inline.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { authService } from '../services/authService';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  summary: string;
  start_time: string;
  end_time: string;
  event_type: 'Inspection' | 'Follow-up' | 'Meeting' | 'General';
  location?: string;
  description?: string;
}

interface ApiResponse {
  events: CalendarEvent[];
}

export interface CalendarWidgetProps {
  onViewFull?: () => void;
  userEmail?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const EVENT_TYPE_COLORS: Record<CalendarEvent['event_type'], string> = {
  Inspection: '#c41e3a',
  'Follow-up': '#f59e0b',
  Meeting:    '#3b82f6',
  General:    '#8b5cf6',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatEventTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

const CalendarWidget: React.FC<CalendarWidgetProps> = ({ onViewFull, userEmail }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewDate, setViewDate] = useState<Date>(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchEvents = useCallback(async (year: number, month: number) => {
    const email = userEmail || authService.getCurrentUser()?.email;
    const startDate = toDateString(new Date(year, month, 1));
    const endDate   = toDateString(new Date(year, month + 1, 0));

    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (email) headers['x-user-email'] = email;

      const res = await fetch(
        `${API_BASE}/api/calendar/events?startDate=${startDate}&endDate=${endDate}`,
        { headers }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ApiResponse = await res.json();
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => {
    fetchEvents(viewDate.getFullYear(), viewDate.getMonth());
  }, [viewDate, fetchEvents]);

  // ── Calendar grid data ─────────────────────────────────────────────────────

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth    = new Date(year, month + 1, 0).getDate();

  // Build a flat array of cells: nulls for leading blanks, then 1..daysInMonth
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Map date strings to event type sets for dot rendering
  const eventDotMap: Record<string, Set<CalendarEvent['event_type']>> = {};
  events.forEach((ev) => {
    const key = ev.start_time.slice(0, 10);
    if (!eventDotMap[key]) eventDotMap[key] = new Set();
    eventDotMap[key].add(ev.event_type);
  });

  // Today's events (up to 4), sorted by start time
  const todayKey = toDateString(today);
  const todaysEvents = events
    .filter((ev) => ev.start_time.slice(0, 10) === todayKey)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .slice(0, 4);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 16,
        boxShadow: 'var(--shadow-md)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minWidth: 0,
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={prevMonth}
          aria-label="Previous month"
          style={navBtnStyle}
        >
          <ChevronLeft size={14} />
        </button>

        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
          {MONTH_NAMES[month]} {year}
        </span>

        <button
          onClick={nextMonth}
          aria-label="Next month"
          style={navBtnStyle}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* ── Day-of-week headers ── */}
      <div style={gridStyle}>
        {DAY_HEADERS.map((h, i) => (
          <div key={i} style={dayHeaderStyle}>{h}</div>
        ))}
      </div>

      {/* ── Day cells ── */}
      <div style={{ ...gridStyle, gap: 2, marginTop: -4 }}>
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`blank-${idx}`} />;
          }

          const cellDate    = new Date(year, month, day);
          const cellKey     = toDateString(cellDate);
          const isToday     = cellKey === todayKey;
          const dotTypes    = eventDotMap[cellKey];
          const hasDots     = dotTypes && dotTypes.size > 0;
          const firstColor  = hasDots ? EVENT_TYPE_COLORS[Array.from(dotTypes)[0]] : undefined;

          return (
            <div
              key={cellKey}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: 36,
                borderRadius: 8,
                position: 'relative',
                cursor: hasDots ? 'pointer' : 'default',
              }}
            >
              {/* Day number with today circle */}
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isToday ? 'var(--roof-red)' : 'transparent',
                  fontSize: 12,
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? '#fff' : 'var(--text-primary)',
                  lineHeight: 1,
                }}
              >
                {day}
              </div>

              {/* Event dot */}
              {hasDots && (
                <div
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: firstColor,
                    marginTop: 1,
                    position: 'absolute',
                    bottom: 3,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Today's events ── */}
      {month === today.getMonth() && year === today.getFullYear() && (
        <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 10 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Today
          </p>

          {loading && (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading...</p>
          )}

          {!loading && todaysEvents.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No events scheduled</p>
          )}

          {!loading && todaysEvents.map((ev) => (
            <div
              key={ev.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                marginBottom: 6,
              }}
            >
              {/* Colored dot */}
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: EVENT_TYPE_COLORS[ev.event_type] ?? EVENT_TYPE_COLORS.General,
                  flexShrink: 0,
                  marginTop: 4,
                }}
              />

              <div style={{ minWidth: 0 }}>
                <p style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {ev.summary}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0 }}>
                  {formatEventTime(ev.start_time)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── View Full Calendar link ── */}
      {onViewFull && (
        <button
          onClick={onViewFull}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--roof-blue)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 0 0',
            width: '100%',
            borderTop: '1px solid var(--border-default)',
          }}
        >
          View Full Calendar
          <ExternalLink size={12} />
        </button>
      )}
    </div>
  );
};

// ─── Shared style objects ─────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 26,
  borderRadius: 6,
  border: '1px solid var(--border-default)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: 0,
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 0,
  textAlign: 'center',
};

const dayHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  paddingBottom: 4,
  textTransform: 'uppercase',
};

export default CalendarWidget;
