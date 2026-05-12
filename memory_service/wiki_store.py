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

    def _tokenize(self, text: str) -> set:
        import re
        stopwords = {"a", "an", "the", "and", "or", "but", "how", "do", "does", "did", "i", "me", "my", "we", "you", "from", "this", "that", "to", "of", "in", "on", "for", "with", "is", "are", "be"}
        tokens = re.split(r'[^a-zA-Z0-9]', text.lower())
        valid_tokens = set()
        for t in tokens:
            if not t:
                continue
            if t in stopwords:
                continue
            if len(t) <= 2 and not t.isdigit():
                continue
            valid_tokens.add(t)
        return valid_tokens

    def search_fallback(self, query: str, top_k: int = 3, threshold: float = 0.1):
        import re
        results = []
        files = self.list_files()

        query_tokens = self._tokenize(query)
        if not query_tokens:
            return []

        for f in files:
            content = self.read_file(f)
            if not content:
                continue

            slug = os.path.basename(f)
            title = slug
            first_line = content.split('\n')[0].strip()
            if first_line.startswith('# '):
                title = first_line[2:]

            # Extract headings
            headings = "\n".join(re.findall(r'^#+\s+(.*)$', content, re.MULTILINE))

            slug_tokens = self._tokenize(slug)
            title_tokens = self._tokenize(title)
            heading_tokens = self._tokenize(headings)
            body_tokens = self._tokenize(content)

            score = 0.0
            for qt in query_tokens:
                if qt in title_tokens:
                    score += 5.0
                elif qt in heading_tokens:
                    score += 3.0
                elif qt in body_tokens or qt in slug_tokens:
                    score += 1.0

            if score >= threshold:
                results.append({
                    "id": f,
                    "title": title,
                    "content": content[:500] + "..." if len(content) > 500 else content,
                    "score": score
                })

        # Sort by score descending
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]
