import re

with open("src/main/index.ts", "r") as f:
    content = f.read()

ipc_handlers = """
  ipcMain.handle("ghostwiki:ingest-current-session", async (_event, sessionId, appName) => {
    const { compileSessionToWiki } = require("./wiki/workflowCompiler");
    const { writeWikiPage } = require("./wiki/wikiWriter");
    const { loadGraph } = require("./session/storage");
    const graph = loadGraph(appName);
    const session = graph.sessions.find((s: any) => s.id === sessionId);

    if (!session) throw new Error("Session not found");

    const pages = compileSessionToWiki(session, appName);
    const wikiRoot = process.env.GHOSTWIKI_WIKI_ROOT || "./wiki";

    const filepaths: string[] = [];
    for (const page of pages) {
      const path = writeWikiPage(page, wikiRoot);
      if (path) filepaths.push(path);
    }

    const port = process.env.MEMORY_SERVICE_PORT || "8765";
    const res = await fetch(`http://127.0.0.1:${port}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: filepaths })
    });

    return res.json();
  });

  ipcMain.handle("ghostwiki:query", async (_event, queryText, feedbackSourceSessionId, feedbackType, feedbackDetails) => {
    const port = process.env.MEMORY_SERVICE_PORT || "8765";

    if (feedbackType && feedbackDetails && feedbackSourceSessionId) {
      // It's a feedback loop
      const { compileCorrectionToWiki } = require("./wiki/workflowCompiler");
      const { writeWikiPage } = require("./wiki/wikiWriter");
      const page = compileCorrectionToWiki(feedbackSourceSessionId, feedbackType, feedbackDetails);
      const wikiRoot = process.env.GHOSTWIKI_WIKI_ROOT || "./wiki";
      const filepath = writeWikiPage(page, wikiRoot);

      // Re-ingest
      if (filepath) {
        await fetch(`http://127.0.0.1:${port}/ingest`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ files: [filepath] })
        });
      }
    }

    // Normal query
    const res = await fetch(`http://127.0.0.1:${port}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: queryText })
    });

    return res.json();
  });

  ipcMain.handle("ghostwiki:lint", async () => {
    const port = process.env.MEMORY_SERVICE_PORT || "8765";
    const res = await fetch(`http://127.0.0.1:${port}/lint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    return res.json();
  });
"""

# Insert before registerReplayIpc
content = re.sub(
    r'(  registerReplayIpc\(ipcMain, \(\) => overlayWindow\);)',
    ipc_handlers + r'\n\1',
    content
)

with open("src/main/index.ts", "w") as f:
    f.write(content)
