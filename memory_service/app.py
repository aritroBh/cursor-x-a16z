import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from .schemas import IngestRequest, IngestResponse, QueryRequest, QueryResponse, LintRequest, LintResponse
from .cognee_adapter import CogneeAdapter
from .wiki_store import WikiStore
from .lint_engine import LintEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="GhostWiki Memory Service")

# Configuration
WIKI_ROOT = os.getenv("GHOSTWIKI_WIKI_ROOT", "./wiki")
COGNEE_ENABLED = os.getenv("COGNEE_ENABLED", "false").lower() == "true"

wiki_store = WikiStore(WIKI_ROOT)
cognee_adapter = CogneeAdapter(enabled=COGNEE_ENABLED)
lint_engine = LintEngine(wiki_store)

@app.get("/health")
def health():
    return {"status": "ok", "cognee_enabled": COGNEE_ENABLED, "wiki_root": WIKI_ROOT}

@app.post("/ingest", response_model=IngestResponse)
async def ingest(request: IngestRequest):
    files_to_ingest = request.files
    if not files_to_ingest:
        # Default to all markdown files in wiki root
        files_to_ingest = wiki_store.list_files()

    if not files_to_ingest:
        return IngestResponse(ok=True, mode="fallback", warnings=["No files found to ingest."], sources_ingested=0)

    success, warnings = await cognee_adapter.ingest(files_to_ingest)

    if success:
        return IngestResponse(ok=True, mode="cognee", warnings=warnings, sources_ingested=len(files_to_ingest))
    else:
        # Fallback mode
        return IngestResponse(ok=True, mode="fallback", warnings=warnings, sources_ingested=len(files_to_ingest))

@app.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    success, answer, sources, warnings = await cognee_adapter.query(request.query)

    if success:
        return QueryResponse(
            ok=True,
            mode="cognee",
            warnings=warnings,
            answer=answer,
            sources=sources
        )
    else:
        # Fallback to local markdown search
        fallback_sources = wiki_store.search_fallback(request.query)
        if fallback_sources:
            return QueryResponse(
                ok=True,
                mode="fallback",
                warnings=warnings + ["Using fallback local search"],
                answer="Found matching wiki pages (Fallback mode).",
                sources=fallback_sources
            )
        else:
            return QueryResponse(
                ok=True,
                mode="fallback",
                warnings=warnings + ["Using fallback local search"],
                answer="No relevant information found in the wiki.",
                sources=[]
            )

@app.post("/lint", response_model=LintResponse)
async def lint(request: LintRequest):
    # Determine the graph path based on wiki root or an env var
    # For demo purposes, we look in the parent of wiki root
    graph_path = os.path.join(os.path.dirname(WIKI_ROOT), "graph.json")

    issues = lint_engine.run_all_rules(graph_path)

    return LintResponse(
        ok=True,
        mode="cognee" if cognee_adapter.enabled and getattr(cognee_adapter, '_cognee', None) else "fallback",
        warnings=[],
        issues=issues
    )

@app.get("/wiki/pages")
def get_wiki_pages():
    files = wiki_store.list_files()
    pages = [{"id": f, "title": os.path.basename(f)} for f in files]
    return {"ok": True, "pages": pages}

@app.get("/wiki/pages/{slug:path}")
def get_wiki_page(slug: str):
    # Construct full path carefully to avoid traversal
    # A simple implementation for the hackathon
    filepath = os.path.join(WIKI_ROOT, slug)
    content = wiki_store.read_file(filepath)
    if content is None:
        raise HTTPException(status_code=404, detail="Page not found")
    return {"ok": True, "content": content}
