/**
 * Type definitions for Storm Data Learning System (Migration 019)
 * Generated for Gemini Field Assistant
 */

// ============================================================================
// STORM EVENTS
// ============================================================================

export type EventType =
  | 'hail'
  | 'wind'
  | 'tornado'
  | 'severe_thunderstorm'
  | 'combined';

export type DataSource =
  | 'IHM'
  | 'NOAA'
  | 'NWS'
  | 'manual'
  | 'combined';

export type SourceConfidence =
  | 'verified'
  | 'probable'
  | 'possible';

export interface StormEvent {
  id: string; // UUID

  // Location Information
  address: string;
  street_address: string | null;
  city: string;
  state: string; // 2-letter code
  zip_code: string;
  county: string | null;

  // Coordinates
  latitude: number; // Decimal(10,8)
  longitude: number; // Decimal(11,8)

  // Storm Event Details
  event_date: Date;
  event_type: EventType;
  hail_size_inches: number | null; // Decimal(4,2)
  hail_size_description: string | null; // 'golf ball', 'baseball', etc.
  wind_speed_mph: number | null;

  // Data Source & Verification
  data_source: DataSource;
  source_confidence: SourceConfidence;
  source_url: string | null;
  source_metadata: Record<string, any> | null; // JSONB

  // Discovery Tracking
  discovered_by: string | null; // UUID reference to users
  verified_by: string | null; // UUID reference to users
  lookup_timestamp: Date;
  verification_timestamp: Date | null;

  // Related Job
  job_id: string | null; // UUID reference to jobs

  // Metadata
  notes: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateStormEventInput {
  address: string;
  street_address?: string;
  city: string;
  state: string;
  zip_code: string;
  county?: string;
  latitude: number;
  longitude: number;
  event_date: Date | string;
  event_type: EventType;
  hail_size_inches?: number;
  hail_size_description?: string;
  wind_speed_mph?: number;
  data_source: DataSource;
  source_confidence?: SourceConfidence;
  source_url?: string;
  source_metadata?: Record<string, any>;
  discovered_by?: string; // user_id
  verified_by?: string; // user_id
  job_id?: string;
  notes?: string;
}

// ============================================================================
// STORM CLAIM OUTCOMES
// ============================================================================

export type ClaimStatus =
  | 'approved'
  | 'denied'
  | 'partial'
  | 'pending'
  | 'appealed'
  | 'withdrawn';

export type ClaimResult =
  | 'won'
  | 'lost'
  | 'partial_win'
  | 'pending';

export type ResolutionMethod =
  | 'supplement'
  | 'appeal'
  | 'escalation'
  | 'mediation'
  | 'direct_approval';

export type AdjusterBehavior =
  | 'cooperative'
  | 'difficult'
  | 'neutral'
  | 'initially_resistant';

export interface StormClaimOutcome {
  id: string; // UUID

  // Links
  storm_event_id: string | null; // UUID
  job_id: string | null; // UUID
  user_id: string | null; // UUID

  // Insurance Claim Information
  insurance_company: string | null;
  adjuster_name: string | null;
  claim_number: string | null;
  claim_filed_date: Date | null;

  // Claim Outcome
  claim_status: ClaimStatus;
  claim_result: ClaimResult | null;
  approval_amount: number | null; // Decimal(10,2)
  initial_estimate: number | null; // Decimal(10,2)
  final_settlement: number | null; // Decimal(10,2)
  outcome_date: Date | null;

  // Strategy & Arguments Used
  key_arguments: string[] | null;
  supporting_evidence: string[] | null;
  challenges_faced: string[] | null;
  resolution_method: ResolutionMethod | null;

  // Adjuster Response Patterns
  adjuster_behavior: AdjusterBehavior | null;
  adjuster_notes: string | null;
  response_time_days: number | null;
  required_reinspection: boolean;

  // Timeline
  initial_denial_reasons: string[] | null;
  appeal_strategy: string | null;
  appeal_outcome: string | null;

  // Learning Tags
  success_factors: string[] | null;
  lessons_learned: string | null;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

export interface CreateClaimOutcomeInput {
  storm_event_id?: string;
  job_id?: string;
  user_id?: string;
  insurance_company?: string;
  adjuster_name?: string;
  claim_number?: string;
  claim_filed_date?: Date | string;
  claim_status: ClaimStatus;
  claim_result?: ClaimResult;
  approval_amount?: number;
  initial_estimate?: number;
  final_settlement?: number;
  outcome_date?: Date | string;
  key_arguments?: string[];
  supporting_evidence?: string[];
  challenges_faced?: string[];
  resolution_method?: ResolutionMethod;
  adjuster_behavior?: AdjusterBehavior;
  adjuster_notes?: string;
  response_time_days?: number;
  required_reinspection?: boolean;
  initial_denial_reasons?: string[];
  appeal_strategy?: string;
  appeal_outcome?: string;
  success_factors?: string[];
  lessons_learned?: string;
}

// ============================================================================
// STORM AREA PATTERNS
// ============================================================================

export type ScopeType =
  | 'zip_code'
  | 'city'
  | 'county'
  | 'state';

export interface StormAreaPattern {
  id: string; // UUID

  // Geographic Scope
  scope_type: ScopeType;
  state: string;
  county: string | null;
  city: string | null;
  zip_code: string | null;

  // Pattern Statistics
  total_events: number;
  total_claims: number;
  successful_claims: number;
  success_rate: number | null; // Decimal(5,2) percentage

  // Common Patterns
  common_event_types: Record<string, number> | null; // JSONB
  common_insurers: Record<string, number> | null; // JSONB
  average_approval_amount: number | null; // Decimal(10,2)

  // Successful Strategies
  top_arguments: string[] | null;
  top_evidence_types: string[] | null;
  typical_adjuster_behavior: string | null;

  // Date Range
  earliest_event_date: Date | null;
  latest_event_date: Date | null;

  // Metadata
  last_calculated_at: Date;
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// STORM LOOKUP ANALYTICS
// ============================================================================

export type QueryType =
  | 'address_lookup'
  | 'radius_search'
  | 'zip_search'
  | 'date_range';

export interface StormLookupAnalytic {
  id: string; // UUID
  user_id: string | null; // UUID

  // Query Parameters
  query_type: QueryType;
  query_address: string | null;
  query_latitude: number | null; // Decimal(10,8)
  query_longitude: number | null; // Decimal(11,8)
  query_radius_miles: number | null; // Decimal(6,2)
  query_date_range: { start: Date; end: Date } | null;

  // Results
  results_found: number;
  storm_event_ids: string[] | null; // UUID[]

  // Context
  related_job_id: string | null; // UUID
  session_id: string | null;

  // Metadata
  created_at: Date;
}

export interface CreateLookupAnalyticInput {
  user_id?: string;
  query_type: QueryType;
  query_address?: string;
  query_latitude?: number;
  query_longitude?: number;
  query_radius_miles?: number;
  query_date_range?: { start: Date | string; end: Date | string };
  results_found: number;
  storm_event_ids?: string[];
  related_job_id?: string;
  session_id?: string;
}

// ============================================================================
// QUERY RESULTS & HELPER TYPES
// ============================================================================

export interface StormNearLocation {
  storm_id: string; // UUID
  distance_miles: number;
  event_date: Date;
  event_type: EventType;
  hail_size_inches: number | null;
  city: string;
  state: string;
}

export interface AreaClaimStrategy {
  total_claims: number;
  success_rate: number | null;
  top_arguments: string[] | null;
  common_evidence: string[] | null;
  avg_settlement: number | null;
}

export interface RecentSuccessfulClaim {
  event_date: Date;
  city: string;
  state: string;
  zip_code: string;
  event_type: EventType;
  hail_size_inches: number | null;
  insurance_company: string | null;
  claim_result: ClaimResult | null;
  final_settlement: number | null;
  key_arguments: string[] | null;
  supporting_evidence: string[] | null;
  success_factors: string[] | null;
  outcome_date: Date | null;
}

export interface StormHotspot {
  state: string;
  city: string;
  zip_code: string;
  total_storms: number;
  successful_claims: number;
  success_rate: number | null;
  last_storm_date: Date;
  avg_hail_size: number | null;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface FindStormsNearRequest {
  latitude: number;
  longitude: number;
  radius_miles?: number; // Default: 10
  days_back?: number; // Default: 365
}

export interface FindStormsNearResponse {
  storms: StormNearLocation[];
  query: {
    latitude: number;
    longitude: number;
    radius_miles: number;
    days_back: number;
  };
  count: number;
}

export interface GetAreaStrategiesRequest {
  state: string;
  city?: string;
  zip_code?: string;
  insurance_company?: string;
}

export interface GetAreaStrategiesResponse {
  strategy: AreaClaimStrategy;
  query: {
    state: string;
    city?: string;
    zip_code?: string;
    insurance_company?: string;
  };
}

export interface StormSearchRequest {
  // Location filters
  state?: string;
  city?: string;
  zip_code?: string;

  // Or coordinate-based
  latitude?: number;
  longitude?: number;
  radius_miles?: number;

  // Date filters
  start_date?: Date | string;
  end_date?: Date | string;

  // Event filters
  event_type?: EventType;
  min_hail_size?: number;

  // Pagination
  limit?: number;
  offset?: number;
}

export interface StormSearchResponse {
  storms: StormEvent[];
  total: number;
  query: StormSearchRequest;
}

// ============================================================================
// CONSTANTS & ENUMS
// ============================================================================

export const HAIL_SIZE_DESCRIPTIONS: Record<number, string> = {
  0.25: 'pea',
  0.50: 'marble',
  0.75: 'penny',
  1.00: 'quarter',
  1.25: 'half dollar',
  1.50: 'walnut',
  1.75: 'golf ball',
  2.00: 'tennis ball',
  2.50: 'baseball',
  2.75: 'baseball',
  3.00: 'softball',
  4.00: 'grapefruit',
};

export const COMMON_ARGUMENTS = [
  'Provided detailed IHM report showing hail damage',
  'Submitted photos of clear impact damage',
  'Referenced state building codes',
  'Engineer report confirmed structural damage',
  'Multiple hail strikes documented',
  'Compared with neighboring approved claims',
  'Documented previous repair attempts',
  'Weather service confirmation of severe storm',
] as const;

export const COMMON_EVIDENCE_TYPES = [
  'IHM_report',
  'photos',
  'engineer_report',
  'weather_service_data',
  'contractor_estimate',
  'prior_inspection_report',
  'neighbor_claims',
  'roof_age_documentation',
] as const;

export const SUCCESS_FACTORS = [
  'strong_documentation',
  'quick_response',
  'professional_presentation',
  'engineer_support',
  'weather_confirmation',
  'multiple_evidence_sources',
  'good_adjuster_relationship',
  'clear_photo_documentation',
] as const;
