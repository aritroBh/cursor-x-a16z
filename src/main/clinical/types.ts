export type EhrWorkflowState =
  | "PATIENT_CONTEXT_OPEN"
  | "CHART_REVIEW_OPEN"
  | "NOTES_FILTER_OPEN"
  | "INPATIENT_NOTE_SELECTED"
  | "NOTE_TEXT_CAPTURED"
  | "NOTES_ACTIVITY_OPEN"
  | "MULTI_NOTE_REVIEW"
  | "CONTEXT_BUNDLE_READY"
  | "NEW_NOTE_EDITOR_OPEN"
  | "DRAFT_NOTE_INSERTED"
  | "NOTE_REVIEW_REQUIRED"
  | "NOTE_SIGNED_BY_CLINICIAN"
  | "ORDERS_OPEN"
  | "ORDER_SEARCH_ACTIVE"
  | "MEDICATION_SELECTED"
  | "ADVISORY_OPEN"
  | "ORDER_COMPOSER_OPEN"
  | "ORDER_CONFIGURED"
  | "ORDER_PENDING_SIGNATURE"
  | "ORDER_SIGNED_BY_CLINICIAN";

export type SafetyLevel =
  | "read_only"
  | "draft_only"
  | "clinician_confirmed"
  | "prohibited";

export type SemanticAction =
  | "click"
  | "double_click"
  | "type"
  | "select_text"
  | "copy"
  | "paste"
  | "hotkey"
  | "scroll"
  | "wait"
  | "wait_for_ui"
  | "confirm_modal"
  | "abort_if_unexpected_ui"
  | "open_filter"
  | "select_filter_value"
  | "open_note"
  | "iterate_note_rows"
  | "open_note_preview"
  | "select_order_option"
  | "handle_advisory"
  | "select_reason"
  | "configure_order"
  | "accept_order"
  | "manual_sign_only"
  | "observe";

export interface UiTarget {
  label: string;
  type?:
    | "tab"
    | "button"
    | "row"
    | "input"
    | "menu"
    | "dialog"
    | "field"
    | "panel"
    | "advisory"
    | "list";
  textAnchors?: string[];
  expectedRegion?: string;
  safetyLevel?: SafetyLevel;
}

export interface EhrAction {
  id: string;
  phase: string;
  action: SemanticAction;
  semanticTarget: UiTarget;
  reason: string;
  preconditions?: string[];
  postconditions?: string[];
  safetyLevel: SafetyLevel;
  replayAllowed: boolean;
  payload?: {
    text?: string;
    keys?: string[];
    field?: string;
    value?: string;
    fields?: Record<string, string>;
  };
}

export interface ClinicalSections {
  chiefComplaint?: string;
  hpi?: string;
  pmh?: string;
  meds?: string;
  allergies?: string;
  exam?: string;
  labs?: string;
  imaging?: string;
  assessmentPlan?: string;
}

export interface ClinicalSourceNote {
  id: string;
  noteType?: string;
  author?: string;
  service?: string;
  timestamp?: string;
  rawText: string;
  extractedSections?: ClinicalSections;
  sourceScreen?: string;
  contentHash: string;
}

export interface ClinicalContextBundle {
  patientContext?: {
    patientId?: string;
    encounterId?: string;
    encounterType?: string;
  };
  sources: ClinicalSourceNote[];
  createdAt: string;
  captureMethod: "clipboard" | "ocr" | "manual_paste" | "mixed";
}

export interface DraftNoteBody {
  chief_complaint: string;
  hpi: string;
  past_medical_history: string;
  medications: string;
  allergies: string;
  physical_exam: string;
  labs_imaging: string;
  assessment_and_plan: string;
}

export interface SourceMapEntry {
  claim: string;
  source_ids: string[];
}

export interface DraftNote {
  draft_note_type: string;
  summary: string;
  draft_note: DraftNoteBody;
  uncertain_or_missing_info: string[];
  source_map: SourceMapEntry[];
  warnings: string[];
  generator: "anthropic" | "fixture_grounded_fallback";
}

export interface WorkflowTransition {
  from: EhrWorkflowState | null;
  to: EhrWorkflowState;
  trigger: string;
  evidence?: string;
  confidence: number;
  timestamp: string;
  safetyLevel: SafetyLevel;
}

export interface ActionTrace {
  id: string;
  timestampMs: number;
  action: SemanticAction;
  semanticTarget: string;
  screenRegion?: string;
  preconditions: string[];
  postconditions: string[];
  safetyLevel: SafetyLevel;
  replayAllowed: boolean;
  outcome: "executed" | "paused_for_clinician" | "blocked" | "observed";
  notes?: string;
}
