/**
 * CalendarPanel - Full-featured calendar for roofing field assistant
 * Supports month / week / day views, event CRUD, Google Calendar integration
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Calendar,
  Clock,
  MapPin,
  Edit3,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Tag
} from 'lucide-react';
import { authService } from '../services/authService';
import { API_BASE_URL } from '../services/config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = 'month' | 'week' | 'day';

type EventType =
  | 'general'
  | 'inspection'
  | 'followup'
  | 'meeting'
  | 'appointment'
  | 'canvassing'
  | 'install'
  | 'adjuster';

interface CalendarEvent {
  id: string;
  summary: string;
  start_time: string;
  end_time: string;
  location?: string;
  event_type: EventType;
  source: 'google' | 'local';
  color: string;
  all_day: boolean;
  description?: string;
}

interface CalendarStatus {
  google_connected: boolean;
  google_email: string | null;
  local_event_count: number;
}

interface EventFormData {
  summary: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  location: string;
  event_type: EventType;
  description: string;
  all_day: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_TYPE_CONFIG: Record<EventType, { label: string; color: string }> = {
  general:     { label: 'General',     color: '#6b7280' },
  inspection:  { label: 'Inspection',  color: '#3b82f6' },
  followup:    { label: 'Follow-Up',   color: '#f59e0b' },
  meeting:     { label: 'Meeting',     color: '#8b5cf6' },
  appointment: { label: 'Appointment', color: '#10b981' },
  canvassing:  { label: 'Canvassing',  color: '#ec4899' },
  install:     { label: 'Install',     color: '#dc2626' },
  adjuster:    { label: 'Adjuster',    color: '#0ea5e9' },
};

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 === 0 ? 12 : i % 12;
  return `${h}:00 ${i < 12 ? 'AM' : 'PM'}`;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toLocalTimeString(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatDisplayTime(isoString: string): string {
  const d = new Date(isoString);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDisplayDate(isoString: string): string {
  const d = new Date(isoString);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function getMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const days: Date[] = [];
  // Leading padding
  for (let i = 0; i < first.getDay(); i++) {
    days.push(new Date(year, month, -first.getDay() + 1 + i));
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // Trailing padding to fill last row
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i));
    }
  }
  return days;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

function buildDefaultForm(date?: Date): EventFormData {
  const base = date ? new Date(date) : new Date();
  // Round start to next hour
  base.setMinutes(0, 0, 0);
  base.setHours(base.getHours() + 1);
  const end = new Date(base);
  end.setHours(end.getHours() + 1);
  return {
    summary:    '',
    start_date: toLocalDateString(base),
    start_time: toLocalTimeString(base),
    end_date:   toLocalDateString(end),
    end_time:   toLocalTimeString(end),
    location:   '',
    event_type: 'general',
    description:'',
    all_day:    false,
  };
}

function eventToForm(event: CalendarEvent): EventFormData {
  const start = new Date(event.start_time);
  const end   = new Date(event.end_time);
  return {
    summary:    event.summary,
    start_date: toLocalDateString(start),
    start_time: toLocalTimeString(start),
    end_date:   toLocalDateString(end),
    end_time:   toLocalTimeString(end),
    location:   event.location ?? '',
    event_type: event.event_type,
    description:event.description ?? '',
    all_day:    event.all_day,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface EventPillProps {
  event: CalendarEvent;
  onClick: (e: React.MouseEvent) => void;
  compact?: boolean;
}

const EventPill: React.FC<EventPillProps> = ({ event, onClick, compact }) => {
  const color = EVENT_TYPE_CONFIG[event.event_type]?.color ?? event.color ?? '#6b7280';
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: `${color}22`,
        borderLeft: `3px solid ${color}`,
        borderTop: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        borderRadius: '3px',
        padding: compact ? '1px 4px' : '2px 6px',
        marginBottom: '2px',
        cursor: 'pointer',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        fontSize: compact ? '10px' : '11px',
        color: 'var(--text-secondary)',
        lineHeight: '1.4',
      }}
    >
      {!event.all_day && !compact && (
        <span style={{ color, marginRight: '3px', fontSize: '10px' }}>
          {formatDisplayTime(event.start_time)}
        </span>
      )}
      {event.summary}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Event Modal
// ---------------------------------------------------------------------------

interface EventModalProps {
  mode: 'create' | 'edit' | 'view';
  event?: CalendarEvent;
  initialDate?: Date;
  onClose: () => void;
  onSave: (form: EventFormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  onEdit?: () => void;
  saving: boolean;
  deleting: boolean;
}

const EventModal: React.FC<EventModalProps> = ({
  mode, event, initialDate, onClose, onSave, onDelete, onEdit, saving, deleting,
}) => {
  const [form, setForm] = useState<EventFormData>(
    mode === 'edit' && event ? eventToForm(event) : buildDefaultForm(initialDate)
  );
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof EventFormData, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!form.summary.trim()) { setError('Summary is required.'); return; }
    if (!form.start_date)     { setError('Start date is required.'); return; }
    try {
      await onSave(form);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save event.');
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '6px',
    padding: '8px 10px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '12px',
    color: 'var(--text-tertiary)',
    marginBottom: '4px',
    fontWeight: 500,
  };

  const fieldStyle: React.CSSProperties = { marginBottom: '14px' };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: 600, margin: 0 }}>
            {mode === 'create' ? 'New Event' : mode === 'edit' ? 'Edit Event' : event?.summary}
          </h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            {mode === 'view' && onEdit && (
              <button
                onClick={onEdit}
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '6px 8px', color: 'var(--text-tertiary)', cursor: 'pointer' }}
              >
                <Edit3 size={14} />
              </button>
            )}
            {mode === 'view' && onDelete && (
              <button
                onClick={onDelete}
                disabled={deleting}
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '6px 8px', color: '#dc2626', cursor: 'pointer' }}
              >
                {deleting ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
              </button>
            )}
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '4px' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* View Mode */}
        {mode === 'view' && event && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: EVENT_TYPE_CONFIG[event.event_type]?.color ?? '#6b7280',
                  flexShrink: 0,
                }}
              />
              <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
                {EVENT_TYPE_CONFIG[event.event_type]?.label}
              </span>
              <span style={{
                marginLeft: 'auto',
                fontSize: '11px',
                color: event.source === 'google' ? '#4285f4' : 'var(--text-tertiary)',
                background: event.source === 'google' ? '#4285f420' : 'var(--border-subtle)',
                padding: '2px 8px',
                borderRadius: '10px',
              }}>
                {event.source === 'google' ? 'Google' : 'Local'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px', color: 'var(--text-secondary)', fontSize: '14px' }}>
              <Clock size={15} style={{ color: 'var(--text-tertiary)', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div>{formatDisplayDate(event.start_time)}</div>
                {!event.all_day && (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
                    {formatDisplayTime(event.start_time)} — {formatDisplayTime(event.end_time)}
                  </div>
                )}
              </div>
            </div>
            {event.location && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                <MapPin size={15} style={{ color: 'var(--text-tertiary)', marginTop: '2px', flexShrink: 0 }} />
                <span>{event.location}</span>
              </div>
            )}
            {event.description && (
              <p style={{ color: 'var(--text-tertiary)', fontSize: '13px', lineHeight: 1.6, margin: 0, marginTop: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                {event.description}
              </p>
            )}
          </div>
        )}

        {/* Create / Edit Form */}
        {(mode === 'create' || mode === 'edit') && (
          <>
            <div style={fieldStyle}>
              <label style={labelStyle}>Summary *</label>
              <input
                style={inputStyle}
                value={form.summary}
                onChange={e => set('summary', e.target.value)}
                placeholder="Event title"
                autoFocus
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Event Type</label>
              <select
                style={inputStyle}
                value={form.event_type}
                onChange={e => set('event_type', e.target.value)}
              >
                {(Object.entries(EVENT_TYPE_CONFIG) as [EventType, { label: string; color: string }][]).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <input
                type="checkbox"
                id="all_day"
                checked={form.all_day}
                onChange={e => set('all_day', e.target.checked)}
                style={{ accentColor: '#dc2626', width: '15px', height: '15px', cursor: 'pointer' }}
              />
              <label htmlFor="all_day" style={{ color: 'var(--text-tertiary)', fontSize: '13px', cursor: 'pointer' }}>All day</label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: form.all_day ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Start Date *</label>
                <input
                  type="date"
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                  value={form.start_date}
                  onChange={e => set('start_date', e.target.value)}
                />
              </div>
              {!form.all_day && (
                <div>
                  <label style={labelStyle}>Start Time</label>
                  <input
                    type="time"
                    style={{ ...inputStyle, colorScheme: 'dark' }}
                    value={form.start_time}
                    onChange={e => set('start_time', e.target.value)}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: form.all_day ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>End Date</label>
                <input
                  type="date"
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                  value={form.end_date}
                  onChange={e => set('end_date', e.target.value)}
                />
              </div>
              {!form.all_day && (
                <div>
                  <label style={labelStyle}>End Time</label>
                  <input
                    type="time"
                    style={{ ...inputStyle, colorScheme: 'dark' }}
                    value={form.end_time}
                    onChange={e => set('end_time', e.target.value)}
                  />
                </div>
              )}
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Location</label>
              <div style={{ position: 'relative' }}>
                <MapPin size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <input
                  style={{ ...inputStyle, paddingLeft: '30px' }}
                  value={form.location}
                  onChange={e => set('location', e.target.value)}
                  placeholder="Address or place"
                />
              </div>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Description</label>
              <textarea
                style={{ ...inputStyle, resize: 'vertical', minHeight: '70px' }}
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Notes or details..."
              />
            </div>

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#dc262620', border: '1px solid #dc2626', borderRadius: '6px', padding: '8px 12px', marginBottom: '14px', color: '#fca5a5', fontSize: '13px' }}>
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '9px 18px', color: 'var(--text-tertiary)', fontSize: '14px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                style={{ background: '#dc2626', border: 'none', borderRadius: '8px', padding: '9px 20px', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {saving && <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                {saving ? 'Saving…' : (mode === 'edit' ? 'Save Changes' : 'Create Event')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const CalendarPanel: React.FC = () => {
  const [viewMode, setViewMode]         = useState<ViewMode>('month');
  const [currentDate, setCurrentDate]   = useState(new Date());
  const [events, setEvents]             = useState<CalendarEvent[]>([]);
  const [status, setStatus]             = useState<CalendarStatus | null>(null);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);

  // Modal state
  const [modalMode, setModalMode]       = useState<'create' | 'edit' | 'view' | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | undefined>(undefined);
  const [clickedDate, setClickedDate]   = useState<Date | undefined>(undefined);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);

  // Visible range for current view
  const visibleRange = useCallback((): { start: Date; end: Date } => {
    if (viewMode === 'month') {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const end   = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      start.setDate(start.getDate() - start.getDay());
      end.setDate(end.getDate() + (6 - end.getDay()));
      return { start, end };
    }
    if (viewMode === 'week') {
      const start = getWeekStart(currentDate);
      const end   = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    // day
    const start = new Date(currentDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(currentDate);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [viewMode, currentDate]);

  const userEmail = authService.getCurrentUser()?.email ?? '';

  const fetchEvents = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const { start, end } = visibleRange();
      const res = await fetch(
        `${API_BASE_URL}/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`,
        { headers: { 'x-user-email': userEmail } }
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } catch (_) {
      // Silently fail — show empty calendar rather than crash
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [visibleRange, userEmail]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/calendar/status`, {
        headers: { 'x-user-email': userEmail },
      });
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch (_) {}
  }, [userEmail]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  const handleSave = async (form: EventFormData) => {
    setSaving(true);
    try {
      const startISO = form.all_day
        ? new Date(`${form.start_date}T00:00:00`).toISOString()
        : new Date(`${form.start_date}T${form.start_time}`).toISOString();
      const endISO = form.all_day
        ? new Date(`${form.end_date || form.start_date}T23:59:59`).toISOString()
        : new Date(`${form.end_date || form.start_date}T${form.end_time}`).toISOString();

      const payload = {
        summary:    form.summary,
        start_time: startISO,
        end_time:   endISO,
        location:   form.location,
        event_type: form.event_type,
        description:form.description,
        all_day:    form.all_day,
        color:      EVENT_TYPE_CONFIG[form.event_type].color,
      };

      let res: Response;
      if (modalMode === 'edit' && selectedEvent) {
        res = await fetch(`${API_BASE_URL}/calendar/events/${selectedEvent.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-user-email': userEmail },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_BASE_URL}/calendar/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-email': userEmail },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Server error ${res.status}`);
      }

      setModalMode(null);
      setSelectedEvent(undefined);
      await fetchEvents(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedEvent) return;
    setDeleting(true);
    try {
      await fetch(`${API_BASE_URL}/calendar/events/${selectedEvent.id}`, {
        method: 'DELETE',
        headers: { 'x-user-email': userEmail },
      });
      setModalMode(null);
      setSelectedEvent(undefined);
      await fetchEvents(false);
    } finally {
      setDeleting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const navigate = (direction: -1 | 1) => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'month') {
        d.setMonth(d.getMonth() + direction);
        d.setDate(1);
      } else if (viewMode === 'week') {
        d.setDate(d.getDate() + direction * 7);
      } else {
        d.setDate(d.getDate() + direction);
      }
      return d;
    });
  };

  const goToday = () => setCurrentDate(new Date());

  const headerTitle = (): string => {
    if (viewMode === 'month') {
      return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    if (viewMode === 'week') {
      const ws = getWeekStart(currentDate);
      const we = new Date(ws); we.setDate(ws.getDate() + 6);
      if (ws.getMonth() === we.getMonth()) {
        return `${MONTH_NAMES[ws.getMonth()]} ${ws.getDate()}–${we.getDate()}, ${ws.getFullYear()}`;
      }
      return `${MONTH_NAMES[ws.getMonth()]} ${ws.getDate()} – ${MONTH_NAMES[we.getMonth()]} ${we.getDate()}, ${ws.getFullYear()}`;
    }
    return `${DAY_NAMES_FULL[currentDate.getDay()]}, ${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
  };

  // ---------------------------------------------------------------------------
  // Event helpers
  // ---------------------------------------------------------------------------

  const eventsForDay = (day: Date): CalendarEvent[] =>
    events.filter(ev => isSameDay(new Date(ev.start_time), day));

  const eventsForHour = (day: Date, hour: number): CalendarEvent[] =>
    events.filter(ev => {
      const s = new Date(ev.start_time);
      return isSameDay(s, day) && s.getHours() === hour;
    });

  // ---------------------------------------------------------------------------
  // Month View
  // ---------------------------------------------------------------------------

  const MonthView = () => {
    const grid = getMonthGrid(currentDate.getFullYear(), currentDate.getMonth());
    const today = new Date();
    const MAX_PILLS = 3;

    return (
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Day name headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border-subtle)' }}>
          {DAY_NAMES_SHORT.map(d => (
            <div key={d} style={{ padding: '8px 4px', textAlign: 'center', fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 600 }}>
              {d}
            </div>
          ))}
        </div>

        {/* Grid rows */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {grid.map((day, idx) => {
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            const isToday = isSameDay(day, today);
            const dayEvents = eventsForDay(day);
            const shown = dayEvents.slice(0, MAX_PILLS);
            const overflow = dayEvents.length - MAX_PILLS;

            return (
              <div
                key={idx}
                onClick={() => { setClickedDate(day); setModalMode('create'); }}
                style={{
                  minHeight: '90px',
                  borderRight: (idx + 1) % 7 === 0 ? 'none' : '1px solid var(--bg-elevated)',
                  borderBottom: '1px solid var(--bg-elevated)',
                  padding: '4px',
                  cursor: 'pointer',
                  background: isToday ? '#1a0808' : 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = isToday ? '#200b0b' : 'var(--bg-secondary)')}
                onMouseLeave={e => (e.currentTarget.style.background = isToday ? '#1a0808' : 'transparent')}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: isToday ? 700 : 400,
                    color: isToday ? '#fff' : isCurrentMonth ? 'var(--text-secondary)' : 'var(--text-disabled)',
                    width: '22px',
                    height: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    background: isToday ? '#dc2626' : 'transparent',
                    marginBottom: '2px',
                  }}
                >
                  {day.getDate()}
                </div>
                {shown.map(ev => (
                  <EventPill
                    key={ev.id}
                    event={ev}
                    compact
                    onClick={e => { e.stopPropagation(); setSelectedEvent(ev); setModalMode('view'); }}
                  />
                ))}
                {overflow > 0 && (
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', paddingLeft: '4px' }}>
                    +{overflow} more
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Week View
  // ---------------------------------------------------------------------------

  const WeekView = () => {
    const today = new Date();
    const weekStart = getWeekStart(currentDate);
    const days = getWeekDays(weekStart);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 7 * 48; // scroll to 7 AM
      }
    }, []);

    return (
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }} ref={scrollRef}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 2 }}>
          <div />
          {days.map((d, i) => {
            const isToday = isSameDay(d, today);
            return (
              <div key={i} style={{ padding: '8px 4px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600 }}>{DAY_NAMES_SHORT[d.getDay()]}</div>
                <div style={{
                  fontSize: '18px', fontWeight: 700,
                  color: isToday ? '#fff' : 'var(--text-tertiary)',
                  width: '34px', height: '34px', borderRadius: '50%',
                  background: isToday ? '#dc2626' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '2px auto 0',
                }}>
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Hour rows */}
        {HOUR_LABELS.map((label, hour) => (
          <div key={hour} style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', borderBottom: '1px solid var(--bg-elevated)', minHeight: '48px' }}>
            <div style={{ padding: '4px 6px', fontSize: '10px', color: 'var(--text-disabled)', textAlign: 'right', paddingTop: '2px', borderRight: '1px solid var(--bg-elevated)' }}>
              {hour > 0 ? label : ''}
            </div>
            {days.map((day, di) => {
              const cellEvents = eventsForHour(day, hour);
              return (
                <div
                  key={di}
                  onClick={() => {
                    const d = new Date(day);
                    d.setHours(hour, 0, 0, 0);
                    setClickedDate(d);
                    setModalMode('create');
                  }}
                  style={{
                    borderRight: di < 6 ? '1px solid var(--bg-elevated)' : 'none',
                    padding: '2px',
                    cursor: 'pointer',
                    minHeight: '48px',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {cellEvents.map(ev => (
                    <EventPill
                      key={ev.id}
                      event={ev}
                      onClick={e => { e.stopPropagation(); setSelectedEvent(ev); setModalMode('view'); }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Day View
  // ---------------------------------------------------------------------------

  const DayView = () => {
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 7 * 52;
    }, []);

    return (
      <div style={{ flex: 1, overflowY: 'auto' }} ref={scrollRef}>
        {HOUR_LABELS.map((label, hour) => {
          const cellEvents = eventsForHour(currentDate, hour);
          return (
            <div
              key={hour}
              style={{ display: 'flex', borderBottom: '1px solid var(--bg-elevated)', minHeight: '52px' }}
            >
              <div style={{ width: '56px', flexShrink: 0, padding: '4px 8px', fontSize: '11px', color: 'var(--text-disabled)', textAlign: 'right', borderRight: '1px solid var(--bg-elevated)', paddingTop: '3px' }}>
                {hour > 0 ? label : ''}
              </div>
              <div
                onClick={() => {
                  const d = new Date(currentDate);
                  d.setHours(hour, 0, 0, 0);
                  setClickedDate(d);
                  setModalMode('create');
                }}
                style={{ flex: 1, padding: '3px 6px', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {cellEvents.map(ev => (
                  <EventPill
                    key={ev.id}
                    event={ev}
                    onClick={e => { e.stopPropagation(); setSelectedEvent(ev); setModalMode('view'); }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)', color: 'var(--text-primary)', overflow: 'hidden' }}>

      {/* Spin keyframes injected once */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Google Calendar Status Banner */}
      {status !== null && !status.google_connected && (
        <div style={{ background: '#1a1000', border: '1px solid #854d0e', borderRadius: '8px', margin: '12px 16px 0', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <AlertCircle size={16} style={{ color: '#fbbf24', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: '#fcd34d', flex: 1 }}>
            Google Calendar is not connected. Events are stored locally.
          </span>
          <a
            href="/settings"
            style={{ fontSize: '12px', color: '#fbbf24', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
          >
            Connect <ExternalLink size={11} />
          </a>
        </div>
      )}

      {status !== null && status.google_connected && (
        <div style={{ background: '#052e16', border: '1px solid #166534', borderRadius: '8px', margin: '12px 16px 0', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <CheckCircle size={15} style={{ color: '#4ade80', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: '#86efac' }}>
            Google Calendar connected{status.google_email ? ` — ${status.google_email}` : ''}
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--bg-elevated)',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        {/* Nav arrows + Today */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '6px 8px', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={goToday}
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '6px 12px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
          >
            Today
          </button>
          <button
            onClick={() => navigate(1)}
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '6px 8px', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Title */}
        <h2 style={{ margin: 0, fontSize: isMobile ? '14px' : '16px', fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: '140px' }}>
          {headerTitle()}
        </h2>

        {/* View toggle + Refresh + Add */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
          {/* View mode pills */}
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
            {(['month', 'week', 'day'] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === v ? '#dc2626' : 'transparent',
                  color: viewMode === v ? '#fff' : 'var(--text-tertiary)',
                  textTransform: 'capitalize',
                  transition: 'background 0.15s',
                }}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={() => fetchEvents(false)}
            disabled={refreshing}
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '7px', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title="Refresh events"
          >
            <RefreshCw size={15} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>

          {/* Add event */}
          <button
            onClick={() => { setClickedDate(new Date()); setModalMode('create'); }}
            style={{ background: '#dc2626', border: 'none', borderRadius: '8px', padding: '7px 14px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Plus size={15} />
            {!isMobile && 'Add'}
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--text-tertiary)' }}>
          <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span>Loading events…</span>
        </div>
      ) : (
        <>
          {viewMode === 'month' && <MonthView />}
          {viewMode === 'week' && <WeekView />}
          {viewMode === 'day'  && <DayView />}
        </>
      )}

      {/* Legend (month view only) */}
      {viewMode === 'month' && !loading && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '10px 16px', borderTop: '1px solid var(--bg-elevated)', flexShrink: 0 }}>
          {(Object.entries(EVENT_TYPE_CONFIG) as [EventType, { label: string; color: string }][]).map(([key, cfg]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: cfg.color, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{cfg.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalMode === 'view' && selectedEvent && (
        <EventModal
          mode="view"
          event={selectedEvent}
          onClose={() => { setModalMode(null); setSelectedEvent(undefined); }}
          onSave={handleSave}
          onDelete={handleDelete}
          onEdit={() => setModalMode('edit')}
          saving={saving}
          deleting={deleting}
        />
      )}

      {modalMode === 'edit' && selectedEvent && (
        <EventModal
          mode="edit"
          event={selectedEvent}
          onClose={() => { setModalMode(null); setSelectedEvent(undefined); }}
          onSave={handleSave}
          saving={saving}
          deleting={deleting}
        />
      )}

      {modalMode === 'create' && (
        <EventModal
          mode="create"
          initialDate={clickedDate}
          onClose={() => { setModalMode(null); setClickedDate(undefined); }}
          onSave={handleSave}
          saving={saving}
          deleting={deleting}
        />
      )}
    </div>
  );
};

export default CalendarPanel;
