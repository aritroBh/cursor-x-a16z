import { c as client, j as jsxRuntimeExports, R as React } from "./client-CciThgMB.js";
const DemoApp = () => {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [templateSelected, setTemplateSelected] = React.useState(false);
  const [projectName, setProjectName] = React.useState("");
  const [created, setCreated] = React.useState(false);
  const reset = () => {
    setSettingsOpen(false);
    setTemplateSelected(false);
    setProjectName("");
    setCreated(false);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "main-window", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "demo-stage", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "demo-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "demo-eyebrow", children: "Practice Workspace" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { children: "Project Setup" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Use Specter to follow a small, predictable software flow." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        className: `demo-target demo-button-one ${settingsOpen ? "is-done" : ""}`,
        onClick: () => setSettingsOpen(true),
        children: settingsOpen ? "Settings Opened" : "Open Settings"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        className: `demo-target demo-button-two ${templateSelected ? "is-done" : ""}`,
        onClick: () => setTemplateSelected(true),
        children: templateSelected ? "Template Chosen" : "Choose Template"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        className: "demo-target demo-input",
        value: projectName,
        onChange: (event) => setProjectName(event.target.value),
        placeholder: "Project name",
        "aria-label": "Project name"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        className: `demo-target demo-confirm ${created ? "is-done" : ""}`,
        onClick: () => setCreated(true),
        children: created ? "Created" : "Create"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "demo-status", "aria-live": "polite", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: settingsOpen ? "is-done" : "", children: "1" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: templateSelected ? "is-done" : "", children: "2" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: projectName.trim() ? "is-done" : "", children: "3" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: created ? "is-done" : "", children: "4" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "demo-reset", onClick: reset, children: "Reset" })
  ] }) });
};
client.createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(React.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(DemoApp, {}) })
);
