import type {
  EhrAction,
  EhrWorkflowState,
  UiTarget,
  WorkflowTransition,
} from "./types";

export const APEX_TARGETS: Record<string, UiTarget> = {
  patientWorkspace: {
    label: "APeX patient workspace",
    type: "panel",
    expectedRegion: "main_workspace",
    safetyLevel: "read_only",
    textAnchors: ["Patient Lists", "Patient Station", "MRN", "DOB"],
  },
  chartReviewActivity: {
    label: "Chart Review",
    type: "tab",
    textAnchors: ["Chart Review"],
    expectedRegion: "patient_chart_activity_tabs",
    safetyLevel: "read_only",
  },
  chartReviewNotesTab: {
    label: "Notes",
    type: "tab",
    textAnchors: ["Notes", "Encounter Notes"],
    expectedRegion: "chart_review_subtab_strip",
    safetyLevel: "read_only",
  },
  chartReviewFilterMenu: {
    label: "Filter",
    type: "menu",
    textAnchors: ["Filters", "Default Filter", "Time", "Type", "Service"],
    expectedRegion: "chart_review_left_filter_pane",
    safetyLevel: "read_only",
  },
  chartReviewEncounterNotesValue: {
    label: "Encounter Notes filter value",
    type: "menu",
    textAnchors: ["Encounter Notes", "Progress Note", "H&P", "Consult"],
    expectedRegion: "chart_review_filter_dropdown",
    safetyLevel: "read_only",
  },
  chartReviewNotesList: {
    label: "Chart Review notes list",
    type: "list",
    textAnchors: ["Date", "Type", "Author", "Service"],
    expectedRegion: "chart_review_notes_list",
    safetyLevel: "read_only",
  },
  chartReviewNotePreview: {
    label: "Chart Review note preview pane",
    type: "panel",
    expectedRegion: "chart_review_right_preview_pane",
    safetyLevel: "read_only",
  },
};

function action(a: EhrAction): EhrAction {
  return a;
}

const APEX_PHASE = "apex_chart_review_notes";

export function compileApexNotesWalkthrough(): EhrAction[] {
  return [
    action({
      id: "apex.confirm_patient_context",
      phase: APEX_PHASE,
      action: "observe",
      semanticTarget: APEX_TARGETS.patientWorkspace,
      reason: "Confirm correct APeX patient is open before reading notes",
      preconditions: ["patient_workspace_visible"],
      postconditions: ["apex_patient_confirmed"],
      safetyLevel: "read_only",
      replayAllowed: true,
    }),
    action({
      id: "apex.click_chart_review",
      phase: APEX_PHASE,
      action: "click",
      semanticTarget: APEX_TARGETS.chartReviewActivity,
      reason: "Open Chart Review activity to access historical notes",
      preconditions: ["apex_patient_confirmed"],
      postconditions: ["apex_chart_review_open"],
      safetyLevel: "read_only",
      replayAllowed: true,
    }),
    action({
      id: "apex.click_notes_subtab",
      phase: APEX_PHASE,
      action: "click",
      semanticTarget: APEX_TARGETS.chartReviewNotesTab,
      reason: "Move into the Notes subtab under Chart Review",
      preconditions: ["apex_chart_review_open"],
      postconditions: ["apex_chart_review_notes_visible"],
      safetyLevel: "read_only",
      replayAllowed: true,
    }),
    action({
      id: "apex.open_filter",
      phase: APEX_PHASE,
      action: "open_filter",
      semanticTarget: APEX_TARGETS.chartReviewFilterMenu,
      reason: "Reduce noise — clinician picks the filter scope",
      preconditions: ["apex_chart_review_notes_visible"],
      postconditions: ["apex_filter_open"],
      safetyLevel: "clinician_confirmed",
      replayAllowed: false,
    }),
    action({
      id: "apex.select_encounter_notes",
      phase: APEX_PHASE,
      action: "select_filter_value",
      semanticTarget: APEX_TARGETS.chartReviewEncounterNotesValue,
      reason: "Default to Encounter Notes — clinician may broaden",
      preconditions: ["apex_filter_open"],
      postconditions: ["apex_notes_filtered"],
      safetyLevel: "clinician_confirmed",
      replayAllowed: false,
    }),
    action({
      id: "apex.iterate_notes",
      phase: APEX_PHASE,
      action: "iterate_note_rows",
      semanticTarget: APEX_TARGETS.chartReviewNotesList,
      reason: "Walk each visible note row in the filtered list",
      preconditions: ["apex_notes_filtered"],
      postconditions: ["apex_iterating_notes"],
      safetyLevel: "clinician_confirmed",
      replayAllowed: false,
    }),
    action({
      id: "apex.open_note_preview",
      phase: APEX_PHASE,
      action: "open_note_preview",
      semanticTarget: APEX_TARGETS.chartReviewNotePreview,
      reason: "Show the current note's text in the right preview pane",
      preconditions: ["apex_iterating_notes"],
      postconditions: ["apex_note_preview_open"],
      safetyLevel: "read_only",
      replayAllowed: true,
    }),
    action({
      id: "apex.select_note_text",
      phase: APEX_PHASE,
      action: "select_text",
      semanticTarget: APEX_TARGETS.chartReviewNotePreview,
      reason: "Select all text in the open note for capture",
      preconditions: ["apex_note_preview_open"],
      postconditions: ["apex_note_text_selected"],
      safetyLevel: "read_only",
      replayAllowed: true,
      payload: { keys: ["Cmd", "A"] },
    }),
    action({
      id: "apex.copy_note_text",
      phase: APEX_PHASE,
      action: "copy",
      semanticTarget: APEX_TARGETS.chartReviewNotePreview,
      reason: "Copy selected text into clipboard for Specter to read",
      preconditions: ["apex_note_text_selected"],
      postconditions: ["apex_clipboard_has_note"],
      safetyLevel: "read_only",
      replayAllowed: true,
      payload: { keys: ["Cmd", "C"] },
    }),
    action({
      id: "apex.capture_into_bundle",
      phase: APEX_PHASE,
      action: "wait",
      semanticTarget: APEX_TARGETS.chartReviewNotePreview,
      reason:
        "Specter reads the clipboard and adds the note text to the source bundle (no APeX write).",
      preconditions: ["apex_clipboard_has_note"],
      postconditions: ["apex_bundle_grew"],
      safetyLevel: "read_only",
      replayAllowed: true,
    }),
    action({
      id: "apex.advance_or_finish",
      phase: APEX_PHASE,
      action: "wait_for_ui",
      semanticTarget: APEX_TARGETS.chartReviewNotesList,
      reason:
        "Clinician decides: capture another note row, or proceed to summary",
      preconditions: ["apex_bundle_grew"],
      postconditions: ["apex_capture_decision"],
      safetyLevel: "clinician_confirmed",
      replayAllowed: false,
    }),
    action({
      id: "apex.summarize_in_panel",
      phase: APEX_PHASE,
      action: "wait",
      semanticTarget: {
        label: "Specter clinical panel — Notes Summary",
        type: "panel",
        expectedRegion: "specter_clinical_window",
        safetyLevel: "read_only",
      },
      reason:
        "Generate a source-grounded summary inside Specter — never typed back into APeX",
      preconditions: ["apex_capture_decision"],
      postconditions: ["apex_summary_ready"],
      safetyLevel: "read_only",
      replayAllowed: true,
    }),
  ];
}

const APEX_TRANSITION_MAP: Record<string, EhrWorkflowState> = {
  "apex.confirm_patient_context": "PATIENT_CONTEXT_OPEN",
  "apex.click_chart_review": "CHART_REVIEW_OPEN",
  "apex.click_notes_subtab": "CHART_REVIEW_OPEN",
  "apex.open_filter": "NOTES_FILTER_OPEN",
  "apex.select_encounter_notes": "NOTES_FILTER_OPEN",
  "apex.iterate_notes": "MULTI_NOTE_REVIEW",
  "apex.open_note_preview": "MULTI_NOTE_REVIEW",
  "apex.select_note_text": "INPATIENT_NOTE_SELECTED",
  "apex.copy_note_text": "NOTE_TEXT_CAPTURED",
  "apex.capture_into_bundle": "CONTEXT_BUNDLE_READY",
  "apex.advance_or_finish": "CONTEXT_BUNDLE_READY",
  "apex.summarize_in_panel": "CONTEXT_BUNDLE_READY",
};

export function buildApexTransitions(
  actions: EhrAction[],
): WorkflowTransition[] {
  let prev: EhrWorkflowState | null = null;
  const transitions: WorkflowTransition[] = [];
  for (const a of actions) {
    const to = APEX_TRANSITION_MAP[a.id];
    if (!to) continue;
    transitions.push({
      from: prev,
      to,
      trigger: a.id,
      evidence: a.semanticTarget.label,
      confidence: 0.9,
      timestamp: new Date().toISOString(),
      safetyLevel: a.safetyLevel,
    });
    prev = to;
  }
  return transitions;
}
