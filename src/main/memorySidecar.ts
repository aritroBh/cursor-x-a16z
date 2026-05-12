import { spawn } from "child_process";
import { join } from "path";
import { safeLog, safeError } from "./logger";

export function startMemorySidecar() {
  const port = process.env.MEMORY_SERVICE_PORT || "8765";
  const pythonExec = process.env.VIRTUAL_ENV
    ? join(process.env.VIRTUAL_ENV, "bin", "python")
    : "python";

  safeLog("[GhostWiki] Starting memory sidecar on port", { port, pythonExec });

  const child = spawn(
    pythonExec,
    [
      "-m",
      "uvicorn",
      "memory_service.app:app",
      "--host",
      "127.0.0.1",
      "--port",
      port,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONPATH: process.cwd(),
      },
    },
  );

  child.stdout.on("data", (data) => {
    safeLog("[MemoryService]", { out: data.toString().trim() });
  });

  child.stderr.on("data", (data) => {
    safeError("[MemoryService]", { err: data.toString().trim() });
  });

  child.on("close", (code) => {
    safeLog(`[MemoryService] Exited with code ${code}`);
  });

  return child;
}
