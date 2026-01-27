/**
 * Job Management Types
 * Comprehensive data model for roofing job tracking
 */

// Job pipeline stages based on industry best practices
export type JobStatus =
  | 'new_lead'
  | 'contacted'
  | 'inspection_scheduled'
  | 'inspection_complete'
  | 'estimate_sent'
  | 'follow_up'
  | 'contract_signed'
  | 'insurance_filed'
  | 'adjuster_scheduled'
  | 'adjuster_complete'
  | 'supplement_requested'
  | 'approved'
  | 'materials_ordered'
  | 'scheduled'
  | 'in_progress'
  | 'complete'
  | 'invoiced'
  | 'paid'
  | 'lost'
  | 'cancelled';

export type JobPriority = 'low' | 'medium' | 'high' | 'urgent';

export type DamageType = 'hail' | 'wind' | 'storm' | 'tree' | 'age' | 'leak' | 'other';

export type RoofType = 'shingle_3tab' | 'shingle_architectural' | 'metal' | 'tile' | 'flat_tpo' | 'slate' | 'other';

export type InsuranceClaimStatus =
  | 'not_filed'
  | 'filed'
  | 'adjuster_scheduled'
  | 'adjuster_complete'
  | 'initial_estimate'
  | 'supplement_requested'
  | 'supplement_approved'
  | 'supplement_denied'
  | 'approved'
  | 'acv_received'
  | 'work_complete'
  | 'depreciation_received'
  | 'closed';

export type LeadSource =
  | 'canvassing'
  | 'referral'
  | 'website'
  | 'google'
  | 'facebook'
  | 'home_advisor'
  | 'direct_mail'
  | 'other';

// Customer/Contact information
export interface JobCustomer {
  name: string;
  phone?: string;
  phoneSecondary?: string;
  email?: string;
  preferredContact?: 'call' | 'text' | 'email';
}

// Property details
export interface JobProperty {
  address: string;
  city: string;
  state: 'VA' | 'MD' | 'PA';
  zip?: string;
  propertyType?: 'residential' | 'commercial' | 'multi_family';
  stories?: number;
  accessNotes?: string;
}

// Roof measurements and details
export interface RoofDetails {
  roofType?: RoofType;
  roofAge?: number; // years
  totalSquares?: number;
  pitch?: string; // e.g., "6/12"
  layers?: number;
  deckingCondition?: 'good' | 'fair' | 'poor' | 'unknown';
}

// Insurance claim tracking
export interface InsuranceClaim {
  company?: string;
  policyNumber?: string;
  claimNumber?: string;
  dateOfLoss?: string; // ISO date
  adjusterName?: string;
  adjusterPhone?: string;
  adjusterEmail?: string;
  adjusterMeetingDate?: string; // ISO datetime
  claimStatus: InsuranceClaimStatus;
  policyType?: 'acv' | 'rcv';
  deductible?: number;
  initialEstimate?: number;
  supplementAmount?: number;
  supplementStatus?: 'none' | 'requested' | 'under_review' | 'approved' | 'denied';
  acvPayment?: number;
  depreciationHeld?: number;
  depreciationRecovered?: number;
  approvalLetterReceived?: boolean;
  notes?: string;
}

// Damage assessment
export interface DamageAssessment {
  damageType: DamageType;
  damageDate?: string; // ISO date
  description?: string;
  severity?: 'minor' | 'moderate' | 'severe' | 'total_loss';
  affectedAreas?: string[];
  photoIds?: string[];
}

// Job note entry
export interface JobNote {
  id: string;
  text: string;
  createdAt: string; // ISO datetime
  author: string;
  type?: 'general' | 'customer_call' | 'adjuster_meeting' | 'inspection' | 'follow_up';
}

// Job attachment
export interface JobAttachment {
  id: string;
  type: 'photo' | 'document' | 'transcript' | 'email' | 'estimate' | 'contract';
  name: string;
  url?: string;
  data?: string; // Base64 for local storage
  createdAt: string; // ISO datetime
}

// Action item / next step
export interface JobAction {
  id: string;
  description: string;
  dueDate?: string; // ISO date
  completed: boolean;
  completedAt?: string; // ISO datetime
  assignedTo?: string;
  priority?: JobPriority;
}

// Financial tracking
export interface JobFinancials {
  estimateAmount?: number;
  contractAmount?: number;
  materialCost?: number;
  laborCost?: number;
  invoicedAmount?: number;
  paidAmount?: number;
  profitMargin?: number;
}

// Main Job interface
export interface Job {
  // Identification
  id: string;
  jobNumber: string; // Human-readable (e.g., "2024-0042")
  userId: string; // Sales rep email

  // Basic info
  title: string;
  status: JobStatus;
  priority: JobPriority;
  leadSource?: LeadSource;

  // Related entities
  customer: JobCustomer;
  property: JobProperty;
  roofDetails?: RoofDetails;
  damage?: DamageAssessment;
  insurance?: InsuranceClaim;
  financials?: JobFinancials;

  // Collections
  notes: JobNote[];
  attachments: JobAttachment[];
  actions: JobAction[];

  // Timestamps
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  inspectionDate?: string; // ISO datetime
  contractSignedDate?: string; // ISO date
  scheduledInstallDate?: string; // ISO date
  completedDate?: string; // ISO date

  // Integration references
  linkedChatSessionId?: string;
  linkedTranscriptIds?: string[];
  linkedEmailIds?: string[];
  linkedImageAnalysisIds?: string[];

  // Tags for filtering
  tags?: string[];
}

// Pipeline stage configuration for UI
export interface PipelineStage {
  id: JobStatus;
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
  order: number;
}

// Default pipeline stages
export const JOB_PIPELINE_STAGES: PipelineStage[] = [
  { id: 'new_lead', label: 'New Lead', shortLabel: 'Lead', color: '#6b7280', icon: 'UserPlus', order: 1 },
  { id: 'contacted', label: 'Contacted', shortLabel: 'Contact', color: '#3b82f6', icon: 'Phone', order: 2 },
  { id: 'inspection_scheduled', label: 'Inspection Scheduled', shortLabel: 'Scheduled', color: '#8b5cf6', icon: 'Calendar', order: 3 },
  { id: 'inspection_complete', label: 'Inspection Complete', shortLabel: 'Inspected', color: '#06b6d4', icon: 'ClipboardCheck', order: 4 },
  { id: 'estimate_sent', label: 'Estimate Sent', shortLabel: 'Estimate', color: '#f59e0b', icon: 'FileText', order: 5 },
  { id: 'follow_up', label: 'Follow Up', shortLabel: 'Follow Up', color: '#f97316', icon: 'MessageSquare', order: 6 },
  { id: 'contract_signed', label: 'Contract Signed', shortLabel: 'Signed', color: '#10b981', icon: 'FileCheck', order: 7 },
  { id: 'insurance_filed', label: 'Insurance Filed', shortLabel: 'Filed', color: '#14b8a6', icon: 'Shield', order: 8 },
  { id: 'adjuster_scheduled', label: 'Adjuster Scheduled', shortLabel: 'Adj Sched', color: '#0ea5e9', icon: 'UserCheck', order: 9 },
  { id: 'adjuster_complete', label: 'Adjuster Complete', shortLabel: 'Adj Done', color: '#22c55e', icon: 'CheckCircle', order: 10 },
  { id: 'supplement_requested', label: 'Supplement Requested', shortLabel: 'Supplement', color: '#eab308', icon: 'FilePlus', order: 11 },
  { id: 'approved', label: 'Approved', shortLabel: 'Approved', color: '#22c55e', icon: 'ThumbsUp', order: 12 },
  { id: 'materials_ordered', label: 'Materials Ordered', shortLabel: 'Ordered', color: '#a855f7', icon: 'Package', order: 13 },
  { id: 'scheduled', label: 'Production Scheduled', shortLabel: 'Prod Sched', color: '#ec4899', icon: 'Hammer', order: 14 },
  { id: 'in_progress', label: 'In Progress', shortLabel: 'In Progress', color: '#f43f5e', icon: 'Construction', order: 15 },
  { id: 'complete', label: 'Complete', shortLabel: 'Complete', color: '#10b981', icon: 'CheckCircle2', order: 16 },
  { id: 'invoiced', label: 'Invoiced', shortLabel: 'Invoiced', color: '#6366f1', icon: 'Receipt', order: 17 },
  { id: 'paid', label: 'Paid', shortLabel: 'Paid', color: '#22c55e', icon: 'DollarSign', order: 18 },
  { id: 'lost', label: 'Lost', shortLabel: 'Lost', color: '#ef4444', icon: 'XCircle', order: 99 },
  { id: 'cancelled', label: 'Cancelled', shortLabel: 'Cancelled', color: '#71717a', icon: 'Ban', order: 100 },
];

// Quick status groups for filtering
export const JOB_STATUS_GROUPS = {
  active: ['new_lead', 'contacted', 'inspection_scheduled', 'inspection_complete', 'estimate_sent', 'follow_up', 'contract_signed', 'insurance_filed', 'adjuster_scheduled', 'adjuster_complete', 'supplement_requested', 'approved', 'materials_ordered', 'scheduled', 'in_progress'],
  won: ['complete', 'invoiced', 'paid'],
  lost: ['lost', 'cancelled'],
  needsAction: ['new_lead', 'follow_up', 'supplement_requested'],
  insurance: ['insurance_filed', 'adjuster_scheduled', 'adjuster_complete', 'supplement_requested', 'approved'],
  production: ['materials_ordered', 'scheduled', 'in_progress', 'complete'],
};

// Insurance companies dropdown
export const INSURANCE_COMPANIES = [
  'State Farm',
  'Allstate',
  'USAA',
  'Liberty Mutual',
  'Nationwide',
  'Farmers',
  'Progressive',
  'Travelers',
  'American Family',
  'Erie Insurance',
  'Auto-Owners',
  'Hartford',
  'Chubb',
  'Amica',
  'Other',
];

// Lead source dropdown
export const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'canvassing', label: 'Storm Canvassing' },
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'google', label: 'Google Ads' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'home_advisor', label: 'HomeAdvisor/Angi' },
  { value: 'direct_mail', label: 'Direct Mail' },
  { value: 'other', label: 'Other' },
];

// Damage types dropdown
export const DAMAGE_TYPES: { value: DamageType; label: string }[] = [
  { value: 'hail', label: 'Hail Damage' },
  { value: 'wind', label: 'Wind Damage' },
  { value: 'storm', label: 'Storm Damage' },
  { value: 'tree', label: 'Fallen Tree/Debris' },
  { value: 'age', label: 'Age/Wear' },
  { value: 'leak', label: 'Leak/Water Damage' },
  { value: 'other', label: 'Other' },
];

// Roof types dropdown
export const ROOF_TYPES: { value: RoofType; label: string }[] = [
  { value: 'shingle_3tab', label: '3-Tab Shingles' },
  { value: 'shingle_architectural', label: 'Architectural Shingles' },
  { value: 'metal', label: 'Metal' },
  { value: 'tile', label: 'Tile' },
  { value: 'flat_tpo', label: 'Flat/TPO' },
  { value: 'slate', label: 'Slate' },
  { value: 'other', label: 'Other' },
];

// Helper to get stage info
export const getStageInfo = (status: JobStatus): PipelineStage => {
  return JOB_PIPELINE_STAGES.find(s => s.id === status) || JOB_PIPELINE_STAGES[0];
};

// Helper to format currency
export const formatCurrency = (amount?: number): string => {
  if (amount === undefined || amount === null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

// Helper to generate job number
export const generateJobNumber = (): string => {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${year}-${random}`;
};

// Helper to create empty job
export const createEmptyJob = (userId: string): Job => {
  const now = new Date().toISOString();
  return {
    id: Date.now().toString(),
    jobNumber: generateJobNumber(),
    userId,
    title: '',
    status: 'new_lead',
    priority: 'medium',
    customer: { name: '' },
    property: { address: '', city: '', state: 'VA' },
    notes: [],
    attachments: [],
    actions: [],
    createdAt: now,
    updatedAt: now,
  };
};
