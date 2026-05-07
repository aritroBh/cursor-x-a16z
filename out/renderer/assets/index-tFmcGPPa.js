import { c as client, j as jsxRuntimeExports, R as React } from "./client-CciThgMB.js";
const DemoApp = () => {
  const [buttonOneDone, setButtonOneDone] = React.useState(false);
  const [buttonTwoDone, setButtonTwoDone] = React.useState(false);
  const [text, setText] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const reset = () => {
    setButtonOneDone(false);
    setButtonTwoDone(false);
    setText("");
    setConfirmed(false);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "main-window", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "demo-stage", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "demo-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { children: "Specter" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Controlled demo target" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        className: `demo-target demo-button-one ${buttonOneDone ? "is-done" : ""}`,
        onClick: () => setButtonOneDone(true),
        children: buttonOneDone ? "Button 1 done" : "Button 1"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        className: `demo-target demo-button-two ${buttonTwoDone ? "is-done" : ""}`,
        onClick: () => setButtonTwoDone(true),
        children: buttonTwoDone ? "Button 2 done" : "Button 2"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        className: "demo-target demo-input",
        value: text,
        onChange: (event) => setText(event.target.value),
        placeholder: "Text input",
        "aria-label": "Text input"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        className: `demo-target demo-confirm ${confirmed ? "is-done" : ""}`,
        onClick: () => setConfirmed(true),
        children: confirmed ? "Confirmed" : "Confirm"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "demo-status", "aria-live": "polite", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: buttonOneDone ? "is-done" : "", children: "1" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: buttonTwoDone ? "is-done" : "", children: "2" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: text.trim() ? "is-done" : "", children: "3" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: confirmed ? "is-done" : "", children: "4" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "demo-reset", onClick: reset, children: "Reset" })
  ] }) });
};
client.createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(React.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(DemoApp, {}) })
);
