/**
 * Job Service
 * Handles all CRUD operations for job management
 * Uses localStorage with optional API sync
 */

import {
  Job,
  JobStatus,
  JobNote,
  JobAttachment,
  JobAction,
  createEmptyJob,
  JOB_STATUS_GROUPS
} from '../types/job';

const STORAGE_KEY = 'susan21_jobs';
const JOB_COUNTER_KEY = 'susan21_job_counter';

class JobService {
  private static instance: JobService;

  static getInstance(): JobService {
    if (!JobService.instance) {
      JobService.instance = new JobService();
    }
    return JobService.instance;
  }

  // ============ CRUD Operations ============

  /**
   * Get all jobs
   */
  getAllJobs(): Job[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[JobService] Error getting jobs:', error);
      return [];
    }
  }

  /**
   * Get jobs for a specific user
   */
  getJobsByUser(userId: string): Job[] {
    return this.getAllJobs().filter(job => job.userId === userId);
  }

  /**
   * Get a single job by ID
   */
  getJob(jobId: string): Job | null {
    const jobs = this.getAllJobs();
    return jobs.find(job => job.id === jobId) || null;
  }

  /**
   * Create a new job
   */
  createJob(userId: string, data?: Partial<Job>): Job {
    const jobs = this.getAllJobs();
    const newJob: Job = {
      ...createEmptyJob(userId),
      ...data,
      id: Date.now().toString(),
      jobNumber: this.generateNextJobNumber(),
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Auto-generate title if not provided
    if (!newJob.title && newJob.property?.address) {
      newJob.title = `${newJob.property.address} - ${newJob.customer?.name || 'New Job'}`;
    } else if (!newJob.title) {
      newJob.title = `Job ${newJob.jobNumber}`;
    }

    jobs.unshift(newJob); // Add to beginning
    this.saveJobs(jobs);

    console.log('[JobService] Created job:', newJob.id);
    return newJob;
  }

  /**
   * Update an existing job
   */
  updateJob(jobId: string, updates: Partial<Job>): Job | null {
    const jobs = this.getAllJobs();
    const index = jobs.findIndex(job => job.id === jobId);

    if (index === -1) {
      console.error('[JobService] Job not found:', jobId);
      return null;
    }

    const updatedJob: Job = {
      ...jobs[index],
      ...updates,
      id: jobId, // Preserve ID
      updatedAt: new Date().toISOString(),
    };

    jobs[index] = updatedJob;
    this.saveJobs(jobs);

    console.log('[JobService] Updated job:', jobId);
    return updatedJob;
  }

  /**
   * Delete a job
   */
  deleteJob(jobId: string): boolean {
    const jobs = this.getAllJobs();
    const filtered = jobs.filter(job => job.id !== jobId);

    if (filtered.length === jobs.length) {
      console.error('[JobService] Job not found:', jobId);
      return false;
    }

    this.saveJobs(filtered);
    console.log('[JobService] Deleted job:', jobId);
    return true;
  }

  // ============ Status Management ============

  /**
   * Update job status
   */
  updateStatus(jobId: string, status: JobStatus): Job | null {
    return this.updateJob(jobId, { status });
  }

  /**
   * Get jobs by status
   */
  getJobsByStatus(status: JobStatus | JobStatus[]): Job[] {
    const statuses = Array.isArray(status) ? status : [status];
    return this.getAllJobs().filter(job => statuses.includes(job.status));
  }

  /**
   * Get jobs by status group
   */
  getJobsByStatusGroup(group: keyof typeof JOB_STATUS_GROUPS): Job[] {
    const statuses = JOB_STATUS_GROUPS[group];
    return this.getAllJobs().filter(job => statuses.includes(job.status));
  }

  // ============ Notes Management ============

  /**
   * Add a note to a job
   */
  addNote(jobId: string, text: string, author: string, type?: JobNote['type']): Job | null {
    const job = this.getJob(jobId);
    if (!job) return null;

    const note: JobNote = {
      id: Date.now().toString(),
      text,
      createdAt: new Date().toISOString(),
      author,
      type: type || 'general',
    };

    const updatedNotes = [note, ...job.notes];
    return this.updateJob(jobId, { notes: updatedNotes });
  }

  /**
   * Update a note
   */
  updateNote(jobId: string, noteId: string, text: string): Job | null {
    const job = this.getJob(jobId);
    if (!job) return null;

    const updatedNotes = job.notes.map(note =>
      note.id === noteId ? { ...note, text } : note
    );
    return this.updateJob(jobId, { notes: updatedNotes });
  }

  /**
   * Delete a note
   */
  deleteNote(jobId: string, noteId: string): Job | null {
    const job = this.getJob(jobId);
    if (!job) return null;

    const updatedNotes = job.notes.filter(note => note.id !== noteId);
    return this.updateJob(jobId, { notes: updatedNotes });
  }

  // ============ Attachments Management ============

  /**
   * Add an attachment to a job
   */
  addAttachment(jobId: string, attachment: Omit<JobAttachment, 'id' | 'createdAt'>): Job | null {
    const job = this.getJob(jobId);
    if (!job) return null;

    const newAttachment: JobAttachment = {
      ...attachment,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    };

    const updatedAttachments = [...job.attachments, newAttachment];
    return this.updateJob(jobId, { attachments: updatedAttachments });
  }

  /**
   * Remove an attachment
   */
  removeAttachment(jobId: string, attachmentId: string): Job | null {
    const job = this.getJob(jobId);
    if (!job) return null;

    const updatedAttachments = job.attachments.filter(a => a.id !== attachmentId);
    return this.updateJob(jobId, { attachments: updatedAttachments });
  }

  // ============ Actions/Tasks Management ============

  /**
   * Add an action item
   */
  addAction(jobId: string, description: string, dueDate?: string): Job | null {
    const job = this.getJob(jobId);
    if (!job) return null;

    const action: JobAction = {
      id: Date.now().toString(),
      description,
      dueDate,
      completed: false,
    };

    const updatedActions = [...job.actions, action];
    return this.updateJob(jobId, { actions: updatedActions });
  }

  /**
   * Toggle action completion
   */
  toggleAction(jobId: string, actionId: string): Job | null {
    const job = this.getJob(jobId);
    if (!job) return null;

    const updatedActions = job.actions.map(action =>
      action.id === actionId
        ? {
            ...action,
            completed: !action.completed,
            completedAt: !action.completed ? new Date().toISOString() : undefined,
          }
        : action
    );
    return this.updateJob(jobId, { actions: updatedActions });
  }

  /**
   * Delete an action
   */
  deleteAction(jobId: string, actionId: string): Job | null {
    const job = this.getJob(jobId);
    if (!job) return null;

    const updatedActions = job.actions.filter(a => a.id !== actionId);
    return this.updateJob(jobId, { actions: updatedActions });
  }

  // ============ Search & Filter ============

  /**
   * Search jobs by text
   */
  searchJobs(query: string): Job[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllJobs().filter(job =>
      job.title.toLowerCase().includes(lowerQuery) ||
      job.customer.name.toLowerCase().includes(lowerQuery) ||
      job.property.address.toLowerCase().includes(lowerQuery) ||
      job.property.city.toLowerCase().includes(lowerQuery) ||
      job.jobNumber.toLowerCase().includes(lowerQuery) ||
      job.insurance?.company?.toLowerCase().includes(lowerQuery) ||
      job.insurance?.claimNumber?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Filter jobs by multiple criteria
   */
  filterJobs(filters: {
    status?: JobStatus[];
    priority?: Job['priority'][];
    state?: Job['property']['state'][];
    dateRange?: { start: string; end: string };
    hasInsurance?: boolean;
  }): Job[] {
    let jobs = this.getAllJobs();

    if (filters.status?.length) {
      jobs = jobs.filter(job => filters.status!.includes(job.status));
    }
    if (filters.priority?.length) {
      jobs = jobs.filter(job => filters.priority!.includes(job.priority));
    }
    if (filters.state?.length) {
      jobs = jobs.filter(job => filters.state!.includes(job.property.state));
    }
    if (filters.hasInsurance !== undefined) {
      jobs = jobs.filter(job =>
        filters.hasInsurance
          ? !!job.insurance?.company
          : !job.insurance?.company
      );
    }
    if (filters.dateRange) {
      jobs = jobs.filter(job => {
        const date = new Date(job.createdAt);
        return date >= new Date(filters.dateRange!.start) &&
               date <= new Date(filters.dateRange!.end);
      });
    }

    return jobs;
  }

  // ============ Statistics ============

  /**
   * Get job statistics
   */
  getStats(userId?: string): {
    total: number;
    byStatus: Record<JobStatus, number>;
    byPriority: Record<string, number>;
    totalValue: number;
    avgValue: number;
    needsAction: number;
  } {
    let jobs = userId ? this.getJobsByUser(userId) : this.getAllJobs();

    const byStatus = {} as Record<JobStatus, number>;
    const byPriority = { low: 0, medium: 0, high: 0, urgent: 0 };
    let totalValue = 0;
    let jobsWithValue = 0;

    jobs.forEach(job => {
      byStatus[job.status] = (byStatus[job.status] || 0) + 1;
      byPriority[job.priority] = (byPriority[job.priority] || 0) + 1;
      if (job.financials?.estimateAmount) {
        totalValue += job.financials.estimateAmount;
        jobsWithValue++;
      }
    });

    const needsAction = jobs.filter(job =>
      JOB_STATUS_GROUPS.needsAction.includes(job.status) ||
      job.actions.some(a => !a.completed && a.dueDate && new Date(a.dueDate) <= new Date())
    ).length;

    return {
      total: jobs.length,
      byStatus,
      byPriority,
      totalValue,
      avgValue: jobsWithValue > 0 ? totalValue / jobsWithValue : 0,
      needsAction,
    };
  }

  // ============ Integration Helpers ============

  /**
   * Link a chat session to a job
   */
  linkChatSession(jobId: string, sessionId: string): Job | null {
    return this.updateJob(jobId, { linkedChatSessionId: sessionId });
  }

  /**
   * Link a transcript to a job
   */
  linkTranscript(jobId: string, transcriptId: string): Job | null {
    const job = this.getJob(jobId);
    if (!job) return null;

    const linkedTranscriptIds = [...(job.linkedTranscriptIds || []), transcriptId];
    return this.updateJob(jobId, { linkedTranscriptIds });
  }

  /**
   * Link an email to a job
   */
  linkEmail(jobId: string, emailId: string): Job | null {
    const job = this.getJob(jobId);
    if (!job) return null;

    const linkedEmailIds = [...(job.linkedEmailIds || []), emailId];
    return this.updateJob(jobId, { linkedEmailIds });
  }

  /**
   * Link an image analysis to a job
   */
  linkImageAnalysis(jobId: string, analysisId: string): Job | null {
    const job = this.getJob(jobId);
    if (!job) return null;

    const linkedImageAnalysisIds = [...(job.linkedImageAnalysisIds || []), analysisId];
    return this.updateJob(jobId, { linkedImageAnalysisIds });
  }

  // ============ Private Helpers ============

  private saveJobs(jobs: Job[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    } catch (error) {
      console.error('[JobService] Error saving jobs:', error);
    }
  }

  private generateNextJobNumber(): string {
    try {
      const year = new Date().getFullYear();
      const counterKey = `${JOB_COUNTER_KEY}_${year}`;
      let counter = parseInt(localStorage.getItem(counterKey) || '0', 10);
      counter++;
      localStorage.setItem(counterKey, counter.toString());
      return `${year}-${counter.toString().padStart(4, '0')}`;
    } catch {
      // Fallback to random
      const year = new Date().getFullYear();
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      return `${year}-${random}`;
    }
  }

  // ============ Import/Export ============

  /**
   * Export all jobs as JSON
   */
  exportJobs(): string {
    const jobs = this.getAllJobs();
    return JSON.stringify(jobs, null, 2);
  }

  /**
   * Import jobs from JSON
   */
  importJobs(jsonString: string, merge: boolean = true): number {
    try {
      const importedJobs: Job[] = JSON.parse(jsonString);

      if (!Array.isArray(importedJobs)) {
        throw new Error('Invalid format: expected array');
      }

      if (merge) {
        const existingJobs = this.getAllJobs();
        const existingIds = new Set(existingJobs.map(j => j.id));
        const newJobs = importedJobs.filter(j => !existingIds.has(j.id));
        this.saveJobs([...existingJobs, ...newJobs]);
        return newJobs.length;
      } else {
        this.saveJobs(importedJobs);
        return importedJobs.length;
      }
    } catch (error) {
      console.error('[JobService] Import error:', error);
      return 0;
    }
  }

  /**
   * Clear all jobs (use with caution!)
   */
  clearAllJobs(): void {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[JobService] All jobs cleared');
  }
}

export const jobService = JobService.getInstance();
export default jobService;
