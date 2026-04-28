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
  provenance?: {
    page?: number
    confidence_score?: number
    confidence_level?: string
  }
  sensitivity?: string
}

export interface ColumnProfile {
  column_name: string
  data_type: string
  semantic_type?: string
  missing_count: number
  missing_pct: number
  unique_count: number
  unique_pct: number
  is_pii: boolean
  sensitivity: string
  min?: number
  max?: number
  mean?: number
  median?: number
  std_dev?: number
  variance?: number
  skewness?: number
  kurtosis?: number
  percentile_25?: number
  percentile_75?: number
  zeros_count?: number
  negative_count?: number
  top_values?: { value: string; count: number }[]
  mode?: string
  entropy?: number
  min_date?: string
  max_date?: string
  freshness_days?: number
  has_gaps?: boolean
  histogram?: { bin_start: number; bin_end: number; count: number; label?: string }[]
  extreme_min?: { value: string | number; count: number }[]
  extreme_max?: { value: string | number; count: number }[]
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
  critical_business_elements?: ExtractedFact[]
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
  sample_head?: Record<string, any>[]
  sample_tail?: Record<string, any>[]
}

export interface ProfileSummary {
  profile_id: string
  filename: string
  modality: string
  document_type: string
  health_score?: number
  created_at: string
}