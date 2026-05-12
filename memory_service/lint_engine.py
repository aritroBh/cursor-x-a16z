import os
import json
from .schemas import LintIssue
from .wiki_store import WikiStore

class LintEngine:
    def __init__(self, wiki_store: WikiStore):
        self.wiki_store = wiki_store

    def run_all_rules(self, graph_path: str = None) -> list[LintIssue]:
        issues = []
        issues.extend(self.check_synthetic_data(graph_path))
        # Additional rules can be added here
        return issues

    def check_synthetic_data(self, graph_path: str) -> list[LintIssue]:
        issues = []
        if not graph_path or not os.path.exists(graph_path):
            return issues

        try:
            with open(graph_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # If it's a demo workflow graph, it must have synthetic: true
            # Either at the root or within sessions
            is_synthetic = data.get("synthetic", False)
            if not is_synthetic:
                issues.append(LintIssue(
                    rule="synthetic-data-label",
                    message="Demo workflow graph is missing 'synthetic: true' label.",
                    file=graph_path
                ))
        except Exception as e:
            issues.append(LintIssue(
                rule="lint-error",
                message=f"Failed to parse graph for linting: {e}",
                file=graph_path
            ))

        return issues
