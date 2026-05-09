import type { BrowserWindow, IpcMain } from "electron";
import { validateSender } from "../security/ipcGuards";
import {
  captureFromClipboard,
  captureManualPaste,
  type CaptureMeta,
} from "./capture";
import {
  addSource,
  createBundle,
  createSourceNote,
  summarizeBundle,
} from "./contextBundle";
import { generateDraftNote, validateDraft } from "./drafter";
import {
  buildTransitions,
  compileEhrWorkflow,
  EHR_TARGETS,
} from "./ehrWorkflow";
import {
  PROHIBITED_AUTONOMOUS_ACTIONS,
} from "./prohibitedActions";
import { dryRunWorkflow, WorkflowEngine } from "./workflowEngine";
import { clinicalError, clinicalLog } from "./logger";
import type {
  ClinicalContextBundle,
  DraftNote,
  EhrAction,
} from "./types";

interface ClinicalSessionState {
  bundle: ClinicalContextBundle;
  draft: DraftNote | null;
  lastTraceAt: string | null;
}

const session: ClinicalSessionState = {
  bundle: createBundle({ encounterType: "Inpatient admission" }),
  draft: null,
  lastTraceAt: null,
};

function broadcast(window: BrowserWindow | null, channel: string, payload: unknown): void {
  if (!window || window.isDestroyed()) return;
  if (window.webContents.isDestroyed()) return;
  window.webContents.send(channel, payload);
}

function emitBundleUpdate(windowProvider: () => BrowserWindow | null): void {
  broadcast(windowProvider(), "clinical:bundle-updated", {
    bundleSize: session.bundle.sources.length,
    captureMethod: session.bundle.captureMethod,
    sourceIds: session.bundle.sources.map((s) => s.id),
  });
}

export function getCurrentClinicalSession(): ClinicalSessionState {
  return session;
}

export function registerClinicalIpc(
  ipcMain: IpcMain,
  windowProvider: () => BrowserWindow | null,
): void {
  ipcMain.handle("clinical:bundle:get", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    return {
      patientContext: session.bundle.patientContext,
      sources: session.bundle.sources.map((s) => ({
        id: s.id,
        noteType: s.noteType,
        author: s.author,
        service: s.service,
        timestamp: s.timestamp,
        sourceScreen: s.sourceScreen,
        contentHash: s.contentHash,
        chars: s.rawText.length,
        rawTextPreview:
          s.rawText.length > 240 ? s.rawText.slice(0, 240) + "…" : s.rawText,
        hasSections: Boolean(
          s.extractedSections && Object.keys(s.extractedSections).length > 0,
        ),
      })),
      captureMethod: session.bundle.captureMethod,
      createdAt: session.bundle.createdAt,
      summary: summarizeBundle(session.bundle),
    };
  });

  ipcMain.handle("clinical:bundle:reset", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    session.bundle = createBundle({ encounterType: "Inpatient admission" });
    session.draft = null;
    clinicalLog("bundle reset");
    emitBundleUpdate(windowProvider);
    return { ok: true };
  });

  ipcMain.handle(
    "clinical:bundle:add-clipboard",
    async (event, meta: CaptureMeta = {}) => {
      if (!validateSender(event, windowProvider()))
        throw new Error("Unauthorized sender");
      const result = captureFromClipboard(session.bundle, meta);
      emitBundleUpdate(windowProvider);
      return result;
    },
  );

  ipcMain.handle(
    "clinical:bundle:add-manual",
    async (event, rawText: string, meta: CaptureMeta = {}) => {
      if (!validateSender(event, windowProvider()))
        throw new Error("Unauthorized sender");
      const result = captureManualPaste(session.bundle, rawText, meta);
      emitBundleUpdate(windowProvider);
      return result;
    },
  );

  ipcMain.handle(
    "clinical:bundle:add-fixture",
    async (event, payload: { rawText: string; meta?: CaptureMeta }) => {
      if (!validateSender(event, windowProvider()))
        throw new Error("Unauthorized sender");
      const meta = payload.meta ?? {};
      const source = createSourceNote({
        rawText: payload.rawText,
        noteType: meta.noteType,
        author: meta.author,
        service: meta.service,
        timestamp: meta.timestamp,
        sourceScreen: meta.sourceScreen ?? "fixture",
        idHint: meta.idHint,
      });
      const { deduped } = addSource(session.bundle, source);
      session.bundle.captureMethod = "manual_paste";
      emitBundleUpdate(windowProvider);
      return {
        added: !deduped,
        deduped,
        bundleSize: session.bundle.sources.length,
        sourceId: source.id,
      };
    },
  );

  ipcMain.handle("clinical:workflow:compile", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    const actions: EhrAction[] = compileEhrWorkflow();
    return {
      actions,
      transitions: buildTransitions(actions),
      targets: EHR_TARGETS,
      prohibited: [...PROHIBITED_AUTONOMOUS_ACTIONS],
    };
  });

  ipcMain.handle("clinical:workflow:dryrun", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    const result = dryRunWorkflow();
    session.lastTraceAt = new Date().toISOString();
    broadcast(windowProvider(), "clinical:workflow-trace", {
      traceLength: result.trace.length,
      paused: result.paused.length,
      blocked: result.blocked.length,
    });
    return result;
  });

  ipcMain.handle(
    "clinical:workflow:run",
    async (
      event,
      mode: "dry_run" | "clinician_confirmed" = "dry_run",
    ) => {
      if (!validateSender(event, windowProvider()))
        throw new Error("Unauthorized sender");
      const engine = new WorkflowEngine();
      return engine.run({ mode, abortOnBlocked: false });
    },
  );

  ipcMain.handle(
    "clinical:draft:generate",
    async (event, draftNoteType?: string) => {
      if (!validateSender(event, windowProvider()))
        throw new Error("Unauthorized sender");
      try {
        const draft = await generateDraftNote(session.bundle, {
          draftNoteType: draftNoteType || "Inpatient Progress Note",
          anthropicClient: null,
        });
        session.draft = draft;
        const validation = validateDraft(draft, session.bundle);
        broadcast(windowProvider(), "clinical:draft-generated", {
          generator: draft.generator,
          ok: validation.ok,
          errors: validation.errors,
          sourceMapEntries: draft.source_map.length,
          missing: draft.uncertain_or_missing_info.length,
        });
        return { draft, validation };
      } catch (e) {
        clinicalError("draft generation failed", { err: String(e) });
        throw e;
      }
    },
  );

  ipcMain.handle("clinical:draft:get", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    if (!session.draft) return { draft: null };
    return {
      draft: session.draft,
      validation: validateDraft(session.draft, session.bundle),
    };
  });

  ipcMain.handle("clinical:safety:list-prohibited", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    return [...PROHIBITED_AUTONOMOUS_ACTIONS];
  });

  ipcMain.handle("clinical:window:close", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    const w = windowProvider();
    if (w && !w.isDestroyed()) w.close();
    return { ok: true };
  });

  clinicalLog("registered clinical IPC handlers");
}

