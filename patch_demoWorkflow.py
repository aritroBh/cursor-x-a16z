import re

with open("src/main/session/demoWorkflow.ts", "r") as f:
    content = f.read()

# Make it load from event-recap if ghostwiki
new_logic = """
import fs from "fs";
import path from "path";
import { safeLog } from "../logger";

export function getDemoWorkflow() {
  const specterMode = process.env.SPECTER_MODE || "ghostwiki";
  if (specterMode === "ghostwiki") {
    try {
      const p = path.join(process.cwd(), "demo-workflows/event-recap/graph.json");
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, "utf-8"));
        return data;
      }
    } catch (e) {
      safeLog("Failed to load ghostwiki demo graph", e);
    }
  }
  return null;
}
"""

content = content + "\n" + new_logic

with open("src/main/session/demoWorkflow.ts", "w") as f:
    f.write(content)
