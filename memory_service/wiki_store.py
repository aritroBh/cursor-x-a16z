import os
import glob

class WikiStore:
    def __init__(self, root_dir: str):
        self.root_dir = root_dir
        if not os.path.exists(root_dir):
            os.makedirs(root_dir, exist_ok=True)

    def list_files(self):
        pattern = os.path.join(self.root_dir, "**", "*.md")
        return glob.glob(pattern, recursive=True)

    def read_file(self, filepath: str):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception:
            return None

    def search_fallback(self, query: str):
        results = []
        files = self.list_files()
        query_lower = query.lower()
        for f in files:
            content = self.read_file(f)
            if content and query_lower in content.lower():
                # Extract a title roughly from the first line or filename
                title = os.path.basename(f)
                first_line = content.split('\n')[0].strip()
                if first_line.startswith('# '):
                    title = first_line[2:]
                results.append({
                    "id": f,
                    "title": title,
                    "content": content[:500] + "..." if len(content) > 500 else content,
                    "score": 1.0
                })
        return results
