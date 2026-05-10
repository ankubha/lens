const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

export async function profileFile(file: File): Promise<ProfileContract> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${API_BASE}/api/profile`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Profiling failed')
  }

  return res.json()
}

export async function listProfiles(): Promise<{ profiles: ProfileSummary[], total: number }> {
  const res = await fetch(`${API_BASE}/api/profiles`)
  if (!res.ok) throw new Error('Failed to fetch profiles')
  return res.json()
}

export async function getProfile(id: string): Promise<ProfileContract> {
  const res = await fetch(`${API_BASE}/api/profiles/${id}`)
  if (!res.ok) throw new Error('Profile not found')
  return res.json()
}

export async function getPageSummaries(id: string) {
  const res = await fetch(`${API_BASE}/api/profiles/${id}/page-summaries`)
  if (!res.ok) throw new Error('Failed to fetch page summaries')
  return res.json()
}

// Types matching our ProfileContract
export interface ExtractedFact {
  field_name: string
  business_definition?: string
  value?: string
  raw_text?: string
  not_found_reason?: string
  confidence_rationale?: string
  provenance?: {
    page?: number
    confidence_score?: number
    confidence_level?: string
  }
  sensitivity?: string
  is_cde?: boolean
  info_classification?: 'Public' | 'Internal' | 'Confidential' | 'Restricted'
  pii_classification?: 'PII' | 'Sensitive' | 'Non-PII'
}

export interface DiscoveredField {
  field_name: string
  description: string
  semantic_type: string
  is_cde: boolean
  is_core_field: boolean
  info_classification: 'Public' | 'Internal' | 'Confidential' | 'Restricted'
  pii_classification: 'PII' | 'Sensitive' | 'Non-PII'
}

export interface ColumnProfile {
  column_name: string
  data_type: string
  var_type?: string  // "Numeric" | "Text" | "Categorical" | "DateTime"
  semantic_type?: string
  missing_count: number
  missing_pct: number
  unique_count: number
  unique_pct: number
  is_pii: boolean
  sensitivity: string
  business_definition?: string
  // All-type stats
  infinite_count?: number
  infinite_pct?: number
  memory_size?: number
  // Numeric stats
  min?: number
  max?: number
  mean?: number
  median?: number
  std_dev?: number
  variance?: number
  skewness?: number
  kurtosis?: number
  percentile_5?: number
  percentile_25?: number
  percentile_75?: number
  percentile_95?: number
  zeros_count?: number
  zeros_pct?: number
  negative_count?: number
  negative_pct?: number
  mad?: number
  cv?: number
  sum_val?: number
  monotonicity?: string
  // Categorical / text stats
  top_values?: { value: string; count: number }[]
  mode?: string
  entropy?: number
  // Text/Categorical length & unicode
  max_length?: number
  median_length?: number
  mean_length?: number
  min_length?: number
  total_chars?: number
  distinct_chars?: number
  distinct_categories?: number
  distinct_scripts?: number
  distinct_blocks?: number
  unique_exact_count?: number
  unique_exact_pct?: number
  word_frequencies?: { word: string; count: number }[]
  char_frequencies?: { char: string; count: number }[]
  sample_values?: string[]
  length_histogram?: { length: number; count: number }[]
  // DateTime stats
  min_date?: string
  max_date?: string
  freshness_days?: number
  has_gaps?: boolean
  time_span_str?: string
  has_time_component?: boolean
  weekday_count?: number
  weekend_count?: number
  weekday_pct?: number
  weekend_pct?: number
  yearly_distribution?: { year: number; count: number }[]
  monthly_distribution?: { month_num: number; month_name: string; count: number }[]
  dow_distribution?: { dow: number; day_name: string; count: number }[]
  hour_distribution?: { hour: number; count: number }[]
  // Histograms / extremes
  histogram?: { bin_start: number; bin_end: number; count: number; label?: string }[]
  extreme_min?: { value: string | number; count: number }[]
  extreme_max?: { value: string | number; count: number }[]
  // Per-column quality scores (0–100) — power the heatmap
  completeness_score?: number
  uniqueness_score?: number
  validity_score?: number
  consistency_score?: number
}

export interface ProfileContract {
  profile_id: string
  created_at: string
  filename: string
  file_size_bytes: number
  modality: 'structured' | 'unstructured' | 'semi_structured'
  document_type: string
  document_type_confidence?: number
  sensitivity_classification: string
  // Structured
  row_count?: number
  column_count?: number
  duplicate_row_count?: number
  columns: ColumnProfile[]
  // Unstructured
  page_count?: number
  detected_language?: string
  is_scanned?: boolean
  has_tables?: boolean
  sections_detected?: string[]
  // Health
  health_score?: number
  health_breakdown?: Record<string, number>
  completeness_score?: number
  expected_fields_count?: number
  found_fields_count?: number
  // Content
  extraction_schema?: DiscoveredField[]
  critical_data_elements?: ExtractedFact[]
  core_cdes_found?: number
  core_cdes_expected?: number
  total_cdes_found?: number
  total_cdes_expected?: number
  summary?: {
    executive?: string
    detailed?: string
    page_summaries?: { page: number; summary: string; key_entities: string[] }[]
  }
  obligations?: { obligation_type: string; description: string; trigger_language?: string; party_responsible?: string }[]
  parties?: ExtractedFact[]
  monetary_amounts?: ExtractedFact[]
  key_dates?: ExtractedFact[]
  additional_findings?: ExtractedFact[]
  raw_llm_narrative?: string
  drift_alerts?: { column_name: string; metric: string; prior_value: number; current_value: number; delta: number }[]
  audit_log?: { timestamp: string; event: string; detail: string }[]
  llm_used?: string
  duplicate_rows?: Record<string, any>[]
  duplicate_row_groups?: Record<string, any>[]
  sample_head?: Record<string, any>[]
  sample_tail?: Record<string, any>[]
  correlation_matrix?: Record<string, Record<string, number | null>>
  missing_correlation_matrix?: Record<string, Record<string, number | null>>
  numeric_sample_data?: Record<string, (number | null)[]>
}

export interface ProfileSummary {
  profile_id: string
  filename: string
  modality: string
  document_type: string
  health_score?: number
  created_at: string
}

// ── DQ Engine types ───────────────────────────────────────

export type DQCheckType =
  | 'not_null' | 'min_max_range' | 'iqr_outlier' | 'z_score_outlier'
  | 'non_negative' | 'categorical_set' | 'string_length' | 'pattern_match'
  | 'uniqueness' | 'no_future_date' | 'date_range' | 'distribution_fit'

export type DQCheckStatus = 'pending' | 'authorized' | 'rejected'

export type DQDimension =
  | 'completeness' | 'validity' | 'uniqueness' | 'conformity' | 'accuracy' | 'consistency'

export interface DQCheck {
  check_id: string
  profile_id: string
  column_name: string
  check_type: DQCheckType
  status: DQCheckStatus
  parameters: Record<string, any>
  description: string
  dimension: DQDimension
  confidence: number
  train_pass_rate: number
  test_pass_rate: number
  sample_size: number
  created_at: string
  pass_count?: number
  fail_count?: number
  fail_pct?: number
}

export interface DQAnomaly {
  anomaly_id: string
  check_id: string
  column_name: string
  check_type: DQCheckType
  anomaly_type: 'record' | 'shape'
  row_index?: number
  row_data?: Record<string, any>
  offending_value?: any
  description: string
  severity: 'low' | 'medium' | 'high'
}

export interface ScanResult {
  scan_id: string
  profile_id: string
  scanned_at: string
  total_rows: number
  total_checks: number
  checks_passed: number
  checks_failed: number
  total_anomalies: number
  record_anomalies: number
  shape_anomalies: number
  dq_score: number
  anomalies: DQAnomaly[]
  check_results: DQCheck[]
}

// ── DQ API functions ──────────────────────────────────────

export async function inferDQChecks(profileId: string): Promise<{ profile_id: string; total_checks: number; checks: DQCheck[] }> {
  const res = await fetch(`${API_BASE}/api/profiles/${profileId}/infer-checks`, { method: 'POST' })
  if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Inference failed') }
  return res.json()
}

export async function getDQChecks(profileId: string): Promise<{ total: number; pending: number; authorized: number; rejected: number; checks: DQCheck[] }> {
  const res = await fetch(`${API_BASE}/api/profiles/${profileId}/checks`)
  if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Failed to fetch checks') }
  return res.json()
}

export async function updateCheckStatus(profileId: string, checkId: string, status: DQCheckStatus): Promise<DQCheck> {
  const res = await fetch(`${API_BASE}/api/profiles/${profileId}/checks/${checkId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Update failed') }
  return res.json()
}

export async function bulkUpdateChecks(profileId: string, status: DQCheckStatus, checkIds: string[] = []): Promise<{ updated: number; status: string }> {
  const res = await fetch(`${API_BASE}/api/profiles/${profileId}/checks`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, check_ids: checkIds }),
  })
  if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Bulk update failed') }
  return res.json()
}

export async function runScan(profileId: string): Promise<ScanResult> {
  const res = await fetch(`${API_BASE}/api/profiles/${profileId}/scan`, { method: 'POST' })
  if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Scan failed') }
  return res.json()
}

export async function getScanResult(profileId: string): Promise<ScanResult | null> {
  const res = await fetch(`${API_BASE}/api/profiles/${profileId}/scan-result`)
  if (res.status === 404) return null
  if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Failed to fetch scan result') }
  return res.json()
}