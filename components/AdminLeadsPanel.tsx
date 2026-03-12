import React, { useState, useEffect, useCallback } from 'react';
import {
  Phone, Mail, MapPin, Calendar, Search, Filter, RefreshCw,
  ChevronDown, ChevronUp, ExternalLink, Clock, Star, AlertCircle,
  PhoneIncoming, MessageSquare, Globe, QrCode, Zap, UserPlus
} from 'lucide-react';

interface Lead {
  id: string;
  homeowner_name: string;
  homeowner_email: string | null;
  homeowner_phone: string | null;
  address: string | null;
  zip_code: string | null;
  service_type: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  message: string | null;
  source: string;
  status: string;
  lead_score: number;
  score_factors: Record<string, boolean> | null;
  referral_code: string | null;
  profile_name: string | null;
  profile_slug: string | null;
  created_at: string;
  updated_at: string;
}

const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api';

const sourceConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  phone_call: { label: 'Phone Call', icon: <PhoneIncoming size={14} />, color: '#22c55e' },
  sms_inbound: { label: 'SMS', icon: <MessageSquare size={14} />, color: '#3b82f6' },
  missed_call: { label: 'Missed Call', icon: <Phone size={14} />, color: '#f59e0b' },
  storm_landing: { label: 'Storm Landing', icon: <Zap size={14} />, color: '#ef4444' },
  claim_quiz: { label: 'Claim Quiz', icon: <AlertCircle size={14} />, color: '#8b5cf6' },
  claim_help: { label: 'Claim Help', icon: <AlertCircle size={14} />, color: '#a855f7' },
  profile: { label: 'QR Profile', icon: <QrCode size={14} />, color: '#06b6d4' },
  referral: { label: 'Referral', icon: <UserPlus size={14} />, color: '#10b981' },
  qr_door: { label: 'Door Drop QR', icon: <QrCode size={14} />, color: '#0891b2' },
  cold_email: { label: 'Cold Email', icon: <Mail size={14} />, color: '#6366f1' },
  social_reddit: { label: 'Reddit', icon: <Globe size={14} />, color: '#f97316' },
  social_scanner: { label: 'Social', icon: <Globe size={14} />, color: '#ec4899' },
  reengagement: { label: 'Re-engage', icon: <RefreshCw size={14} />, color: '#14b8a6' },
  appointment_ai: { label: 'AI Appointment', icon: <Calendar size={14} />, color: '#8b5cf6' },
};

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  new: { label: 'New', bg: '#22c55e22', text: '#22c55e' },
  contacted: { label: 'Contacted', bg: '#3b82f622', text: '#3b82f6' },
  converted: { label: 'Converted', bg: '#8b5cf622', text: '#8b5cf6' },
  closed: { label: 'Closed', bg: '#6b728022', text: '#6b7280' },
};

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#6b7280';
  const emoji = score >= 70 ? '🔥' : score >= 40 ? '⚡' : '📋';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px', borderRadius: '12px',
      background: color + '22', color, fontSize: '12px', fontWeight: 600
    }}>
      {emoji} {score}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const cfg = sourceConfig[source] || { label: source, icon: <Globe size={14} />, color: '#6b7280' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px', borderRadius: '12px',
      background: cfg.color + '22', color: cfg.color, fontSize: '12px', fontWeight: 500
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || { label: status, bg: '#6b728022', text: '#6b7280' };
  return (
    <span style={{
      padding: '2px 10px', borderRadius: '12px',
      background: cfg.bg, color: cfg.text, fontSize: '12px', fontWeight: 600
    }}>
      {cfg.label}
    </span>
  );
}

function TimeAgo({ date }: { date: string }) {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const text = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : hrs < 24 ? `${hrs}h ago` : `${days}d ago`;
  return (
    <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
      <Clock size={12} /> {text}
    </span>
  );
}

export default function AdminLeadsPanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState<any>(null);
  const limit = 25;

  const userEmail = localStorage.getItem('userEmail') || '';

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(page * limit),
      });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`${API_BASE}/profile-leads?${params}`, {
        headers: { 'x-user-email': userEmail },
      });
      const data = await res.json();
      if (data.success) {
        setLeads(data.leads);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, userEmail]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/profile-leads/stats`, {
        headers: { 'x-user-email': userEmail },
      });
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch {}
  }, [userEmail]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const updateStatus = async (leadId: string, newStatus: string) => {
    try {
      await fetch(`${API_BASE}/profile-leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-email': userEmail },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchLeads();
      fetchStats();
    } catch {}
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      {/* Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total Leads', value: stats.total || 0, color: '#3b82f6', icon: '📊' },
            { label: 'New', value: stats.new || 0, color: '#22c55e', icon: '🆕' },
            { label: 'Contacted', value: stats.contacted || 0, color: '#f59e0b', icon: '📞' },
            { label: 'Converted', value: stats.converted || 0, color: '#8b5cf6', icon: '✅' },
            { label: 'This Week', value: stats.thisWeek || 0, color: '#ef4444', icon: '📅' },
            { label: 'This Month', value: stats.thisMonth || 0, color: '#06b6d4', icon: '📅' },
          ].map((stat) => (
            <div key={stat.label} style={{
              background: 'var(--bg-elevated)', borderRadius: '10px', padding: '14px',
              border: '1px solid var(--border-subtle)'
            }}>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>{stat.icon} {stat.label}</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            style={{
              width: '100%', padding: '8px 10px 8px 34px', borderRadius: '8px',
              border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
              color: 'var(--text-primary)', fontSize: '13px', outline: 'none'
            }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer'
          }}
        >
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="converted">Converted</option>
          <option value="closed">Closed</option>
        </select>
        <button
          onClick={() => { fetchLeads(); fetchStats(); }}
          style={{
            padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px'
          }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
        <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
          {total} lead{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Leads List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>Loading leads...</div>
      ) : leads.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
          <Phone size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
          <div>No leads found</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {leads.map((lead) => {
            const isExpanded = expandedId === lead.id;
            return (
              <div key={lead.id} style={{
                background: 'var(--bg-elevated)', borderRadius: '10px',
                border: `1px solid ${lead.source === 'phone_call' ? '#22c55e33' : 'var(--border-subtle)'}`,
                overflow: 'hidden', transition: 'all 0.15s ease'
              }}>
                {/* Row Header */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                    cursor: 'pointer', flexWrap: 'wrap'
                  }}
                >
                  <ScoreBadge score={lead.lead_score} />
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                      {lead.homeowner_name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '2px' }}>
                      {lead.homeowner_phone && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Phone size={11} /> {lead.homeowner_phone}
                        </span>
                      )}
                      {lead.zip_code && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <MapPin size={11} /> {lead.zip_code}
                        </span>
                      )}
                    </div>
                  </div>
                  <SourceBadge source={lead.source} />
                  <StatusBadge status={lead.status} />
                  <TimeAgo date={lead.created_at} />
                  {isExpanded ? <ChevronUp size={16} color="var(--text-tertiary)" /> : <ChevronDown size={16} color="var(--text-tertiary)" />}
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div style={{
                    padding: '0 16px 16px', borderTop: '1px solid var(--border-subtle)',
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', paddingTop: '12px'
                  }}>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>Full Name</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{lead.homeowner_name}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>Phone</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                        {lead.homeowner_phone ? (
                          <a href={`tel:${lead.homeowner_phone}`} style={{ color: '#3b82f6', textDecoration: 'none' }}>
                            {lead.homeowner_phone}
                          </a>
                        ) : '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>Email</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{lead.homeowner_email || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>Address</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{lead.address || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>Service / Damage</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{lead.service_type || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>Preferred Date/Time</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                        {lead.preferred_date || lead.preferred_time
                          ? `${lead.preferred_date || ''} ${lead.preferred_time || ''}`.trim()
                          : '—'}
                      </div>
                    </div>
                    {lead.message && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>Notes</div>
                        <div style={{
                          fontSize: '13px', color: 'var(--text-secondary)', background: 'var(--bg-primary)',
                          padding: '8px 10px', borderRadius: '6px', whiteSpace: 'pre-wrap', lineHeight: 1.5
                        }}>
                          {lead.message}
                        </div>
                      </div>
                    )}
                    {lead.profile_name && (
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>Assigned Rep</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{lead.profile_name}</div>
                      </div>
                    )}
                    {lead.referral_code && (
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>Referral Code</div>
                        <div style={{ fontSize: '13px', color: '#10b981' }}>{lead.referral_code}</div>
                      </div>
                    )}

                    {/* Status Actions */}
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px', marginTop: '4px' }}>
                      {['new', 'contacted', 'converted', 'closed'].map((s) => {
                        const cfg = statusConfig[s];
                        const isActive = lead.status === s;
                        return (
                          <button
                            key={s}
                            onClick={() => !isActive && updateStatus(lead.id, s)}
                            style={{
                              padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                              border: isActive ? `2px solid ${cfg.text}` : '1px solid var(--border-subtle)',
                              background: isActive ? cfg.bg : 'transparent',
                              color: isActive ? cfg.text : 'var(--text-tertiary)',
                              cursor: isActive ? 'default' : 'pointer',
                              opacity: isActive ? 1 : 0.7,
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '1.5rem' }}>
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            style={{
              padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)', color: 'var(--text-primary)',
              cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.4 : 1
            }}
          >
            Prev
          </button>
          <span style={{ padding: '6px 12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
            style={{
              padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)', color: 'var(--text-primary)',
              cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page >= totalPages - 1 ? 0.4 : 1
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
