import re

with open("src/renderer/overlay/ModeToggle.tsx", "r") as f:
    content = f.read()

content = content.replace('"silent" | "ultra"', '"silent" | "ultra" | "ghostwiki"')

ghostwiki_btn = """
      <button
        onClick={() => onChange("ghostwiki")}
        style={{
          padding: "6px 16px",
          borderRadius: "20px",
          border: "none",
          background: mode === "ghostwiki" ? "#fff" : "transparent",
          color: mode === "ghostwiki" ? "#000" : "#fff",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.2s",
        }}
      >
        GhostWiki
      </button>
"""

content = re.sub(r'(      </button>\n    </div>)', ghostwiki_btn + r'\1', content)

with open("src/renderer/overlay/ModeToggle.tsx", "w") as f:
    f.write(content)
