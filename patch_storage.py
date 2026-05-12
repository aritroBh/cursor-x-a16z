import re

with open("src/main/session/storage.ts", "r") as f:
    content = f.read()

new_logic = """
export function loadGraph(appName = DEFAULT_APP_NAME): LearningGraph {
  const specterMode = process.env.SPECTER_MODE || "ghostwiki";
  if (specterMode === "ghostwiki") {
    const demo = getDemoWorkflow();
    if (demo) {
      return normalizeGraph(demo as any, appName);
    }
  }
"""

content = re.sub(
    r'export function loadGraph\(appName = DEFAULT_APP_NAME\): LearningGraph \{\n  const specterMode = process\.env\.SPECTER_MODE \|\| "ghostwiki";\n  if \(specterMode === "ghostwiki"\) \{\n    const demo = getDemoWorkflow\(\);\n    if \(demo\) \{\n      return normalizeGraph\(demo as any\);\n    \}\n  \}',
    new_logic,
    content
)

with open("src/main/session/storage.ts", "w") as f:
    f.write(content)
