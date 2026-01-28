/**
 * Job Service
 * Handles all CRUD operations for job management
 * Uses API with database persistence, falls back to localStorage for offline
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
import { authService } from './authService';

const API_BASE = '/api/jobs';
const STORAGE_KEY = 'susan21_jobs_offline';
const PENDING_SYNC_KEY = 'susan21_jobs_pending_sync';

class JobService {
  private static instance: JobService;
  private cache: Job[] | null = null;
  private pendingSync: { action: string; data: any }[] = [];

  static getInstance(): JobService {
    if (!JobService.instance) {
      JobService.instance = new JobService();
    }
    return JobService.instance;
  }

  private getHeaders(): HeadersInit {
    const user = authService.getCurrentUser();
    return {
      'Content-Type': 'application/json',
      'x-user-email': user?.email || '',
    };
  }

  // ============ CRUD Operations ============

  /**
   * Get all jobs from API
   */
  async fetchJobs(filters?: {
    status?: string;
    priority?: string;
    search?: string;
  }): Promise<Job[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.priority) params.set('priority', filters.priority);
      if (filters?.search) params.set('search', filters.search);

      const url = params.toString() ? `${API_BASE}?${params}` : API_BASE;
      const response = await fetch(url, { headers: this.getHeaders() });

      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }

      const data = await response.json();
      this.cache = data.jobs;
      this.saveToLocalStorage(data.jobs);
      return data.jobs;
    } catch (error) {
      console.error('[JobService] API error, using localStorage:', error);
      return this.getFromLocalStorage();
    }
  }

  /**
   * Get all jobs (sync version for backwards compatibility)
   */
  getAllJobs(): Job[] {
    // Return cached data if available, otherwise localStorage
    if (this.cache) return this.cache;
    return this.getFromLocalStorage();
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
  async fetchJob(jobId: string): Promise<Job | null> {
    try {
      const response = await fetch(`${API_BASE}/${jobId}`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch job');
      }

      const data = await response.json();
      return data.job;
    } catch (error) {
      console.error('[JobService] Error fetching job:', error);
      const jobs = this.getAllJobs();
      return jobs.find(j => j.id === jobId) || null;
    }
  }

  /**
   * Get a single job by ID (sync version)
   */
  getJob(jobId: string): Job | null {
    const jobs = this.getAllJobs();
    return jobs.find(job => job.id === jobId) || null;
  }

  /**
   * Create a new job
   */
  async createJob(userId: string, data?: Partial<Job>): Promise<Job> {
    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create job');
      }

      const result = await response.json();

      // Update cache
      if (this.cache) {
        this.cache.unshift(result.job);
      }

      console.log('[JobService] Created job:', result.job.jobNumber);
      return result.job;
    } catch (error) {
      console.error('[JobService] API error, creating locally:', error);
      // Fallback to local creation
      return this.createJobLocally(userId, data);
    }
  }

  /**
   * Update an existing job
   */
  async updateJob(jobId: string, updates: Partial<Job>): Promise<Job | null> {
    try {
      const response = await fetch(`${API_BASE}/${jobId}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update job');
      }

      const result = await response.json();

      // Update cache
      if (this.cache) {
        const index = this.cache.findIndex(j => j.id === jobId);
        if (index !== -1) {
          this.cache[index] = result.job;
        }
      }

      console.log('[JobService] Updated job:', result.job.jobNumber);
      return result.job;
    } catch (error) {
      console.error('[JobService] API error, updating locally:', error);
      return this.updateJobLocally(jobId, updates);
    }
  }

  /**
   * Delete a job
   */
  async deleteJob(jobId: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/${jobId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to delete job');
      }

      // Update cache
      if (this.cache) {
        this.cache = this.cache.filter(j => j.id !== jobId);
      }

      console.log('[JobService] Deleted job:', jobId);
      return true;
    } catch (error) {
      console.error('[JobService] API error, deleting locally:', error);
      return this.deleteJobLocally(jobId);
    }
  }

  // ============ Status Management ============

  /**
   * Update job status
   */
  async updateStatus(jobId: string, status: JobStatus): Promise<Job | null> {
    try {
      const response = await fetch(`${API_BASE}/${jobId}/status`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      // Update cache
      if (this.cache) {
        const job = this.cache.find(j => j.id === jobId);
        if (job) {
          job.status = status;
          job.updatedAt = new Date().toISOString();
        }
      }

      return this.getJob(jobId);
    } catch (error) {
      console.error('[JobService] Error updating status:', error);
      return this.updateJobLocally(jobId, { status });
    }
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
  async addNote(jobId: string, text: string, author: string, type?: JobNote['type']): Promise<Job | null> {
    try {
      const response = await fetch(`${API_BASE}/${jobId}/notes`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ text, type }),
      });

      if (!response.ok) {
        throw new Error('Failed to add note');
      }

      // Refresh the job from cache
      return this.fetchJob(jobId);
    } catch (error) {
      console.error('[JobService] Error adding note:', error);
      return this.addNoteLocally(jobId, text, author, type);
    }
  }

  // ============ Actions/Tasks Management ============

  /**
   * Add an action item
   */
  async addAction(jobId: string, description: string, dueDate?: string): Promise<Job | null> {
    try {
      const response = await fetch(`${API_BASE}/${jobId}/actions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ description, dueDate }),
      });

      if (!response.ok) {
        throw new Error('Failed to add action');
      }

      return this.fetchJob(jobId);
    } catch (error) {
      console.error('[JobService] Error adding action:', error);
      return this.addActionLocally(jobId, description, dueDate);
    }
  }

  /**
   * Toggle action completion
   */
  async toggleAction(jobId: string, actionId: string): Promise<Job | null> {
    const job = this.getJob(jobId);
    if (!job) return null;

    const action = job.actions.find(a => a.id === actionId);
    if (!action) return null;

    try {
      const response = await fetch(`${API_BASE}/${jobId}/actions/${actionId}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({ completed: !action.completed }),
      });

      if (!response.ok) {
        throw new Error('Failed to toggle action');
      }

      // Update cache
      action.completed = !action.completed;
      action.completedAt = action.completed ? new Date().toISOString() : undefined;

      return job;
    } catch (error) {
      console.error('[JobService] Error toggling action:', error);
      return this.toggleActionLocally(jobId, actionId);
    }
  }

  // ============ Statistics ============

  /**
   * Get job statistics
   */
  async fetchStats(): Promise<{
    total: number;
    active: number;
    won: number;
    lost: number;
    needsAction: number;
    totalValue: number;
  }> {
    try {
      const response = await fetch(`${API_BASE}/stats/summary`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }

      return await response.json();
    } catch (error) {
      console.error('[JobService] Error fetching stats:', error);
      return this.getStats();
    }
  }

  /**
   * Get job statistics (sync version from cache)
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

  // ============ Search ============

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

  // ============ Local Storage Fallback Methods ============

  private getFromLocalStorage(): Job[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[JobService] Error reading localStorage:', error);
      return [];
    }
  }

  private saveToLocalStorage(jobs: Job[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    } catch (error) {
      console.error('[JobService] Error saving to localStorage:', error);
    }
  }

  private createJobLocally(userId: string, data?: Partial<Job>): Job {
    const jobs = this.getFromLocalStorage();
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

    const newJob: Job = {
      ...createEmptyJob(userId),
      ...data,
      id: Date.now().toString(),
      jobNumber: `${year}-${random}`,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!newJob.title && newJob.property?.address) {
      newJob.title = `${newJob.property.address} - ${newJob.customer?.name || 'New Job'}`;
    } else if (!newJob.title) {
      newJob.title = `Job ${newJob.jobNumber}`;
    }

    jobs.unshift(newJob);
    this.saveToLocalStorage(jobs);
    this.cache = jobs;

    // Queue for sync
    this.queueForSync('create', newJob);

    return newJob;
  }

  private updateJobLocally(jobId: string, updates: Partial<Job>): Job | null {
    const jobs = this.getFromLocalStorage();
    const index = jobs.findIndex(job => job.id === jobId);

    if (index === -1) return null;

    const updatedJob: Job = {
      ...jobs[index],
      ...updates,
      id: jobId,
      updatedAt: new Date().toISOString(),
    };

    jobs[index] = updatedJob;
    this.saveToLocalStorage(jobs);
    this.cache = jobs;

    this.queueForSync('update', { id: jobId, updates });

    return updatedJob;
  }

  private deleteJobLocally(jobId: string): boolean {
    const jobs = this.getFromLocalStorage();
    const filtered = jobs.filter(job => job.id !== jobId);

    if (filtered.length === jobs.length) return false;

    this.saveToLocalStorage(filtered);
    this.cache = filtered;

    this.queueForSync('delete', { id: jobId });

    return true;
  }

  private addNoteLocally(jobId: string, text: string, author: string, type?: JobNote['type']): Job | null {
    const jobs = this.getFromLocalStorage();
    const job = jobs.find(j => j.id === jobId);
    if (!job) return null;

    const note: JobNote = {
      id: Date.now().toString(),
      text,
      createdAt: new Date().toISOString(),
      author,
      type: type || 'general',
    };

    job.notes.unshift(note);
    job.updatedAt = new Date().toISOString();
    this.saveToLocalStorage(jobs);
    this.cache = jobs;

    return job;
  }

  private addActionLocally(jobId: string, description: string, dueDate?: string): Job | null {
    const jobs = this.getFromLocalStorage();
    const job = jobs.find(j => j.id === jobId);
    if (!job) return null;

    const action: JobAction = {
      id: Date.now().toString(),
      description,
      dueDate,
      completed: false,
    };

    job.actions.push(action);
    job.updatedAt = new Date().toISOString();
    this.saveToLocalStorage(jobs);
    this.cache = jobs;

    return job;
  }

  private toggleActionLocally(jobId: string, actionId: string): Job | null {
    const jobs = this.getFromLocalStorage();
    const job = jobs.find(j => j.id === jobId);
    if (!job) return null;

    const action = job.actions.find(a => a.id === actionId);
    if (!action) return null;

    action.completed = !action.completed;
    action.completedAt = action.completed ? new Date().toISOString() : undefined;
    job.updatedAt = new Date().toISOString();

    this.saveToLocalStorage(jobs);
    this.cache = jobs;

    return job;
  }

  private queueForSync(action: string, data: any): void {
    try {
      const pending = JSON.parse(localStorage.getItem(PENDING_SYNC_KEY) || '[]');
      pending.push({ action, data, timestamp: Date.now() });
      localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pending));
    } catch (error) {
      console.error('[JobService] Error queuing for sync:', error);
    }
  }

  // ============ Sync ============

  /**
   * Sync pending local changes to server
   */
  async syncPendingChanges(): Promise<number> {
    try {
      const pending = JSON.parse(localStorage.getItem(PENDING_SYNC_KEY) || '[]');
      if (pending.length === 0) return 0;

      let synced = 0;
      for (const item of pending) {
        try {
          if (item.action === 'create') {
            await this.createJob(item.data.userId, item.data);
            synced++;
          } else if (item.action === 'update') {
            await this.updateJob(item.data.id, item.data.updates);
            synced++;
          } else if (item.action === 'delete') {
            await this.deleteJob(item.data.id);
            synced++;
          }
        } catch (error) {
          console.error('[JobService] Error syncing item:', error);
        }
      }

      // Clear synced items
      localStorage.setItem(PENDING_SYNC_KEY, '[]');
      return synced;
    } catch (error) {
      console.error('[JobService] Error syncing:', error);
      return 0;
    }
  }

  /**
   * Clear cache and force refresh from API
   */
  async refresh(): Promise<Job[]> {
    this.cache = null;
    return this.fetchJobs();
  }

  /**
   * Clear all jobs (use with caution!)
   */
  clearAllJobs(): void {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PENDING_SYNC_KEY);
    this.cache = null;
    console.log('[JobService] All jobs cleared');
  }
}

export const jobService = JobService.getInstance();
export default jobService;
