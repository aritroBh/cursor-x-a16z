import pytest
import tempfile
import os
import json
from memory_service.lint_engine import LintEngine
from memory_service.wiki_store import WikiStore

def test_synthetic_label_enforcement():
    with tempfile.TemporaryDirectory() as tmpdir:
        wiki_store = WikiStore(tmpdir)
        engine = LintEngine(wiki_store)

        # Test 1: missing graph
        issues = engine.run_all_rules(graph_path=None)
        assert len(issues) == 0 # no graph, no problem (or could be an issue, but we designed it to return empty)

        # Test 2: graph without synthetic flag
        graph_path_no_label = os.path.join(tmpdir, "graph_no_label.json")
        with open(graph_path_no_label, "w") as f:
            json.dump({"some": "data"}, f)

        issues = engine.run_all_rules(graph_path=graph_path_no_label)
        assert len(issues) == 1
        assert issues[0].rule == "synthetic-data-label"

        # Test 3: graph with synthetic flag
        graph_path_with_label = os.path.join(tmpdir, "graph_with_label.json")
        with open(graph_path_with_label, "w") as f:
            json.dump({"synthetic": True}, f)

        issues = engine.run_all_rules(graph_path=graph_path_with_label)
        assert len(issues) == 0
