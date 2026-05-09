import { spawn, spawnSync } from "child_process";
import { existsSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import { app } from "electron";
import { safeError, safeLog, safeWarn } from "./logger";

export interface AxElement {
  i: number;
  role: string;
  title: string;
  desc: string;
  value: string;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  actionable: boolean;
}

export interface AxDumpResult {
  app: string;
  pid: number;
  elements: AxElement[];
}

let resolvedBinaryPath: string | null = null;
let lastCompileError: string | null = null;

function sourcePath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "native", "ax-dump.swift");
  }
  return join(__dirname, "..", "..", "resources", "native", "ax-dump.swift");
}

function bundledBinaryPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "native", "build", "ax-dump");
  }
  return join(
    __dirname,
    "..",
    "..",
    "resources",
    "native",
    "build",
    "ax-dump",
  );
}

function userDataBinaryPath(): string {
  return join(app.getPath("userData"), "bin", "ax-dump");
}

function isExecutable(path: string): boolean {
  try {
    const s = statSync(path);
    return s.isFile() && (s.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function compileToUserData(): string | null {
  const src = sourcePath();
  if (!existsSync(src)) {
    lastCompileError = `ax-dump source not found at ${src}`;
    safeWarn("[AX_DUMP] source missing", { src });
    return null;
  }

  const out = userDataBinaryPath();
  mkdirSync(join(app.getPath("userData"), "bin"), { recursive: true });

  const result = spawnSync(
    "/usr/bin/xcrun",
    ["swiftc", "-O", "-framework", "Cocoa", src, "-o", out],
    { encoding: "utf8", timeout: 60_000 },
  );

  if (result.status !== 0) {
    lastCompileError =
      result.stderr?.slice(0, 400) || `swiftc exit ${result.status}`;
    safeError("[AX_DUMP] swiftc failed", {
      status: result.status,
      stderr: lastCompileError,
    });
    return null;
  }

  if (!isExecutable(out)) {
    lastCompileError = `compiled binary not executable: ${out}`;
    safeError("[AX_DUMP] compile produced non-executable", { out });
    return null;
  }

  safeLog("[AX_DUMP] compiled ax-dump", { path: out });
  return out;
}

export function ensureAxDumpReady(): string | null {
  if (resolvedBinaryPath && isExecutable(resolvedBinaryPath)) {
    return resolvedBinaryPath;
  }

  const bundled = bundledBinaryPath();
  if (isExecutable(bundled)) {
    resolvedBinaryPath = bundled;
    return resolvedBinaryPath;
  }

  const cached = userDataBinaryPath();
  if (isExecutable(cached)) {
    resolvedBinaryPath = cached;
    return resolvedBinaryPath;
  }

  const compiled = compileToUserData();
  if (compiled) {
    resolvedBinaryPath = compiled;
    return resolvedBinaryPath;
  }

  return null;
}

export function getAxDumpStatus(): {
  ready: boolean;
  path: string | null;
  lastError: string | null;
} {
  return {
    ready: resolvedBinaryPath !== null,
    path: resolvedBinaryPath,
    lastError: lastCompileError,
  };
}

export async function dumpAxElements(
  appIdentifier: string,
  timeoutMs = 4000,
): Promise<AxDumpResult | null> {
  const bin = ensureAxDumpReady();
  if (!bin) {
    safeWarn("[AX_DUMP] binary unavailable; skipping dump");
    return null;
  }

  return new Promise((resolve) => {
    const child = spawn(bin, [appIdentifier], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      safeWarn("[AX_DUMP] timeout", { app: appIdentifier, timeoutMs });
      resolve(null);
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      safeError("[AX_DUMP] spawn error", { error: err.message });
      resolve(null);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        safeWarn("[AX_DUMP] non-zero exit", {
          code,
          stderr: stderr.slice(0, 200),
        });
        resolve(null);
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as AxDumpResult;
        if (!parsed || !Array.isArray(parsed.elements)) {
          safeWarn("[AX_DUMP] malformed JSON shape");
          resolve(null);
          return;
        }
        resolve(parsed);
      } catch (err: any) {
        safeError("[AX_DUMP] parse error", {
          message: err?.message,
          preview: stdout.slice(0, 200),
        });
        resolve(null);
      }
    });
  });
}
