import { app } from "electron";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { clipboard as nutClipboard, keyboard, Key } from "@nut-tree-fork/nut-js";

import { captureScreenBase64 } from "../capture";
import { clickRealMouse } from "../cursor";
import { safeLog, safeWarn } from "../logger";
import { analyzeVision, type VisionElement } from "../vision";

interface NoteRowTarget {
  id: string;
  label: string;
  x: number;
  y: number;
  confidence: number;
  source: "vision" | "layout-fallback";
}

interface CapturedNote {
  id: string;
  title: string;
  text: string;
}

export interface NoteHtmlAgentResult {
  htmlPath: string;
  rawNotePaths: string[];
  noteCount: number;
  noteSummaries: Array<{
    title: string;
    characterCount: number;
  }>;
}

const NOTE_HTML_AGENT_PROMPT = `The user wants the desktop agent to operate Epic Hyperspace Notes.
Find the four visible note rows under the December 2049 heading in the left Notes list.
The expected rows are:
1. Walt Whitecoat / H&P / Addendum
2. Jim Urgent / ED Provider Note
3. Deb Gurney / ED Triage Note
4. Colon Oscopy / Gastroenterology / Consult
Return targetable elements for those note rows only. Do not target the right Sidebar Summary, orders, meds, or index links.
The agent will click each note row, focus the note content pane, copy the full note text, and generate one local HTML file.`;

const EXPECTED_ROWS = [
  {
    id: "walt-whitecoat-hp-addendum",
    label: "Walt Whitecoat H&P Addendum",
    pattern: /\b(walt|whitecoat|h&p|addendum)\b/i,
    fallback: { x: 31.5, y: 44.8 },
  },
  {
    id: "jim-urgent-ed-provider-note",
    label: "Jim Urgent ED Provider Note",
    pattern: /\b(jim|urgent|provider)\b/i,
    fallback: { x: 31.5, y: 51.0 },
  },
  {
    id: "deb-gurney-ed-triage-note",
    label: "Deb Gurney ED Triage Note",
    pattern: /\b(deb|gurney|triage)\b/i,
    fallback: { x: 31.5, y: 57.0 },
  },
  {
    id: "colon-oscopy-consult",
    label: "Colon Oscopy Gastroenterology Consult",
    pattern: /\b(colon|oscopy|gastroenterology|consult)\b/i,
    fallback: { x: 31.5, y: 63.0 },
  },
];

const NOTE_CONTENT_FOCUS_POINTS = [
  { x: 56.0, y: 66.0 },
  { x: 57.5, y: 53.0 },
  { x: 59.0, y: 78.0 },
];

const OPENED_NOTE_FOCUS_POINTS = [
  { x: 58.0, y: 55.0 },
  { x: 50.0, y: 50.0 },
  { x: 64.0, y: 66.0 },
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function elementText(element: VisionElement): string {
  return [element.label, element.text, element.reasoning]
    .filter(Boolean)
    .join(" ");
}

function elementCenter(element: VisionElement): { x: number; y: number } {
  if (element.center) return element.center;
  if (element.bbox) {
    return {
      x: element.bbox.x + element.bbox.width / 2,
      y: element.bbox.y + element.bbox.height / 2,
    };
  }
  return { x: 0, y: 0 };
}

function elementToTarget(
  id: string,
  fallbackLabel: string,
  element: VisionElement,
  width: number,
  height: number,
): NoteRowTarget {
  const center = elementCenter(element);
  return {
    id,
    label: element.label || fallbackLabel,
    x: clampPercent((center.x / Math.max(1, width)) * 100),
    y: clampPercent((center.y / Math.max(1, height)) * 100),
    confidence: element.confidence ?? 0.5,
    source: "vision",
  };
}

function isLikelyNoteListElement(
  element: VisionElement,
  width: number,
  height: number,
): boolean {
  const center = elementCenter(element);
  const x = (center.x / Math.max(1, width)) * 100;
  const y = (center.y / Math.max(1, height)) * 100;
  const text = elementText(element).toLowerCase();
  const inNoteList = x >= 15 && x <= 52 && y >= 36 && y <= 76;
  const excludesSidebar =
    /\b(order|orders|meds|sidebar|index|diet|zofran|current meds)\b/i.test(
      text,
    );
  return inNoteList && !excludesSidebar;
}

async function locateNoteRows(intent: string): Promise<NoteRowTarget[]> {
  const screenshot = await captureScreenBase64();
  const result = await analyzeVision({
    imageBase64: screenshot.base64,
    mimeType: "image/png",
    task: "target_detection",
    userPrompt: intent,
    appContext: NOTE_HTML_AGENT_PROMPT,
    screenshotWidth: screenshot.width,
    screenshotHeight: screenshot.height,
  });

  const candidates = result.elements.filter((element) =>
    isLikelyNoteListElement(element, screenshot.width, screenshot.height),
  );
  const visibleContext = [result.summary, ...result.elements.map(elementText)]
    .join(" ")
    .toLowerCase();
  const appearsToBeEpicNotes =
    /\b(epic|hyperspace|notes|whitecoat|urgent|gurney|oscopy)\b/i.test(
      visibleContext,
    );
  const rows = EXPECTED_ROWS.map((expected) => {
    const match = candidates
      .filter((element) => expected.pattern.test(elementText(element)))
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];

    if (match) {
      return elementToTarget(
        expected.id,
        expected.label,
        match,
        screenshot.width,
        screenshot.height,
      );
    }

    safeWarn("[NOTE_HTML_AGENT] using row layout fallback", {
      row: expected.label,
    });
    return {
      id: expected.id,
      label: expected.label,
      x: expected.fallback.x,
      y: expected.fallback.y,
      confidence: 0.35,
      source: "layout-fallback" as const,
    };
  });

  if (
    !appearsToBeEpicNotes &&
    rows.every((row) => row.source === "layout-fallback")
  ) {
    throw new Error(
      "Specter could not verify that Epic Notes is visible, so it stopped before clicking.",
    );
  }

  safeLog("[NOTE_HTML_AGENT] located note rows", {
    rows: rows.map((row) => ({
      id: row.id,
      label: row.label,
      x: row.x,
      y: row.y,
      confidence: row.confidence,
      source: row.source,
    })),
  });

  return rows;
}

async function chord(...keys: Key[]): Promise<void> {
  await keyboard.pressKey(...keys);
  await delay(80);
  await keyboard.releaseKey(...[...keys].reverse());
}

async function tap(key: Key): Promise<void> {
  await keyboard.pressKey(key);
  await delay(50);
  await keyboard.releaseKey(key);
}

function normalizeCopiedText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function looksLikeCopiedNote(text: string): boolean {
  if (text.length < 80) return false;
  if (/Generate HTML from notes|New chat|Plugins|Codex/i.test(text)) {
    return false;
  }
  return /Date of Service|HPI|Chief Complaint|Triage|Consult|Order Information|Revision History|Assessment\/Plan/i.test(
    text,
  );
}

async function copyFromFocusedPane(
  focusPoint: { x: number; y: number },
): Promise<string> {
  await nutClipboard.setContent("");
  await clickRealMouse(focusPoint.x, focusPoint.y, 180);
  await delay(140);
  await chord(Key.LeftControl, Key.A);
  await delay(120);
  await chord(Key.LeftControl, Key.C);
  await delay(500);
  return normalizeCopiedText(await nutClipboard.getContent());
}

async function tryCopyFromPoints(
  points: Array<{ x: number; y: number }>,
): Promise<string> {
  for (const point of points) {
    const text = await copyFromFocusedPane(point);
    if (looksLikeCopiedNote(text)) return text;
  }
  return "";
}

async function openRow(row: NoteRowTarget): Promise<void> {
  await clickRealMouse(row.x, row.y, 220);
  await delay(140);
  await clickRealMouse(row.x, row.y, 220);
  await delay(900);
}

async function selectRow(row: NoteRowTarget): Promise<void> {
  await clickRealMouse(row.x, row.y, 240);
  await delay(900);
}

async function copyNote(row: NoteRowTarget): Promise<CapturedNote> {
  safeLog("[NOTE_HTML_AGENT] copying note row", {
    id: row.id,
    label: row.label,
    source: row.source,
  });

  await selectRow(row);
  let text = await tryCopyFromPoints(NOTE_CONTENT_FOCUS_POINTS);

  if (!text) {
    safeWarn("[NOTE_HTML_AGENT] preview copy failed; retrying after opening", {
      id: row.id,
      label: row.label,
    });
    await openRow(row);
    text = await tryCopyFromPoints(OPENED_NOTE_FOCUS_POINTS);
    await tap(Key.Escape);
    await delay(350);
  }

  if (!text) {
    throw new Error(`Could not copy note text for ${row.label}.`);
  }

  return {
    id: row.id,
    title: titleFromNote(text, row.label),
    text,
  };
}

function titleFromNote(text: string, fallback: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return fallback;

  const author = lines[0];
  const noteType =
    lines.find((line) =>
      /H&P|ED Provider|ED Triage|Consult|Order Information|Addendum|Signed/i.test(
        line,
      ),
    ) || "";
  return noteType && noteType !== author ? `${author} - ${noteType}` : author;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlForNotes(notes: CapturedNote[]): string {
  const nav = notes
    .map(
      (note, index) =>
        `<a href="#note-${index + 1}">${escapeHtml(note.title)}</a>`,
    )
    .join("");
  const sections = notes
    .map(
      (note, index) => `
      <article class="note" id="note-${index + 1}">
        <header>
          <p class="eyebrow">Note ${index + 1}</p>
          <h2>${escapeHtml(note.title)}</h2>
        </header>
        <pre>${escapeHtml(note.text)}</pre>
      </article>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Patient Notes Compilation</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #16202a;
      --muted: #5e6b77;
      --line: #d9e0e6;
      --surface: #f6f8fa;
      --accent: #006d91;
      --accent-soft: #e3f4f8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--ink);
      background: white;
      line-height: 1.45;
    }
    header.hero {
      padding: 32px 40px 20px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(180deg, #ffffff 0%, var(--surface) 100%);
    }
    h1 {
      margin: 0 0 8px;
      font-size: clamp(28px, 4vw, 44px);
      font-weight: 700;
      letter-spacing: 0;
    }
    .meta { margin: 0; color: var(--muted); font-size: 15px; }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 16px 40px;
      border-bottom: 1px solid var(--line);
      background: #fff;
      position: sticky;
      top: 0;
      z-index: 2;
    }
    nav a {
      color: var(--accent);
      background: var(--accent-soft);
      border: 1px solid #bbdfe8;
      border-radius: 6px;
      padding: 7px 10px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
    }
    main { max-width: 1120px; margin: 0 auto; padding: 24px 28px 56px; }
    article.note {
      border-top: 3px solid var(--accent);
      margin: 0 0 32px;
      padding-top: 18px;
    }
    .eyebrow {
      margin: 0 0 4px;
      color: var(--accent);
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    h2 { margin: 0 0 12px; font-size: 24px; letter-spacing: 0; }
    pre {
      margin: 0;
      padding: 18px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--surface);
      font-family: "Courier New", Courier, monospace;
      font-size: 14px;
      line-height: 1.45;
    }
    @media print {
      nav { position: static; }
      pre { background: white; }
    }
  </style>
</head>
<body>
  <header class="hero">
    <h1>Patient Notes Compilation</h1>
    <p class="meta">Compiled locally by Specter from four Epic notes.</p>
  </header>
  <nav aria-label="Notes index">${nav}</nav>
  <main>${sections}</main>
</body>
</html>
`;
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function writeNotesHtml(notes: CapturedNote[]): Promise<{
  htmlPath: string;
  rawNotePaths: string[];
}> {
  const outputDir = join(app.getPath("documents"), "Specter", "Generated Notes");
  const rawDir = join(outputDir, `raw-${timestampSlug()}`);
  await mkdir(rawDir, { recursive: true });

  const rawNotePaths: string[] = [];
  for (const [index, note] of notes.entries()) {
    const rawPath = join(rawDir, `${index + 1}-${note.id}.txt`);
    await writeFile(rawPath, note.text, "utf8");
    rawNotePaths.push(rawPath);
  }

  const htmlPath = join(outputDir, `patient-notes-${timestampSlug()}.html`);
  await writeFile(htmlPath, htmlForNotes(notes), "utf8");
  return { htmlPath, rawNotePaths };
}

export async function compileEpicNotesToHtml(
  intent: string,
): Promise<NoteHtmlAgentResult> {
  const previousClipboard = await nutClipboard.getContent().catch(() => "");
  const rows = await locateNoteRows(intent);
  const notes: CapturedNote[] = [];

  try {
    for (const row of rows) {
      notes.push(await copyNote(row));
    }
  } finally {
    await nutClipboard.setContent(previousClipboard).catch(() => undefined);
  }

  if (notes.length !== EXPECTED_ROWS.length) {
    throw new Error(
      `Expected ${EXPECTED_ROWS.length} notes, but captured ${notes.length}.`,
    );
  }

  const output = await writeNotesHtml(notes);
  safeLog("[NOTE_HTML_AGENT] generated HTML", {
    htmlPath: output.htmlPath,
    noteCount: notes.length,
    noteCharacterCounts: notes.map((note) => note.text.length),
  });

  return {
    ...output,
    noteCount: notes.length,
    noteSummaries: notes.map((note) => ({
      title: note.title,
      characterCount: note.text.length,
    })),
  };
}
