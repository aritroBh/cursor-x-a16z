import re

# Update src/preload/overlay.ts
with open("src/preload/overlay.ts", "r") as f:
    content = f.read()

ipc_defs = """
  // GhostWiki
  ghostwikiIngestSession: (sessionId: string, appName: string) => ipcRenderer.invoke("ghostwiki:ingest-current-session", sessionId, appName),
  ghostwikiQuery: (query: string, sourceSessionId?: string, feedbackType?: string, feedbackDetails?: string) => ipcRenderer.invoke("ghostwiki:query", query, sourceSessionId, feedbackType, feedbackDetails),
  ghostwikiLint: () => ipcRenderer.invoke("ghostwiki:lint"),
"""

content = re.sub(
    r'(  // Demo\n  prepareControlledDemo: \(\) => ipcRenderer\.invoke\("demo:controlledWorkflow"\),\n)',
    r'\1' + ipc_defs,
    content
)

with open("src/preload/overlay.ts", "w") as f:
    f.write(content)
