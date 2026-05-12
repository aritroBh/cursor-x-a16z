import re

with open("src/main/index.ts", "r") as f:
    content = f.read()

# Add imports
imports_to_add = """
import { startMemorySidecar } from "./memorySidecar";
"""
content = re.sub(
    r'(import \{ validateSender \} from "\./security/ipcGuards";)',
    r'\1\n' + imports_to_add,
    content
)

# Update app.whenReady().then(...)
startup_logic = """
  const specterMode = process.env.SPECTER_MODE || "ghostwiki";
  safeLog("[STARTUP] Active Mode:", { mode: specterMode });

  if (specterMode === "ghostwiki") {
    safeLog("[STARTUP] Memory Service Port:", { port: process.env.MEMORY_SERVICE_PORT || "8765" });
    safeLog("[STARTUP] Wiki Root:", { root: process.env.GHOSTWIKI_WIKI_ROOT || "./wiki" });
    safeLog("[STARTUP] Cognee Enabled:", { enabled: process.env.COGNEE_ENABLED || "false" });
    startMemorySidecar();
  }

  createWindow();
  createOverlayWindow();
"""

content = re.sub(
    r'  createWindow\(\);\n  createOverlayWindow\(\);',
    startup_logic,
    content
)

with open("src/main/index.ts", "w") as f:
    f.write(content)
