import re

with open("src/renderer/src/OverlayApp.tsx", "r") as f:
    content = f.read()

import_panel = """
import { GhostWikiPanel } from "../overlay/GhostWikiPanel";
"""

content = re.sub(r'(import \{ SessionPanel \} from "\.\./overlay/SessionPanel";)', r'\1\n' + import_panel, content)

specterModeTypes = """type SpecterMode = "silent" | "ultra" | "ghostwiki";"""
content = re.sub(r'type SpecterMode = "silent" \| "ultra";', specterModeTypes, content)

panel_usage = """
              {mode === "ghostwiki" && <GhostWikiPanel />}
"""

content = re.sub(r'(              \{lastNodeId && !showWorkflowCard && \()', panel_usage + r'\n\1', content)

with open("src/renderer/src/OverlayApp.tsx", "w") as f:
    f.write(content)
