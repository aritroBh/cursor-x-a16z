import React from "react";

interface ModeToggleProps {
  mode: "silent" | "ultra" | "ghostwiki";
  onChange: (mode: "silent" | "ultra" | "ghostwiki") => void;
}

export const ModeToggle: React.FC<ModeToggleProps> = ({ mode, onChange }) => {
  return (
    <div
      className="mode-toggle"
      style={{
        display: "flex",
        background: "rgba(0, 0, 0, 0.2)",
        padding: "4px",
        borderRadius: "24px",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <button
        onClick={() => onChange("silent")}
        style={{
          padding: "6px 16px",
          borderRadius: "20px",
          border: "none",
          background: mode === "silent" ? "#fff" : "transparent",
          color: mode === "silent" ? "#000" : "#fff",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.2s",
        }}
      >
        Silent
      </button>
      <button
        onClick={() => onChange("ultra")}
        style={{
          padding: "6px 16px",
          borderRadius: "20px",
          border: "none",
          background: mode === "ultra" ? "#fff" : "transparent",
          color: mode === "ultra" ? "#000" : "#fff",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.2s",
        }}
      >
        Ultra
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
      </button>
    </div>
  );
};
