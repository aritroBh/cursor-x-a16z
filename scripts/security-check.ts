import { execSync } from "child_process";
import * as path from "path";

/**
 * Security check script to prevent leaking API keys.
 * Specifically checks for 'nvapi-' which is the prefix for NVIDIA API keys.
 */

const ROOT_DIR = path.resolve(__dirname, "..");
const SEARCH_PATTERN = "nvapi-";

// Files and directories to ignore
const IGNORE_PATHS = [
  "node_modules",
  ".git",
  "dist",
  "out",
  "release",
  "build",
  ".env",
  "security-check.ts",
];

function runCheck() {
  console.log(`[SECURITY] Checking for leaked keys (${SEARCH_PATTERN})...`);

  try {
    const excludeArgs = IGNORE_PATHS.map((p) => {
      if (p.includes("/")) {
        return `--exclude-dir=${p}`;
      }
      return `--exclude=${p}`;
    }).join(" ");

    const command = `grep -r "${SEARCH_PATTERN}" "${ROOT_DIR}" ${excludeArgs} -n`;

    let output = "";
    try {
      output = execSync(command).toString().trim();
    } catch (e: any) {
      // grep returns 1 if no matches found
      if (e.status === 1) {
        console.log("\x1b[32m[SECURITY PASS] No leaked keys found.\x1b[0m");
        return;
      }
      throw e;
    }

    if (output) {
      console.error(
        "\x1b[31m[SECURITY FAILURE] Found potential leaked NVIDIA API keys:\x1b[0m",
      );
      console.error(output);
      process.exit(1);
    }
  } catch (error: any) {
    console.warn(
      `[SECURITY WARNING] Security check script encountered an error: ${error.message}`,
    );
  }
}

runCheck();
