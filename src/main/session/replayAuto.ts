import { safeLog, safeWarn } from "../logger";
import { clickRealMouse, executeRealMouseSteps } from "../cursor";
import {
  isPeekabooAvailable,
  clickTarget as peekabooClick,
} from "../automation/peekabooAdapter";
import type { Step } from "./types";
import { resolveTarget } from "../automation/targetResolver";
import {
  createReplayController,
  isActive,
  releaseReplayController,
  restoreOverlayAfterReplay,
  sendOverlay,
  setOverlayForReplay,
  sleep,
} from "./replayController";
import { isProhibitedAutonomousLabel } from "../clinical/prohibitedActions";

const DEFAULT_WAIT_STEP_MS = 800;

function clinicalSafetyHaystack(step: Step): string {
  return [
    step.id ?? "",
    step.title ?? "",
    step.targetLabel ?? "",
    step.instruction ?? "",
    step.typeText ?? "",
  ]
    .filter((s) => typeof s === "string" && s.length > 0)
    .join(" ");
}

function stepWaitMs(step: Step): number {
  return step.waitForMs || step.delayMs || DEFAULT_WAIT_STEP_MS;
}

function stepTitle(step: Step): string {
  return step.instruction || step.targetLabel || step.id || "Untitled step";
}

export async function replayAutoExecute(steps: Step[]): Promise<void> {
  const controller = createReplayController();
  setOverlayForReplay();
  safeLog("[AUTO_REAL_MOUSE] STARTING REAL OS AUTOMATION", {
    totalSteps: steps.length,
  });

  try {
    for (let index = 0; index < steps.length; index++) {
      if (!isActive(controller)) break;
      const step = steps[index];
      if (isProhibitedAutonomousLabel(clinicalSafetyHaystack(step))) {
        safeWarn(
          "[AUTO_REAL_MOUSE] CLINICAL SAFETY: refusing to autonomously execute step matching prohibited action list. Use walkthrough mode for clinician confirmation.",
          {
            index,
            title: stepTitle(step),
            targetLabel: step.targetLabel,
          },
        );
        sendOverlay("replay:clinical-blocked", {
          index,
          step,
          reason: "prohibited autonomous action",
        });
        break;
      }
      safeLog("[AUTO_REAL_MOUSE] real mouse step", {
        index,
        displayIndex: index + 1,
        total: steps.length,
        title: stepTitle(step),
        action: step.action,
        x: step.x,
        y: step.y,
      });

      if (step.action === "click") {
        if (!(await sleep(step.delayMs || 0, controller))) break;

        const resolved = resolveTarget(step, {
          hasDOM: false, // In auto replay, default to non-playwright unless specifically configured
          peekabooAvailable: isPeekabooAvailable(),
          peekabooTarget: isPeekabooAvailable()
            ? { bbox: { x: step.x, y: step.y } }
            : undefined,
          vlmTarget: {
            confidence: step.targetConfidence ?? 0.8,
            bbox: { x: step.x, y: step.y, width: 0, height: 0 },
          },
          currentApp: step.appName,
        });

        safeLog("[AUTO_REAL_MOUSE] resolved target", { index, resolved });

        if (resolved.requiresConfirmation) {
          safeWarn("[AUTO_REAL_MOUSE] Target requires confirmation. Pausing.", {
            index,
            resolved,
          });
          sendOverlay("replay:confirm-needed", {
            index,
            step,
            reason: "low confidence or unsafe target",
          });
          // In a real app we'd wait for manual confirmation via IPC, but here we break/pause.
          // For demo purposes, we will break autonomous replay.
          break;
        }

        if (resolved.source === "playwright") {
          safeLog("[AUTO_REAL_MOUSE] Executing Playwright click", {
            index,
            selector: resolved.selector,
          });
          // Playwright click stub
        } else if (resolved.source === "peekaboo") {
          safeLog("[AUTO_REAL_MOUSE] Executing Peekaboo click", {
            index,
            target: step.targetLabel || { x: step.x, y: step.y },
          });
          if (resolved.requiresConfirmation) {
            safeWarn(
              "[AUTO_REAL_MOUSE] Target requires confirmation. Pausing/Skipping.",
            );
            break;
          }
          await peekabooClick(step.targetLabel || { x: step.x, y: step.y });
        } else if (resolved.source === "openara" || resolved.source === "ax") {
          safeLog("[AUTO_REAL_MOUSE] Executing Accessibility click", {
            index,
            bbox: resolved.bbox,
          });
          if (resolved.bbox)
            await clickRealMouse(resolved.bbox.x, resolved.bbox.y);
        } else {
          safeLog("[AUTO_REAL_MOUSE] REAL OS move/click (Vision/Fallback)", {
            index,
            x: step.x,
            y: step.y,
          });
          await clickRealMouse(step.x, step.y);
        }
      } else if (step.action === "wait") {
        const waitMs = stepWaitMs(step);
        safeLog("[AUTO_REAL_MOUSE] wait before next real OS action", {
          index,
          waitMs,
        });
        if (!(await sleep(waitMs, controller))) break;
      } else {
        if (!(await sleep(step.delayMs || 0, controller))) break;
        safeLog("[AUTO_REAL_MOUSE] REAL OS action replay", {
          index,
          action: step.action,
          x: step.x,
          y: step.y,
          hasTypeText: Boolean(step.typeText),
        });
        await executeRealMouseSteps([{ ...step, delayMs: 0 }]);
      }
      safeLog("[AUTO_REAL_MOUSE] real mouse step complete", {
        index,
        action: step.action,
      });
      sendOverlay("replay:progress", { index, total: steps.length });
    }
  } finally {
    if (!controller.cancelled) {
      sendOverlay("replay:complete", {});
    }
    releaseReplayController(controller);
    restoreOverlayAfterReplay(controller);
    safeLog("[AUTO_REAL_MOUSE] REAL OS AUTOMATION FINISHED", {
      cancelled: controller.cancelled,
    });
  }
}
