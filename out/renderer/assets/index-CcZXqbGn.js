import { j as jsxRuntimeExports, C as Card, a as CardHeader, b as CardTitle, B as Badge, c as CardDescription, d as CardContent, e as Button, f as client, R as React } from "./index-JzZ3c-AV.js";
function App() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-screen items-center justify-center bg-zinc-950 text-zinc-100 p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "w-full max-w-md", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardTitle, { children: "Specter" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "secondary", children: "v1.0.0" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { children: "Electron + Vite + React + Tailwind + shadcn/ui" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(CardContent, { className: "flex gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { children: "Default" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", children: "Outline" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "secondary", children: "Secondary" })
    ] })
  ] }) });
}
client.createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(React.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(App, {}) })
);
