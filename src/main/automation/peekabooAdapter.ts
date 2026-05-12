import { spawn } from "child_process";
import * as os from "os";

export interface PeekabooResult {
  ok: boolean;
  warnings: string[];
  result?: any;
  raw?: string;
}

const DEFAULT_TIMEOUT_MS = 10000;

export function isMac(): boolean {
  return os.platform() === "darwin";
}

function getUsePeekabooEnv(): boolean {
  if (process.env.USE_PEEKABOO === "false") return false;
  if (process.env.USE_PEEKABOO === "true") return true;
  return isMac();
}

export function isPeekabooAvailable(): boolean {
  if (!isMac()) return false;
  if (!getUsePeekabooEnv()) return false;
  // Further runtime check would go in getPeekabooStatus
  return true;
}

function executePeekabooCommand(
  args: string[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<PeekabooResult> {
  return new Promise((resolve) => {
    if (!isMac()) {
      return resolve({
        ok: false,
        warnings: ["Peekaboo disabled: non-macOS platform"],
      });
    }

    if (!getUsePeekabooEnv()) {
      return resolve({
        ok: false,
        warnings: ["Peekaboo disabled via environment"],
      });
    }

    let stdoutData = "";
    let stderrData = "";

    const child = spawn("peekaboo", args, { shell: false });

    const timer = setTimeout(() => {
      child.kill();
      resolve({
        ok: false,
        warnings: [`Peekaboo command timed out after ${timeoutMs}ms`],
      });
    }, timeoutMs);

    child.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      if ((err as any).code === "ENOENT") {
        resolve({
          ok: false,
          warnings: ["Peekaboo binary missing on PATH"],
        });
      } else {
        resolve({
          ok: false,
          warnings: [`Failed to spawn peekaboo: ${err.message}`],
        });
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        return resolve({
          ok: false,
          warnings: [`Command exited with code ${code}`, stderrData],
        });
      }

      // If json parsing is expected based on args
      if (args.includes("--json")) {
        try {
          const parsed = JSON.parse(stdoutData.trim());
          return resolve({ ok: true, warnings: [], result: parsed });
        } catch (e) {
          return resolve({
            ok: false,
            warnings: ["Invalid Peekaboo JSON output"],
            raw: stdoutData,
          });
        }
      }

      resolve({
        ok: true,
        warnings: [],
        raw: stdoutData,
      });
    });
  });
}

export async function getPeekabooStatus(): Promise<{
  enabled: boolean;
  available: boolean;
  platform: string;
  warning?: string;
}> {
  if (!isMac()) {
    return {
      enabled: false,
      available: false,
      platform: os.platform(),
      warning: "Peekaboo is only supported on macOS",
    };
  }

  const enabled = getUsePeekabooEnv();
  if (!enabled) {
    return {
      enabled: false,
      available: false,
      platform: "darwin",
      warning: "Peekaboo is disabled via environment",
    };
  }

  // Try to check permissions
  const res = await executePeekabooCommand(["permissions", "status", "--json"]);
  if (!res.ok) {
    if (res.warnings.includes("Peekaboo binary missing on PATH")) {
      return {
        enabled: true,
        available: false,
        platform: "darwin",
        warning:
          "Peekaboo binary is missing. Install with: brew install steipete/tap/peekaboo",
      };
    }
    return {
      enabled: true,
      available: false,
      platform: "darwin",
      warning: res.warnings.join("; "),
    };
  }

  const permissionsOk =
    res.result && res.result.ScreenRecording && res.result.Accessibility;
  if (!permissionsOk) {
    return {
      enabled: true,
      available: true,
      platform: "darwin",
      warning:
        "Missing macOS permissions. Check Screen Recording and Accessibility.",
    };
  }

  return {
    enabled: true,
    available: true,
    platform: "darwin",
  };
}

export async function captureSnapshot(
  appName?: string,
): Promise<PeekabooResult> {
  const args = ["see", "--json"];
  if (appName) {
    args.push("--app", appName);
  }
  return executePeekabooCommand(args);
}

export async function clickTarget(
  target: string | { x: number; y: number },
): Promise<PeekabooResult> {
  if (typeof target === "string") {
    return executePeekabooCommand(["click", "--id", target, "--json"]);
  }
  return executePeekabooCommand([
    "click",
    "--x",
    String(target.x),
    "--y",
    String(target.y),
    "--json",
  ]);
}

export async function typeText(text: string): Promise<PeekabooResult> {
  return executePeekabooCommand(["type", text, "--json"]);
}

export async function pressHotkey(keys: string): Promise<PeekabooResult> {
  return executePeekabooCommand(["hotkey", keys, "--json"]);
}

export async function scrollTarget(
  target: string,
  direction: "up" | "down" | "left" | "right",
): Promise<PeekabooResult> {
  return executePeekabooCommand([
    "scroll",
    direction,
    "--id",
    target,
    "--json",
  ]);
}
