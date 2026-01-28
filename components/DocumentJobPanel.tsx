/**
 * DocumentJobPanel - Comprehensive Job Management System
 * Features: Job list, detail view, create/edit, kanban pipeline, integrations
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText, X, Plus, Search, Filter, ChevronRight, ChevronDown,
  Phone, Mail, MapPin, Calendar, DollarSign, Shield, User, Building,
  Clock, CheckCircle2, AlertCircle, Edit3, Trash2, Save, ArrowLeft,
  MessageSquare, Camera, Mic, FileCheck, Tag, MoreVertical,
  Home, UserPlus, ClipboardCheck, Hammer, Receipt, XCircle,
  TrendingUp, Users, Briefcase, Target, LayoutGrid, List, Kanban
} from 'lucide-react';
import { useToast } from './Toast';
import { jobService } from '../services/jobService';
import {
  Job, JobStatus, JobNote, JobAction,
  JOB_PIPELINE_STAGES, getStageInfo, formatCurrency,
  INSURANCE_COMPANIES, LEAD_SOURCES, DAMAGE_TYPES, ROOF_TYPES,
  JOB_STATUS_GROUPS
} from '../types/job';
import { authService } from '../services/authService';

// ============ Form Field Components (defined outside to prevent re-creation) ============

interface InputFieldProps {
  label: string;
  value: string | number | undefined;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}

const FormInputField: React.FC<InputFieldProps> = ({ label, value, onChange, type = 'text', placeholder, required }) => (
  <div style={{ marginBottom: '1rem' }}>
    <label style={{ display: 'block', fontSize: '0.8125rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.375rem' }}>
      {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
    </label>
    <input
      type={type}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '0.75rem',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '0.9375rem',
      }}
    />
  </div>
);

interface SelectFieldProps {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

const FormSelectField: React.FC<SelectFieldProps> = ({ label, value, onChange, options }) => (
  <div style={{ marginBottom: '1rem' }}>
    <label style={{ display: 'block', fontSize: '0.8125rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.375rem' }}>
      {label}
    </label>
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '0.75rem',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '0.9375rem',
      }}
    >
      <option value="" style={{ background: '#1a1a2e' }}>Select...</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} style={{ background: '#1a1a2e' }}>{opt.label}</option>
      ))}
    </select>
  </div>
);

interface DocumentJobPanelProps {
  onClose: () => void;
  onNavigateToChat?: (context: string) => void;
  onNavigateToEmail?: (context: string) => void;
  onNavigateToUpload?: () => void;
  onNavigateToInsurance?: () => void;
  onNavigateToKnowledge?: () => void;
}

type ViewMode = 'list' | 'detail' | 'create' | 'edit' | 'kanban';
type ListFilter = 'all' | 'active' | 'won' | 'lost' | 'insurance' | 'needs_action';

const DocumentJobPanel: React.FC<DocumentJobPanelProps> = ({
  onClose,
  onNavigateToChat,
  onNavigateToEmail,
  onNavigateToUpload,
  onNavigateToInsurance,
  onNavigateToKnowledge
}) => {
  const toast = useToast();
  const currentUser = authService.getCurrentUser();

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [listStyle, setListStyle] = useState<'cards' | 'compact'>('cards');

  // Data state
  const [jobs, setJobs] = useState<Job[]>([]);
  const [editingJob, setEditingJob] = useState<Partial<Job> | null>(null);

  // Accordion state for detail view
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['basic', 'property']));

  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  // Load jobs on mount
  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    setIsLoading(true);
    try {
      const allJobs = await jobService.fetchJobs();
      setJobs(allJobs);
    } catch (error) {
      console.error('Failed to load jobs:', error);
      // Fallback to cached/local data
      setJobs(jobService.getAllJobs());
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to update nested job fields
  const updateJobField = useCallback((path: string, value: any) => {
    const parts = path.split('.');
    setEditingJob((prev) => {
      if (!prev) return prev;
      const updated = { ...prev };
      let current: any = updated;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        else current[parts[i]] = { ...current[parts[i]] };
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
      return updated;
    });
  }, []);

  // Build context string from job for AI features
  const buildJobContext = (job: Job): string => {
    const lines: string[] = [];
    lines.push(`JOB: ${job.jobNumber} - ${job.customer.name}`);
    lines.push(`Address: ${job.property.address}, ${job.property.city}, ${job.property.state}`);
    if (job.customer.phone) lines.push(`Phone: ${job.customer.phone}`);
    if (job.insurance?.company) {
      lines.push(`Insurance: ${job.insurance.company}`);
      if (job.insurance.claimNumber) lines.push(`Claim #: ${job.insurance.claimNumber}`);
    }
    lines.push(`Status: ${getStageInfo(job.status).label}`);
    if (job.notes.length > 0) {
      lines.push('\nJOB NOTES:');
      job.notes.slice(0, 5).forEach(note => {
        lines.push(`- ${note.text}`);
      });
    }
    return lines.join('\n');
  };

  // Navigate to Susan Chat with job context
  const handleAskSusan = (job: Job) => {
    const context = buildJobContext(job);
    if (onNavigateToChat) {
      onNavigateToChat(context);
    } else {
      // Fallback: store in localStorage and let App.tsx handle it
      localStorage.setItem('job_chat_context', JSON.stringify({
        jobId: job.id,
        jobNumber: job.jobNumber,
        customerName: job.customer.name,
        context: context
      }));
      onClose();
    }
  };

  // Navigate to Email with job context
  const handleGenerateEmail = (job: Job) => {
    const context = buildJobContext(job);
    if (onNavigateToEmail) {
      onNavigateToEmail(context);
    } else {
      // Fallback: store in localStorage
      localStorage.setItem('job_email_context', JSON.stringify({
        jobId: job.id,
        jobNumber: job.jobNumber,
        customerName: job.customer.name,
        customerEmail: job.customer.email,
        insurance: job.insurance?.company,
        context: context
      }));
      onClose();
    }
  };

  // Navigate to Upload with job linked
  const handleUploadForJob = (job: Job) => {
    localStorage.setItem('job_upload_context', JSON.stringify({
      jobId: job.id,
      jobNumber: job.jobNumber,
      customerName: job.customer.name
    }));
    if (onNavigateToUpload) {
      onNavigateToUpload();
    } else {
      onClose();
    }
  };

  // Navigate to Insurance directory
  const handleFindInsurance = (job: Job) => {
    if (job.insurance?.company) {
      localStorage.setItem('insurance_search', job.insurance.company);
    }
    if (onNavigateToInsurance) {
      onNavigateToInsurance();
    } else {
      onClose();
    }
  };

  // Filtered jobs based on search and filter
  const filteredJobs = useMemo(() => {
    let result = jobs;

    // Apply filter
    if (listFilter !== 'all') {
      const statusGroup = JOB_STATUS_GROUPS[listFilter as keyof typeof JOB_STATUS_GROUPS];
      if (statusGroup) {
        result = result.filter(job => statusGroup.includes(job.status));
      }
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(job =>
        job.title.toLowerCase().includes(query) ||
        job.customer.name.toLowerCase().includes(query) ||
        job.property.address.toLowerCase().includes(query) ||
        job.jobNumber.toLowerCase().includes(query) ||
        job.insurance?.company?.toLowerCase().includes(query)
      );
    }

    // Sort by updated date
    return result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [jobs, listFilter, searchQuery]);

  // Stats
  const stats = useMemo(() => jobService.getStats(), [jobs]);

  // Selected job
  const selectedJob = useMemo(() =>
    selectedJobId ? jobs.find(j => j.id === selectedJobId) : null,
    [jobs, selectedJobId]
  );

  // ============ Actions ============

  const handleCreateJob = () => {
    setEditingJob({
      customer: { name: '' },
      property: { address: '', city: '', state: 'VA' },
      status: 'new_lead',
      priority: 'medium',
      notes: [],
      attachments: [],
      actions: [],
    });
    setViewMode('create');
  };

  const handleEditJob = (job: Job) => {
    setEditingJob({ ...job });
    setViewMode('edit');
  };

  const handleSaveJob = async () => {
    if (!editingJob) return;

    if (!editingJob.customer?.name?.trim()) {
      toast.warning('Required Field', 'Please enter customer name');
      return;
    }
    if (!editingJob.property?.address?.trim()) {
      toast.warning('Required Field', 'Please enter property address');
      return;
    }

    const userId = currentUser?.email || 'unknown';

    try {
      if (viewMode === 'create') {
        const newJob = await jobService.createJob(userId, editingJob);
        toast.success('Job Created', `Job ${newJob.jobNumber} created successfully`);
      } else {
        await jobService.updateJob(editingJob.id!, editingJob);
        toast.success('Job Updated', 'Job saved successfully');
      }

      await loadJobs();
      setEditingJob(null);
      setViewMode('list');
    } catch (error) {
      toast.error('Error', 'Failed to save job. Please try again.');
      console.error('Save job error:', error);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (confirm('Are you sure you want to delete this job? This cannot be undone.')) {
      try {
        await jobService.deleteJob(jobId);
        toast.success('Job Deleted', 'Job has been removed');
        await loadJobs();
        if (selectedJobId === jobId) {
          setSelectedJobId(null);
          setViewMode('list');
        }
      } catch (error) {
        toast.error('Error', 'Failed to delete job');
      }
    }
  };

  const handleStatusChange = async (jobId: string, status: JobStatus) => {
    try {
      await jobService.updateStatus(jobId, status);
      await loadJobs();
      toast.success('Status Updated', `Job moved to ${getStageInfo(status).label}`);
    } catch (error) {
      toast.error('Error', 'Failed to update status');
    }
  };

  const handleAddNote = async (jobId: string, text: string) => {
    const author = currentUser?.name || 'Unknown';
    try {
      await jobService.addNote(jobId, text, author);
      await loadJobs();
      toast.success('Note Added', 'Note saved to job');
    } catch (error) {
      toast.error('Error', 'Failed to add note');
    }
  };

  const handleToggleAction = async (jobId: string, actionId: string) => {
    try {
      await jobService.toggleAction(jobId, actionId);
      await loadJobs();
    } catch (error) {
      console.error('Failed to toggle action:', error);
    }
  };

  const handleViewJob = (jobId: string) => {
    setSelectedJobId(jobId);
    setViewMode('detail');
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  // ============ Render Helpers ============

  const renderStatusBadge = (status: JobStatus, size: 'sm' | 'md' = 'md') => {
    const stage = getStageInfo(status);
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: size === 'sm' ? '2px 8px' : '4px 12px',
          borderRadius: '9999px',
          fontSize: size === 'sm' ? '11px' : '12px',
          fontWeight: '600',
          background: `${stage.color}20`,
          color: stage.color,
          border: `1px solid ${stage.color}40`,
        }}
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: stage.color }} />
        {stage.shortLabel}
      </span>
    );
  };

  const renderPriorityBadge = (priority: Job['priority']) => {
    const colors = {
      low: '#6b7280',
      medium: '#a1a1aa',
      high: '#f59e0b',
      urgent: '#ef4444',
    };
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '10px',
          fontWeight: '600',
          textTransform: 'uppercase',
          background: `${colors[priority]}20`,
          color: colors[priority],
        }}
      >
        {priority}
      </span>
    );
  };

  // ============ Header ============

  const renderHeader = () => (
    <div style={{
      background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
      padding: '1rem 1.5rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '2px solid rgba(220, 38, 38, 0.3)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {viewMode !== 'list' && viewMode !== 'kanban' && (
          <button
            onClick={() => {
              setViewMode('list');
              setEditingJob(null);
              setSelectedJobId(null);
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '8px',
              padding: '0.5rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ArrowLeft style={{ width: '1.25rem', height: '1.25rem', color: '#fff' }} />
          </button>
        )}
        <Briefcase style={{ width: '1.5rem', height: '1.5rem', color: '#fff' }} />
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', color: '#fff' }}>
            {viewMode === 'list' ? 'Job Manager' :
             viewMode === 'kanban' ? 'Job Pipeline' :
             viewMode === 'create' ? 'New Job' :
             viewMode === 'edit' ? 'Edit Job' :
             selectedJob?.jobNumber || 'Job Details'}
          </h2>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.8)' }}>
            {viewMode === 'list' ? `${filteredJobs.length} jobs` :
             viewMode === 'kanban' ? 'Drag to change status' :
             viewMode === 'create' ? 'Fill in job details' :
             viewMode === 'edit' ? 'Update job information' :
             selectedJob?.title}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {(viewMode === 'list' || viewMode === 'kanban') && (
          <>
            <button
              onClick={() => setViewMode(viewMode === 'list' ? 'kanban' : 'list')}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: '#fff',
                fontSize: '0.875rem',
              }}
            >
              {viewMode === 'list' ? <Kanban style={{ width: '1rem', height: '1rem' }} /> : <List style={{ width: '1rem', height: '1rem' }} />}
              {viewMode === 'list' ? 'Pipeline' : 'List'}
            </button>
            <button
              onClick={handleCreateJob}
              style={{
                background: 'rgba(255, 255, 255, 0.95)',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: '#dc2626',
                fontWeight: '600',
                fontSize: '0.875rem',
              }}
            >
              <Plus style={{ width: '1rem', height: '1rem' }} />
              New Job
            </button>
          </>
        )}
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            border: 'none',
            borderRadius: '8px',
            padding: '0.5rem',
            cursor: 'pointer',
          }}
        >
          <X style={{ width: '1.25rem', height: '1.25rem', color: '#fff' }} />
        </button>
      </div>
    </div>
  );

  // ============ Stats Bar ============

  const renderStatsBar = () => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: '1rem',
      padding: '1rem 1.5rem',
      background: 'rgba(220, 38, 38, 0.05)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#dc2626' }}>{stats.total}</div>
        <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)' }}>Total Jobs</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#a1a1aa' }}>
          {jobs.filter(j => JOB_STATUS_GROUPS.active.includes(j.status)).length}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)' }}>Active</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#ffffff' }}>
          {jobs.filter(j => JOB_STATUS_GROUPS.won.includes(j.status)).length}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)' }}>Won</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f59e0b' }}>{stats.needsAction}</div>
        <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)' }}>Needs Action</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#dc2626' }}>{formatCurrency(stats.totalValue)}</div>
        <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)' }}>Pipeline Value</div>
      </div>
    </div>
  );

  // ============ List View ============

  const renderListView = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {renderStatsBar()}

      {/* Search & Filters */}
      <div style={{
        padding: '1rem 1.5rem',
        display: 'flex',
        gap: '1rem',
        flexWrap: 'wrap',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
          <Search style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '1rem',
            height: '1rem',
            color: 'rgba(255, 255, 255, 0.4)',
          }} />
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.625rem 1rem 0.625rem 2.5rem',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '0.875rem',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(['all', 'active', 'won', 'lost', 'insurance', 'needs_action'] as ListFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setListFilter(filter)}
              style={{
                padding: '0.5rem 1rem',
                background: listFilter === filter ? '#dc2626' : 'rgba(255, 255, 255, 0.05)',
                border: '1px solid',
                borderColor: listFilter === filter ? '#dc2626' : 'rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.8125rem',
                fontWeight: listFilter === filter ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {filter === 'all' ? 'All' :
               filter === 'active' ? 'Active' :
               filter === 'won' ? 'Won' :
               filter === 'lost' ? 'Lost' :
               filter === 'insurance' ? 'Insurance' :
               'Needs Action'}
            </button>
          ))}
        </div>
      </div>

      {/* Job List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem 1.5rem',
      }}>
        {filteredJobs.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem',
            color: 'rgba(255, 255, 255, 0.5)',
          }}>
            <Briefcase style={{ width: '3rem', height: '3rem', marginBottom: '1rem', opacity: 0.3 }} />
            <p>No jobs found</p>
            <button
              onClick={handleCreateJob}
              style={{
                marginTop: '1rem',
                padding: '0.75rem 1.5rem',
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Create Your First Job
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filteredJobs.map((job) => (
              <div
                key={job.id}
                onClick={() => handleViewJob(job.id)}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  padding: '1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                  e.currentTarget.style.borderColor = 'rgba(220, 38, 38, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.4)' }}>#{job.jobNumber}</span>
                      {renderStatusBadge(job.status, 'sm')}
                      {renderPriorityBadge(job.priority)}
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: '#fff' }}>
                      {job.customer.name || 'No Name'}
                    </h3>
                  </div>
                  {job.financials?.estimateAmount && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1rem', fontWeight: '700', color: '#dc2626' }}>
                        {formatCurrency(job.financials.estimateAmount)}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.8125rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <MapPin style={{ width: '0.875rem', height: '0.875rem' }} />
                    {job.property.address}, {job.property.city}
                  </span>
                  {job.customer.phone && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Phone style={{ width: '0.875rem', height: '0.875rem' }} />
                      {job.customer.phone}
                    </span>
                  )}
                  {job.insurance?.company && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Shield style={{ width: '0.875rem', height: '0.875rem' }} />
                      {job.insurance.company}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.4)' }}>
                    Updated {new Date(job.updatedAt).toLocaleDateString()}
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {job.notes.length > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.4)' }}>
                        <FileText style={{ width: '0.75rem', height: '0.75rem' }} /> {job.notes.length}
                      </span>
                    )}
                    {job.attachments.length > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.4)' }}>
                        <Camera style={{ width: '0.75rem', height: '0.75rem' }} /> {job.attachments.length}
                      </span>
                    )}
                    {job.actions.filter(a => !a.completed).length > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#f59e0b' }}>
                        <AlertCircle style={{ width: '0.75rem', height: '0.75rem' }} /> {job.actions.filter(a => !a.completed).length}
                      </span>
                    )}
                    <ChevronRight style={{ width: '1rem', height: '1rem', color: 'rgba(255, 255, 255, 0.3)' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ============ Detail View ============

  const renderDetailView = () => {
    if (!selectedJob) return null;

    const SectionHeader: React.FC<{ id: string; title: string; icon: React.ReactNode; count?: number }> = ({ id, title, icon, count }) => (
      <button
        onClick={() => toggleSection(id)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem',
          background: 'rgba(255, 255, 255, 0.03)',
          border: 'none',
          borderRadius: expandedSections.has(id) ? '12px 12px 0 0' : '12px',
          cursor: 'pointer',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {icon}
          <span style={{ fontWeight: '600' }}>{title}</span>
          {count !== undefined && (
            <span style={{
              padding: '2px 8px',
              borderRadius: '9999px',
              background: 'rgba(220, 38, 38, 0.2)',
              color: '#dc2626',
              fontSize: '0.75rem',
              fontWeight: '600',
            }}>
              {count}
            </span>
          )}
        </div>
        {expandedSections.has(id) ? <ChevronDown style={{ width: '1.25rem', height: '1.25rem' }} /> : <ChevronRight style={{ width: '1.25rem', height: '1.25rem' }} />}
      </button>
    );

    const SectionContent: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => (
      expandedSections.has(id) ? (
        <div style={{
          padding: '1rem',
          background: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '0 0 12px 12px',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderTop: 'none',
        }}>
          {children}
        </div>
      ) : null
    );

    const InfoRow: React.FC<{ label: string; value?: string | number | null; icon?: React.ReactNode }> = ({ label, value, icon }) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
        <span style={{ color: 'rgba(255, 255, 255, 0.6)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {icon}
          {label}
        </span>
        <span style={{ color: '#fff', fontWeight: '500' }}>{value || '-'}</span>
      </div>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Job Header Card */}
        <div style={{
          padding: '1.5rem',
          background: 'rgba(220, 38, 38, 0.05)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                {renderStatusBadge(selectedJob.status)}
                {renderPriorityBadge(selectedJob.priority)}
              </div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: '#fff' }}>
                {selectedJob.customer.name}
              </h2>
              <p style={{ margin: '0.25rem 0 0', color: 'rgba(255, 255, 255, 0.6)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MapPin style={{ width: '1rem', height: '1rem' }} />
                {selectedJob.property.address}, {selectedJob.property.city}, {selectedJob.property.state}
              </p>
            </div>
            {selectedJob.financials?.estimateAmount && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.5)' }}>Estimate</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#dc2626' }}>
                  {formatCurrency(selectedJob.financials.estimateAmount)}
                </div>
              </div>
            )}
          </div>

          {/* Basic Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <button
              onClick={() => handleEditJob(selectedJob)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.5rem 1rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              <Edit3 style={{ width: '1rem', height: '1rem' }} /> Edit
            </button>
            {selectedJob.customer.phone && (
              <a
                href={`tel:${selectedJob.customer.phone}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  background: 'rgba(161, 161, 170, 0.2)',
                  border: '1px solid rgba(161, 161, 170, 0.3)',
                  borderRadius: '8px',
                  color: '#a1a1aa',
                  fontSize: '0.8125rem',
                  textDecoration: 'none',
                }}
              >
                <Phone style={{ width: '1rem', height: '1rem' }} /> Call
              </a>
            )}
            <button
              onClick={() => handleDeleteJob(selectedJob.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.5rem 1rem',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                color: '#ef4444',
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              <Trash2 style={{ width: '1rem', height: '1rem' }} /> Delete
            </button>
          </div>

          {/* AI Integration Actions - Prominent */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '0.75rem',
          }}>
            <button
              onClick={() => handleAskSusan(selectedJob)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                padding: '0.875rem 1rem',
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
              }}
            >
              <MessageSquare style={{ width: '1.125rem', height: '1.125rem' }} />
              Ask Susan
            </button>
            <button
              onClick={() => handleGenerateEmail(selectedJob)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                padding: '0.875rem 1rem',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
              }}
            >
              <Mail style={{ width: '1.125rem', height: '1.125rem' }} />
              Generate Email
            </button>
            <button
              onClick={() => handleUploadForJob(selectedJob)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                padding: '0.875rem 1rem',
                background: 'rgba(113, 113, 122, 0.2)',
                border: '1px solid rgba(113, 113, 122, 0.3)',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              <Camera style={{ width: '1.125rem', height: '1.125rem' }} />
              Upload Photos
            </button>
            <button
              onClick={() => handleFindInsurance(selectedJob)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                padding: '0.875rem 1rem',
                background: 'rgba(113, 113, 122, 0.2)',
                border: '1px solid rgba(113, 113, 122, 0.3)',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              <Shield style={{ width: '1.125rem', height: '1.125rem' }} />
              Insurance Info
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Status Change */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '0.5rem' }}>
                Change Status
              </label>
              <select
                value={selectedJob.status}
                onChange={(e) => handleStatusChange(selectedJob.id, e.target.value as JobStatus)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.875rem',
                }}
              >
                {JOB_PIPELINE_STAGES.map((stage) => (
                  <option key={stage.id} value={stage.id} style={{ background: '#1a1a2e' }}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Customer Section */}
            <SectionHeader id="customer" title="Customer Info" icon={<User style={{ width: '1.25rem', height: '1.25rem', color: '#dc2626' }} />} />
            <SectionContent id="customer">
              <InfoRow label="Name" value={selectedJob.customer.name} icon={<User style={{ width: '1rem', height: '1rem' }} />} />
              <InfoRow label="Phone" value={selectedJob.customer.phone} icon={<Phone style={{ width: '1rem', height: '1rem' }} />} />
              <InfoRow label="Email" value={selectedJob.customer.email} icon={<Mail style={{ width: '1rem', height: '1rem' }} />} />
              <InfoRow label="Preferred Contact" value={selectedJob.customer.preferredContact} />
            </SectionContent>

            {/* Property Section */}
            <SectionHeader id="property" title="Property Details" icon={<Home style={{ width: '1.25rem', height: '1.25rem', color: '#a1a1aa' }} />} />
            <SectionContent id="property">
              <InfoRow label="Address" value={selectedJob.property.address} icon={<MapPin style={{ width: '1rem', height: '1rem' }} />} />
              <InfoRow label="City" value={selectedJob.property.city} />
              <InfoRow label="State" value={selectedJob.property.state} />
              <InfoRow label="ZIP" value={selectedJob.property.zip} />
              <InfoRow label="Property Type" value={selectedJob.property.propertyType} icon={<Building style={{ width: '1rem', height: '1rem' }} />} />
              <InfoRow label="Stories" value={selectedJob.property.stories} />
              {selectedJob.property.accessNotes && (
                <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'rgba(161, 161, 170, 0.1)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Access Notes:</span>
                  <p style={{ margin: '0.25rem 0 0', color: '#fff', fontSize: '0.875rem' }}>{selectedJob.property.accessNotes}</p>
                </div>
              )}
            </SectionContent>

            {/* Insurance Section */}
            {selectedJob.insurance && (
              <>
                <SectionHeader id="insurance" title="Insurance Claim" icon={<Shield style={{ width: '1.25rem', height: '1.25rem', color: '#71717a' }} />} />
                <SectionContent id="insurance">
                  <InfoRow label="Company" value={selectedJob.insurance.company} />
                  <InfoRow label="Claim #" value={selectedJob.insurance.claimNumber} />
                  <InfoRow label="Adjuster" value={selectedJob.insurance.adjusterName} />
                  <InfoRow label="Adjuster Phone" value={selectedJob.insurance.adjusterPhone} />
                  <InfoRow label="Policy Type" value={selectedJob.insurance.policyType?.toUpperCase()} />
                  <InfoRow label="Deductible" value={formatCurrency(selectedJob.insurance.deductible)} />
                  <InfoRow label="Initial Estimate" value={formatCurrency(selectedJob.insurance.initialEstimate)} />
                  <InfoRow label="Supplement Amount" value={formatCurrency(selectedJob.insurance.supplementAmount)} />
                </SectionContent>
              </>
            )}

            {/* Notes Section */}
            <SectionHeader id="notes" title="Notes" icon={<FileText style={{ width: '1.25rem', height: '1.25rem', color: '#a1a1aa' }} />} count={selectedJob.notes.length} />
            <SectionContent id="notes">
              <NoteInput onAdd={(text) => handleAddNote(selectedJob.id, text)} />
              {selectedJob.notes.length > 0 ? (
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {selectedJob.notes.map((note) => (
                    <div key={note.id} style={{
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '8px',
                      borderLeft: '3px solid #dc2626',
                    }}>
                      <p style={{ margin: 0, color: '#fff', fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>{note.text}</p>
                      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.4)' }}>
                        <span>{note.author}</span>
                        <span>{new Date(note.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.875rem', marginTop: '0.5rem' }}>No notes yet</p>
              )}
            </SectionContent>

            {/* Actions Section */}
            <SectionHeader
              id="actions"
              title="Action Items"
              icon={<CheckCircle2 style={{ width: '1.25rem', height: '1.25rem', color: '#dc2626' }} />}
              count={selectedJob.actions.filter(a => !a.completed).length}
            />
            <SectionContent id="actions">
              <ActionInput onAdd={(desc) => {
                jobService.addAction(selectedJob.id, desc);
                loadJobs();
              }} />
              {selectedJob.actions.length > 0 ? (
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedJob.actions.map((action) => (
                    <div
                      key={action.id}
                      onClick={() => handleToggleAction(selectedJob.id, action.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        background: action.completed ? 'rgba(34, 197, 94, 0.05)' : 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        width: '1.25rem',
                        height: '1.25rem',
                        borderRadius: '4px',
                        border: action.completed ? 'none' : '2px solid rgba(255, 255, 255, 0.3)',
                        background: action.completed ? '#71717a' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {action.completed && <CheckCircle2 style={{ width: '1rem', height: '1rem', color: '#fff' }} />}
                      </div>
                      <span style={{
                        flex: 1,
                        color: action.completed ? 'rgba(255, 255, 255, 0.4)' : '#fff',
                        textDecoration: action.completed ? 'line-through' : 'none',
                        fontSize: '0.875rem',
                      }}>
                        {action.description}
                      </span>
                      {action.dueDate && (
                        <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.4)' }}>
                          {new Date(action.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.875rem', marginTop: '0.5rem' }}>No action items</p>
              )}
            </SectionContent>
          </div>
        </div>
      </div>
    );
  };

  // ============ Create/Edit Form ============

  const renderForm = () => {
    if (!editingJob) return null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {/* Customer Info */}
          <div style={{
            background: 'rgba(220, 38, 38, 0.05)',
            border: '1px solid rgba(220, 38, 38, 0.2)',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}>
            <h3 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#dc2626', fontSize: '1rem' }}>
              <User style={{ width: '1.25rem', height: '1.25rem' }} /> Customer Information
            </h3>
            <FormInputField label="Customer Name" value={editingJob.customer?.name} onChange={(v) => updateJobField('customer.name', v)} placeholder="John Smith" required />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormInputField label="Phone" value={editingJob.customer?.phone} onChange={(v) => updateJobField('customer.phone', v)} type="tel" placeholder="(555) 123-4567" />
              <FormInputField label="Email" value={editingJob.customer?.email} onChange={(v) => updateJobField('customer.email', v)} type="email" placeholder="john@email.com" />
            </div>
            <FormSelectField
              label="Preferred Contact"
              value={editingJob.customer?.preferredContact}
              onChange={(v) => updateJobField('customer.preferredContact', v)}
              options={[
                { value: 'call', label: 'Phone Call' },
                { value: 'text', label: 'Text Message' },
                { value: 'email', label: 'Email' },
              ]}
            />
          </div>

          {/* Property Info */}
          <div style={{
            background: 'rgba(161, 161, 170, 0.05)',
            border: '1px solid rgba(161, 161, 170, 0.2)',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}>
            <h3 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#a1a1aa', fontSize: '1rem' }}>
              <Home style={{ width: '1.25rem', height: '1.25rem' }} /> Property Details
            </h3>
            <FormInputField label="Street Address" value={editingJob.property?.address} onChange={(v) => updateJobField('property.address', v)} placeholder="123 Main Street" required />
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
              <FormInputField label="City" value={editingJob.property?.city} onChange={(v) => updateJobField('property.city', v)} placeholder="Richmond" required />
              <FormSelectField
                label="State"
                value={editingJob.property?.state}
                onChange={(v) => updateJobField('property.state', v)}
                options={[
                  { value: 'VA', label: 'Virginia' },
                  { value: 'MD', label: 'Maryland' },
                  { value: 'PA', label: 'Pennsylvania' },
                ]}
              />
              <FormInputField label="ZIP" value={editingJob.property?.zip} onChange={(v) => updateJobField('property.zip', v)} placeholder="23220" />
            </div>
          </div>

          {/* Job Info */}
          <div style={{
            background: 'rgba(113, 113, 122, 0.05)',
            border: '1px solid rgba(113, 113, 122, 0.2)',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}>
            <h3 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#71717a', fontSize: '1rem' }}>
              <Briefcase style={{ width: '1.25rem', height: '1.25rem' }} /> Job Details
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormSelectField
                label="Status"
                value={editingJob.status}
                onChange={(v) => updateJobField('status', v)}
                options={JOB_PIPELINE_STAGES.map(s => ({ value: s.id, label: s.label }))}
              />
              <FormSelectField
                label="Priority"
                value={editingJob.priority}
                onChange={(v) => updateJobField('priority', v)}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                  { value: 'urgent', label: 'Urgent' },
                ]}
              />
            </div>
            <FormSelectField
              label="Lead Source"
              value={editingJob.leadSource}
              onChange={(v) => updateJobField('leadSource', v)}
              options={LEAD_SOURCES}
            />
            <FormInputField
              label="Estimate Amount"
              value={editingJob.financials?.estimateAmount}
              onChange={(v) => updateJobField('financials.estimateAmount', v)}
              type="number"
              placeholder="5000"
            />
          </div>

          {/* Insurance Info */}
          <div style={{
            background: 'rgba(161, 161, 170, 0.05)',
            border: '1px solid rgba(161, 161, 170, 0.2)',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}>
            <h3 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#a1a1aa', fontSize: '1rem' }}>
              <Shield style={{ width: '1.25rem', height: '1.25rem' }} /> Insurance (Optional)
            </h3>
            <FormSelectField
              label="Insurance Company"
              value={editingJob.insurance?.company}
              onChange={(v) => updateJobField('insurance.company', v)}
              options={INSURANCE_COMPANIES.map(c => ({ value: c, label: c }))}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormInputField label="Claim Number" value={editingJob.insurance?.claimNumber} onChange={(v) => updateJobField('insurance.claimNumber', v)} placeholder="CLM-12345" />
              <FormInputField label="Adjuster Name" value={editingJob.insurance?.adjusterName} onChange={(v) => updateJobField('insurance.adjusterName', v)} placeholder="Jane Doe" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormInputField label="Adjuster Phone" value={editingJob.insurance?.adjusterPhone} onChange={(v) => updateJobField('insurance.adjusterPhone', v)} type="tel" />
              <FormInputField label="Deductible" value={editingJob.insurance?.deductible} onChange={(v) => updateJobField('insurance.deductible', v)} type="number" placeholder="1000" />
            </div>
          </div>

          {/* Job Notes - Primary Section */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.1) 0%, rgba(185, 28, 28, 0.05) 100%)',
            border: '2px solid rgba(220, 38, 38, 0.3)',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}>
            <h3 style={{ margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#dc2626', fontSize: '1.125rem', fontWeight: '700' }}>
              <FileText style={{ width: '1.25rem', height: '1.25rem' }} /> Job Notes
            </h3>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', color: 'rgba(255, 255, 255, 0.6)' }}>
              Notes are saved with the job. Add damage details, customer requests, next steps, etc.
            </p>
            <textarea
              value={editingJob.notes?.[0]?.text || ''}
              onChange={(e) => {
                const noteText = e.target.value;
                const existingNotes = editingJob.notes || [];
                if (existingNotes.length > 0) {
                  existingNotes[0] = { ...existingNotes[0], text: noteText };
                } else {
                  existingNotes.push({
                    id: Date.now().toString(),
                    text: noteText,
                    createdAt: new Date().toISOString(),
                    author: currentUser?.name || 'Unknown',
                    type: 'general' as const
                  });
                }
                setEditingJob(prev => ({ ...prev, notes: [...existingNotes] }));
              }}
              placeholder="Describe the situation, damage observed, customer concerns, next steps needed..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '0.875rem',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.9375rem',
                lineHeight: '1.5',
                resize: 'vertical',
              }}
            />

            {/* AI Quick Actions - Optional */}
            <div style={{
              marginTop: '1.25rem',
              paddingTop: '1rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            }}>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Optional: Get AI Help
              </p>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem',
            }}>
              <button
                type="button"
                onClick={() => {
                  const context = [
                    `Customer: ${editingJob.customer?.name || 'Not set'}`,
                    `Address: ${editingJob.property?.address || 'Not set'}, ${editingJob.property?.city || ''}, ${editingJob.property?.state || ''}`,
                    editingJob.customer?.phone ? `Phone: ${editingJob.customer.phone}` : '',
                    editingJob.insurance?.company ? `Insurance: ${editingJob.insurance.company}` : '',
                    editingJob.notes?.[0]?.text ? `\nNotes:\n${editingJob.notes[0].text}` : '',
                  ].filter(Boolean).join('\n');

                  localStorage.setItem('job_chat_context', context);
                  if (onNavigateToChat) {
                    onNavigateToChat(context);
                  } else {
                    onClose();
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  padding: '0.875rem 1rem',
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
                }}
              >
                <MessageSquare style={{ width: '1.125rem', height: '1.125rem' }} />
                Ask Susan
              </button>
              <button
                type="button"
                onClick={() => {
                  const context = [
                    `Customer: ${editingJob.customer?.name || 'Not set'}`,
                    `Address: ${editingJob.property?.address || 'Not set'}, ${editingJob.property?.city || ''}, ${editingJob.property?.state || ''}`,
                    editingJob.customer?.email ? `Email: ${editingJob.customer.email}` : '',
                    editingJob.insurance?.company ? `Insurance: ${editingJob.insurance.company}` : '',
                    editingJob.insurance?.claimNumber ? `Claim #: ${editingJob.insurance.claimNumber}` : '',
                    editingJob.notes?.[0]?.text ? `\nJob Notes:\n${editingJob.notes[0].text}` : '',
                  ].filter(Boolean).join('\n');

                  if (onNavigateToEmail) {
                    onNavigateToEmail(context);
                  } else {
                    localStorage.setItem('job_email_context', JSON.stringify({ context }));
                    onClose();
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  padding: '0.875rem 1rem',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                }}
              >
                <Mail style={{ width: '1.125rem', height: '1.125rem' }} />
                Generate Email
              </button>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          gap: '1rem',
        }}>
          <button
            onClick={() => {
              setEditingJob(null);
              setViewMode('list');
            }}
            style={{
              flex: 1,
              padding: '0.875rem',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSaveJob}
            style={{
              flex: 2,
              padding: '0.875rem',
              background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)',
            }}
          >
            <Save style={{ width: '1.25rem', height: '1.25rem' }} />
            {viewMode === 'create' ? 'Create Job' : 'Save Changes'}
          </button>
        </div>
      </div>
    );
  };

  // ============ Kanban View ============

  const renderKanbanView = () => {
    // Group jobs by main status categories
    const stages = [
      { id: 'leads', label: 'Leads', statuses: ['new_lead', 'contacted'], color: '#71717a' },
      { id: 'inspection', label: 'Inspection', statuses: ['inspection_scheduled', 'inspection_complete'], color: '#a1a1aa' },
      { id: 'estimate', label: 'Estimate', statuses: ['estimate_sent', 'follow_up'], color: '#d4d4d8' },
      { id: 'sold', label: 'Sold', statuses: ['contract_signed', 'insurance_filed', 'adjuster_scheduled', 'adjuster_complete', 'supplement_requested', 'approved'], color: '#dc2626' },
      { id: 'production', label: 'Production', statuses: ['materials_ordered', 'scheduled', 'in_progress'], color: '#ef4444' },
      { id: 'complete', label: 'Complete', statuses: ['complete', 'invoiced', 'paid'], color: '#ffffff' },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {renderStatsBar()}
        <div style={{
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
          padding: '1rem',
        }}>
          <div style={{
            display: 'flex',
            gap: '1rem',
            height: '100%',
            minWidth: 'max-content',
          }}>
            {stages.map((stage) => {
              const stageJobs = jobs.filter(j => stage.statuses.includes(j.status));
              return (
                <div
                  key={stage.id}
                  style={{
                    width: '280px',
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <div style={{
                    padding: '1rem',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: stage.color }} />
                      <span style={{ fontWeight: '600', color: '#fff' }}>{stage.label}</span>
                    </div>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      background: `${stage.color}20`,
                      color: stage.color,
                      fontSize: '0.75rem',
                      fontWeight: '600',
                    }}>
                      {stageJobs.length}
                    </span>
                  </div>
                  <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}>
                    {stageJobs.map((job) => (
                      <div
                        key={job.id}
                        onClick={() => handleViewJob(job.id)}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          borderRadius: '8px',
                          padding: '0.75rem',
                          cursor: 'pointer',
                          border: '1px solid transparent',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = stage.color;
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'transparent';
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }}
                      >
                        <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#fff', marginBottom: '0.25rem' }}>
                          {job.customer.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.5rem' }}>
                          {job.property.address}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          {renderPriorityBadge(job.priority)}
                          {job.financials?.estimateAmount && (
                            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#dc2626' }}>
                              {formatCurrency(job.financials.estimateAmount)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ============ Main Render ============

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'var(--bg-primary, #0a0a0a)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {renderHeader()}
      {viewMode === 'list' && renderListView()}
      {viewMode === 'kanban' && renderKanbanView()}
      {viewMode === 'detail' && renderDetailView()}
      {(viewMode === 'create' || viewMode === 'edit') && renderForm()}
    </div>
  );
};

// ============ Sub-components ============

const NoteInput: React.FC<{ onAdd: (text: string) => void }> = ({ onAdd }) => {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder="Add a note..."
        style={{
          flex: 1,
          padding: '0.625rem 0.875rem',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '8px',
          color: '#fff',
          fontSize: '0.875rem',
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={!text.trim()}
        style={{
          padding: '0.625rem 1rem',
          background: text.trim() ? '#dc2626' : 'rgba(255, 255, 255, 0.1)',
          border: 'none',
          borderRadius: '8px',
          color: '#fff',
          cursor: text.trim() ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <Plus style={{ width: '1rem', height: '1rem' }} />
      </button>
    </div>
  );
};

const ActionInput: React.FC<{ onAdd: (desc: string) => void }> = ({ onAdd }) => {
  const [desc, setDesc] = useState('');

  const handleSubmit = () => {
    if (!desc.trim()) return;
    onAdd(desc.trim());
    setDesc('');
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <input
        type="text"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder="Add action item..."
        style={{
          flex: 1,
          padding: '0.625rem 0.875rem',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '8px',
          color: '#fff',
          fontSize: '0.875rem',
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={!desc.trim()}
        style={{
          padding: '0.625rem 1rem',
          background: desc.trim() ? '#dc2626' : 'rgba(255, 255, 255, 0.1)',
          border: 'none',
          borderRadius: '8px',
          color: '#fff',
          cursor: desc.trim() ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <Plus style={{ width: '1rem', height: '1rem' }} />
      </button>
    </div>
  );
};

export default DocumentJobPanel;
