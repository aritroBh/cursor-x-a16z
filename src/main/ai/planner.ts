import {
  classifyAnthropicError,
  createAnthropicClient,
  getAnthropicModel,
} from "./config";
import { isLabelResolvableInVisibleSet } from "../automation/liveTargetResolver";
import { safeLog, safeWarn, safeError } from "../logger";
import type { BehavioralState } from "../session/types";
import { normalizeBehavioralState } from "../behavioral/model";

const CLAUDE_MODEL = getAnthropicModel();
const STEP_ACTIONS = ["click", "type", "scroll", "wait"];
type PlannerMode = "silent" | "ultra";
const SYSTEM_PROMPT =
  "You are a software tutor. Given the user's intent, current screen state, and their learning history, generate a precise step-by-step tutorial. Return ONLY valid JSON. Coordinates must be percentages of screen dimensions. Keep instructions under 15 words each for Silent mode, conversational for Ultra mode.";

function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || text.match(/\{[\s\S]*\}/)?.[0] || text;
  return JSON.parse(candidate);
}

function clampCoordinate(value: any, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, value));
}

function isStepAction(value: any): boolean {
  return typeof value === "string" && STEP_ACTIONS.includes(value);
}

function normalizeMode(mode: any): PlannerMode {
  return mode === "ultra" ? "ultra" : "silent";
}

function coordinatesFrom(
  screenState: any,
): Array<{ label: string; x: number; y: number }> {
  if (
    !screenState ||
    typeof screenState !== "object" ||
    !Array.isArray(screenState.coordinates)
  ) {
    return [];
  }

  return screenState.coordinates
    .filter((item: any) => item && typeof item === "object")
    .map((item: any) => ({
      label:
        typeof item.label === "string" && item.label.trim()
          ? item.label
          : "target",
      x: clampCoordinate(item.x ?? item.targetX, 50),
      y: clampCoordinate(item.y ?? item.targetY, 50),
    }));
}

function safeScreenState(screenState: any): any {
  return {
    app:
      screenState &&
      typeof screenState === "object" &&
      typeof screenState.app === "string" &&
      screenState.app.trim()
        ? screenState.app
        : "Unknown",
    coordinates: coordinatesFrom(screenState),
  };
}

function findCoordinate(
  coordinates: Array<{ label: string; x: number; y: number }>,
  pattern: RegExp,
): { label: string; x: number; y: number } | undefined {
  return coordinates.find((item) => pattern.test(item.label));
}

function numberOrUndefined(value: any): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : undefined;
}

function normalizeSequence(value: any, fallback: any): any {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const maybeSequence = value;
  const steps =
    Array.isArray(maybeSequence.steps) && maybeSequence.steps.length > 0
      ? maybeSequence.steps
      : fallback.steps;

  return {
    levelTitle:
      typeof maybeSequence.levelTitle === "string" &&
      maybeSequence.levelTitle.trim()
        ? maybeSequence.levelTitle
        : fallback.levelTitle,
    estimatedMinutes:
      typeof maybeSequence.estimatedMinutes === "number" &&
      Number.isFinite(maybeSequence.estimatedMinutes)
        ? Math.max(1, Math.round(maybeSequence.estimatedMinutes))
        : fallback.estimatedMinutes,
    steps: steps.map((step: any, index: number) => {
      const partial = step && typeof step === "object" ? step : {};
      const fallbackStep =
        fallback.steps[Math.min(index, fallback.steps.length - 1)];
      const waitForMs =
        numberOrUndefined(partial.waitForMs) ??
        numberOrUndefined(partial.delayMs) ??
        numberOrUndefined(fallbackStep.waitForMs) ??
        numberOrUndefined(fallbackStep.delayMs);

      return {
        id: typeof partial.id === "string" ? partial.id : `step-${index + 1}`,
        instruction:
          typeof partial.instruction === "string" && partial.instruction.trim()
            ? partial.instruction
            : fallbackStep.instruction,
        targetLabel:
          typeof partial.targetLabel === "string" && partial.targetLabel.trim()
            ? partial.targetLabel
            : fallbackStep.targetLabel,
        x: clampCoordinate(partial.x ?? partial.targetX, fallbackStep.x),
        y: clampCoordinate(partial.y ?? partial.targetY, fallbackStep.y),
        action: isStepAction(partial.action)
          ? partial.action
          : fallbackStep.action,
        typeText:
          typeof partial.typeText === "string" ? partial.typeText : undefined,
        delayMs: numberOrUndefined(partial.delayMs),
        waitForMs,
      };
    }),
  };
}

function fallbackSequence(
  userIntent: string,
  screenState: any,
  mode: string,
): any {
  const coordinates = coordinatesFrom(screenState);
  const short = normalizeMode(mode) === "silent";

  if (/blender/i.test(userIntent) && /mesh/i.test(userIntent)) {
    const addMenu = findCoordinate(coordinates, /add/i);
    const meshItem = findCoordinate(coordinates, /mesh/i);
    const cubeItem = findCoordinate(coordinates, /cube/i);
    const moveTool = findCoordinate(coordinates, /move/i);

    return {
      levelTitle: "Add a Mesh in Blender",
      estimatedMinutes: 2,
      steps: [
        {
          id: "open-add-menu",
          instruction: short
            ? "Open Add."
            : "Start with the Add menu in the top-left.",
          targetLabel: "Add menu",
          x: addMenu?.x ?? 4,
          y: addMenu?.y ?? 3,
          action: "click",
        },
        {
          id: "choose-mesh",
          instruction: short
            ? "Choose Mesh."
            : "Now choose Mesh from that menu.",
          targetLabel: "Mesh",
          x: meshItem?.x ?? 6,
          y: meshItem?.y ?? 14,
          action: "click",
        },
        {
          id: "choose-cube",
          instruction: short
            ? "Select Cube."
            : "Pick Cube as your first simple mesh.",
          targetLabel: "Cube",
          x: cubeItem?.x ?? 10,
          y: cubeItem?.y ?? 20,
          action: "click",
        },
        {
          id: "confirm-viewport",
          instruction: short
            ? "Check viewport."
            : "Look in the viewport and confirm the cube appeared.",
          targetLabel: "Viewport",
          x: 50,
          y: 50,
          action: "wait",
          waitForMs: 800,
        },
        {
          id: "select-move-tool",
          instruction: short
            ? "Select move."
            : "Select the move tool so you can position it.",
          targetLabel: "Move tool",
          x: moveTool?.x ?? 2,
          y: moveTool?.y ?? 24,
          action: "click",
        },
      ],
    };
  }

  const generatedSteps = coordinates
    .slice(0, 5)
    .map((coordinate: any, index: number) => ({
      id: `step-${index + 1}`,
      instruction: short
        ? `Click ${coordinate.label}.`
        : `Next, click ${coordinate.label}.`,
      targetLabel: coordinate.label,
      x: coordinate.x,
      y: coordinate.y,
      action: "click",
    }));

  return {
    levelTitle: userIntent || "Specter Tutorial",
    estimatedMinutes: Math.max(1, Math.ceil(generatedSteps.length / 3)),
    steps:
      generatedSteps.length > 0
        ? generatedSteps
        : [
            {
              id: "step-1",
              instruction: short
                ? "Start here."
                : "Start with the main control on screen.",
              targetLabel: "Main target",
              x: 50,
              y: 50,
              action: "click",
            },
          ],
  };
}

export async function planSteps(
  userIntent: string,
  screenState: any,
  sessionHistory: any[],
  mode: string,
): Promise<any> {
  const normalizedMode = normalizeMode(mode);
  const normalizedScreenState = safeScreenState(screenState);
  const normalizedHistory = Array.isArray(sessionHistory) ? sessionHistory : [];
  const normalizedIntent =
    typeof userIntent === "string" && userIntent.trim()
      ? userIntent
      : "Specter Tutorial";

  safeLog("[PLANNER] Intent:", normalizedIntent);
  safeLog("[PLANNER] Mode:", normalizedMode);
  safeLog("[PLANNER] Screen app detected:", normalizedScreenState.app);

  const fallback = fallbackSequence(
    normalizedIntent,
    normalizedScreenState,
    normalizedMode,
  );
  const client = createAnthropicClient();

  if (!client) {
    safeWarn("[AI_BACKEND] Anthropic API key missing; using fallback");
    return fallback;
  }

  try {
    safeLog("[PLANNER] Calling Claude...", { model: CLAUDE_MODEL });
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify(
            {
              userIntent,
              screenState: normalizedScreenState,
              sessionHistory: normalizedHistory,
              mode: normalizedMode,
              requiredShape: {
                steps: [
                  {
                    id: "string",
                    instruction: "string",
                    targetLabel: "string",
                    x: 0,
                    y: 0,
                    action: "click | type | scroll | wait",
                    typeText: "optional string",
                    waitForMs: "optional number",
                  },
                ],
                levelTitle: "string",
                estimatedMinutes: "number",
              },
            },
            null,
            2,
          ),
        },
      ],
    });

    const rawText = message.content
      .flatMap((part) =>
        part.type === "text" && "text" in part && typeof part.text === "string"
          ? [part.text]
          : [],
      )
      .join("\n");

    safeLog("[PLANNER] Raw response:", rawText);
    const steps = normalizeSequence(extractJson(rawText), fallback);
    return steps;
  } catch (error: any) {
    const summary = classifyAnthropicError(error);
    const errorMessage = error?.message || String(error);
    const causeMessage = error?.cause?.message || "";
    if (errorMessage.includes("11434") || causeMessage.includes("11434")) {
      safeError(
        "[AI_BACKEND] Refusing localhost:11434 Anthropic route because USE_LOCAL_MODEL is not true. Check ANTHROPIC_BASE_URL / proxy env.",
      );
    }
    safeError(
      "[AI_BACKEND] Anthropic unavailable; using fallback. AI_BACKEND_UNAVAILABLE",
      summary,
    );
    return fallback;
  }
}

export async function planWithPersona(
  userIntent: string,
  screenState: any,
  sessionHistory: any[],
  mode: string,
  signature: BehavioralState,
): Promise<any> {
  const normalizedMode = normalizeMode(mode);
  const normalizedScreenState = safeScreenState(screenState);
  const normalizedHistory = Array.isArray(sessionHistory) ? sessionHistory : [];
  const normalizedIntent =
    typeof userIntent === "string" && userIntent.trim()
      ? userIntent
      : "Specter Mirror Mode";
  const normalizedSignature = normalizeBehavioralState(signature);
  const fallback = fallbackSequence(
    normalizedIntent,
    normalizedScreenState,
    normalizedMode,
  );
  const client = createAnthropicClient();

  safeLog("[MIRROR_MODE] planning with behavioral persona", {
    intent: normalizedIntent,
    mode: normalizedMode,
    app: normalizedScreenState.app,
    mood: normalizedSignature.moodLabel,
  });

  if (!client) {
    safeWarn("[AI_BACKEND] Anthropic API key missing; using persona fallback");
    return fallback;
  }

  try {
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system:
        `${SYSTEM_PROMPT}\n\n` +
        "You are planning actions for this user's behavioral signature. " +
        "Condition the sequence on their impulsivity, cognitiveLoad, flowScore, revisionRate, and decisionConfidence. " +
        "High impulsivity prefers direct actions and fewer checks. High cognitiveLoad prefers slower, explicit, reversible steps. " +
        "High decisionConfidence prefers direct target movement with low hesitation. Return the same JSON Step[] shape as the normal planner.",
      messages: [
        {
          role: "user",
          content: JSON.stringify(
            {
              userIntent: normalizedIntent,
              screenState: normalizedScreenState,
              sessionHistory: normalizedHistory,
              mode: normalizedMode,
              behavioralSignature: normalizedSignature,
              directnessPreference:
                normalizedSignature.impulsivity * 0.55 +
                normalizedSignature.decisionConfidence * 0.45,
              carefulnessPreference:
                normalizedSignature.cognitiveLoad * 0.7 +
                normalizedSignature.revisionRate * 0.3,
              requiredShape: {
                steps: [
                  {
                    id: "string",
                    instruction: "string",
                    targetLabel: "string",
                    x: 0,
                    y: 0,
                    action: "click | type | scroll | wait",
                    typeText: "optional string",
                    waitForMs: "optional number",
                  },
                ],
                levelTitle: "string",
                estimatedMinutes: "number",
              },
            },
            null,
            2,
          ),
        },
      ],
    });

    const rawText = message.content
      .flatMap((part) =>
        part.type === "text" && "text" in part && typeof part.text === "string"
          ? [part.text]
          : [],
      )
      .join("\n");

    return normalizeSequence(extractJson(rawText), fallback);
  } catch (error: any) {
    const summary = classifyAnthropicError(error);
    safeError(
      "[AI_BACKEND] Persona planner unavailable; using fallback. AI_BACKEND_UNAVAILABLE",
      summary,
    );
    return fallback;
  }
}

export async function converse(
  userMessage: string,
  screenState: any,
  conversationHistory: any[],
): Promise<string> {
  const client = createAnthropicClient();
  if (!client) {
    return "I can help with that once the Claude API key is configured. For now, keep following the cursor.";
  }

  try {
    const history = conversationHistory.slice(-8).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      system:
        "You are a concise, encouraging software tutor answering a mid-session question. Use the screen state, keep the user moving, and return plain text only.",
      messages: [
        ...history,
        {
          role: "user",
          content: JSON.stringify(
            {
              question: userMessage,
              screenState,
            },
            null,
            2,
          ),
        },
      ],
    });

    const text = message.content
      .flatMap((part) =>
        part.type === "text" && "text" in part && typeof part.text === "string"
          ? [part.text]
          : [],
      )
      .join("\n")
      .trim();

    return text || "Yes. Keep going with the next highlighted step.";
  } catch (error: any) {
    const summary = classifyAnthropicError(error);
    const errorMessage = error?.message || String(error);
    const causeMessage = error?.cause?.message || "";
    if (errorMessage.includes("11434") || causeMessage.includes("11434")) {
      safeError(
        "[AI_BACKEND] Refusing localhost:11434 Anthropic route because USE_LOCAL_MODEL is not true. Check ANTHROPIC_BASE_URL / proxy env.",
      );
    }
    safeError("[AI_BACKEND] Anthropic unavailable; using fallback", summary);
    return "I hit a temporary issue answering that. Keep going with the highlighted next step.";
  }
}

export interface UltraConversePayload {
  message: string;
  mode: "silent" | "ultra" | "ghostwiki";
  currentGoal?: string;
  currentStep?: any;
  screenState?: any;
  sessionHistory?: any[];
  memoryContext?: string;
  /** Accessibility labels from frontmost app; constrains liveTarget grounding. */
  visibleAxLabels?: string[];
}

export interface UltraConverseLiveTarget {
  targetLabel: string;
  action: "click" | "type" | "scroll" | "wait";
  instruction?: string;
}

export interface UltraConverseResult {
  reply: string;
  intent?: "answer" | "start_walkthrough" | "repeat_step" | "clarify" | "stop";
  suggestedPrompt?: string;
  shouldSpeak?: boolean;
  shouldStartWalkthrough?: boolean;
  liveTarget?: UltraConverseLiveTarget;
  /** Set when model pointed at a label not present in visibleAxLabels / AX tree. */
  liveTargetUnresolved?: string;
}

const LIVE_TARGET_ACTIONS = new Set(["click", "type", "scroll", "wait"]);

export function parseUltraLiveTarget(
  raw: unknown,
): UltraConverseLiveTarget | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const targetLabel =
    typeof obj.targetLabel === "string" ? obj.targetLabel.trim() : "";
  const action = obj.action;
  if (
    !targetLabel ||
    typeof action !== "string" ||
    !LIVE_TARGET_ACTIONS.has(action)
  ) {
    return undefined;
  }
  const instruction =
    typeof obj.instruction === "string" ? obj.instruction.trim() : undefined;
  return {
    targetLabel,
    action: action as UltraConverseLiveTarget["action"],
    ...(instruction ? { instruction } : {}),
  };
}

function fallbackUltraReply(message: string): UltraConverseResult {
  const lower = message.toLowerCase();
  if (lower.includes("what") && lower.includes("next")) {
    return {
      reply:
        "Move your cursor toward the highlighted target. I will wait until you are close.",
      intent: "repeat_step",
      shouldSpeak: true,
    };
  }
  if (lower.includes("why")) {
    return {
      reply: "This is the next step to accomplish your goal. Keep going!",
      intent: "clarify",
      shouldSpeak: true,
    };
  }
  return {
    reply:
      "I am here to help you through the steps. Just follow the ghost cursor.",
    intent: "answer",
    shouldSpeak: true,
  };
}

export async function ultraConverse(
  payload: UltraConversePayload,
): Promise<UltraConverseResult> {
  const { message, currentGoal, screenState, sessionHistory, memoryContext } =
    payload;
  const client = createAnthropicClient();

  if (!client) {
    return fallbackUltraReply(message);
  }

  try {
    const history = (sessionHistory || []).slice(-8).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const visibleLabels = (payload.visibleAxLabels || [])
      .map((label) => String(label).trim())
      .filter((label) => label.length > 1)
      .slice(0, 25);

    const liveTargetInstruction =
      visibleLabels.length > 0
        ? `If your reply references a specific on-screen control, include liveTarget ONLY when targetLabel exactly matches one of these accessibility-visible labels from the frontmost app: ${JSON.stringify(visibleLabels)}. Never invent menu items or buttons (e.g. "Save", "File") unless they appear in that list. action must be click|type|scroll|wait. Optional instruction: short spoken hint. Omit liveTarget when nothing in the list fits or the reply is purely conversational.`
        : "If your reply references a specific visible UI element the user should look at or interact with, include liveTarget with targetLabel (concise visible text/accessibility label from the current app only — never generic guesses), action (click|type|scroll|wait), and optional instruction (short spoken hint). Omit liveTarget when the reply is purely conversational with nothing to point at.";

    const isProactiveSummon = message.includes("[Proactive summon]");
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      system: isProactiveSummon
        ? `You are Specter, a friendly ghost assistant on the user's computer. The user summoned you without typing. Use screenState and memoryFromPastSessions to predict what they are doing now (app, page, search, recent activity) and offer one concrete helpful next step. Be conversational and concise (1-3 short sentences; may be read aloud). Do not ask them to repeat context you already have. ${liveTargetInstruction} Return ONLY valid JSON.`
        : `You are Specter, a friendly ghost assistant that lives on the user's computer. You remember workflows the user has done before (provided as memoryFromPastSessions) and can teach them software step by step. Be conversational and concise (1-3 short sentences; replies may be read aloud). When the user asks you to demonstrate, teach, or do something on screen, set intent to start_walkthrough. When memory is relevant, reference it naturally. ${liveTargetInstruction} Return ONLY valid JSON.`,
      messages: [
        ...history,
        {
          role: "user",
          content: JSON.stringify(
            {
              userMessage: message,
              currentGoal,
              screenState,
              memoryFromPastSessions: memoryContext || null,
              visibleAxLabels: visibleLabels.length > 0 ? visibleLabels : null,
              requiredShape: {
                reply: "string (short, conversational)",
                intent:
                  "answer | start_walkthrough | repeat_step | clarify | stop",
                shouldSpeak: "boolean",
                shouldStartWalkthrough: "boolean",
                liveTarget:
                  "optional { targetLabel: string, action: click|type|scroll|wait, instruction?: string }",
              },
            },
            null,
            2,
          ),
        },
      ],
    });

    const rawText = response.content
      .flatMap((part) =>
        part.type === "text" && "text" in part && typeof part.text === "string"
          ? [part.text]
          : [],
      )
      .join("\n");

    const result = extractJson(rawText);
    let liveTarget = parseUltraLiveTarget(result.liveTarget);
    let liveTargetUnresolved: string | undefined;

    if (liveTarget && visibleLabels.length > 0) {
      if (
        !isLabelResolvableInVisibleSet(liveTarget.targetLabel, visibleLabels)
      ) {
        liveTargetUnresolved = liveTarget.targetLabel;
        safeWarn("[ULTRA] liveTarget stripped — not in visible AX labels", {
          targetLabel: liveTarget.targetLabel,
          visibleAxLabels: visibleLabels.slice(0, 8),
        });
        liveTarget = undefined;
      }
    }

    return {
      reply:
        typeof result.reply === "string"
          ? result.reply
          : fallbackUltraReply(message).reply,
      intent: result.intent || "answer",
      shouldSpeak:
        typeof result.shouldSpeak === "boolean" ? result.shouldSpeak : true,
      shouldStartWalkthrough:
        typeof result.shouldStartWalkthrough === "boolean"
          ? result.shouldStartWalkthrough
          : false,
      ...(liveTarget ? { liveTarget } : {}),
      ...(liveTargetUnresolved ? { liveTargetUnresolved } : {}),
    };
  } catch (error: any) {
    safeError("[ULTRA] Anthropic converse failed", error);
    return fallbackUltraReply(message);
  }
}
