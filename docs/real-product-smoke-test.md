# Specter — Real-Product Smoke Test

This document is the **pre-demo / pre-ship smoke test** for the real-app ghost tutor loop.
Run all tests before every demo. The controlled demo is a fallback — if all tests below pass, the product is real.

---

## Setup checklist

- [ ] `.env` has `ANTHROPIC_API_KEY` (not a placeholder)
- [ ] `.env` has `OPENAI_API_KEY` (for Whisper; TTS quota may be exhausted)
- [ ] macOS Screen Recording permission granted (System Settings → Privacy → Screen Recording)
- [ ] macOS Accessibility permission granted (for cursor tracking)
- [ ] Run `npm run dev` — overlay at `http://localhost:5173/overlay.html`
- [ ] Double-shift triggers the overlay (check uIOhook is running)

---

## Test 1: Chrome — Address Bar

**Setup:** Open Google Chrome. Navigate to any page.

**Steps:**
1. Double-shift → Specter appears.
2. Type: `teach me how to click the address bar`
3. Press Enter.
4. Wait for AI vision to analyze the screen.

**Pass criteria:**
- Ghost cursor appears over or near the Chrome address bar.
- Status text at bottom says e.g. `Step 1/1: Click address bar`.
- Moving your real cursor toward the target reveals the overlay.
- Clicking the target (or pressing Space) advances / completes the step.

**Fallback path (if AI vision fails):**
- Workflow card shows: *"I couldn't confidently detect the target. Pick it manually or use Practice Mode."*
- Click **Pick manually** → crosshair cursor appears.
- Click the Chrome address bar.
- Click **Start ghost** → ghost cursor guides to your chosen point.
- ✅ This still proves the product — ghost over real Chrome.

---

## Test 2: Google Slides or Figma — Add Text

**Setup:** Open Google Slides or Figma with a document open.

**Steps:**
1. Double-shift → Specter appears.
2. Type: `teach me how to add text`
3. Press Enter.

**Pass criteria:**
- Ghost cursor guides toward a text tool or text box.
- OR: Fallback path works (manual pick → ghost).

---

## Test 3: Blender — Open Add Menu

**Setup:** Open Blender with the default scene.

**Steps:**
1. Double-shift → Specter appears.
2. Type: `teach me how to open the Add menu`
3. Press Enter.

**Important:** Keep the task small. Do NOT type "teach me Blender" — too broad for one step.

**Pass criteria:**
- Ghost cursor points toward the Blender header bar (where Add menu lives).
- OR: Fallback path works.

---

## Test 4: Finder — New Folder

**Setup:** Open a Finder window.

**Steps:**
1. Double-shift → Specter appears.
2. Type: `teach me how to create a new folder`
3. Press Enter.

**Pass criteria:**
- Ghost cursor guides toward File menu or right-click zone.
- OR: Fallback path works.

---

## Test 5: Manual Target Fallback (first-class path)

This test verifies that manual picking is a real product path, not just a debug escape hatch.

**Setup:** Any app open.

**Steps:**
1. Double-shift → Specter appears.
2. Type anything → wait for vision result.
3. If vision returned targets: click **Pick manually** from the action row.
4. If vision failed: the fallback card already shows **Pick manually** as the first button — click it.
5. Overlay says: *"Click the thing you want Specter to teach. Press Escape to cancel."*
6. Click any visible element in the real app.
7. Click **Start ghost**.

**Pass criteria:**
- Ghost cursor loops over your manually chosen point.
- Crosshair picks exactly where you clicked.
- Ghost works over any real app (not just the controlled demo window).

---

## Test 6: Ultra Conversation — Follow-up Questions

**Setup:** Any real-app walkthrough is running (ghost cursor is active).

**Steps:**
1. With Specter in **Ultra mode** (toggle in the HUD), start any walkthrough from Test 1–4.
2. While ghost cursor is guiding: type in the input bar: `why this button?`
3. Press Enter.

**Pass criteria:**
- Ultra reply bubble shows a tutor-style answer explaining the target.
- Specter does NOT restart a new screen scan.
- If voice is active, it reads the reply.
- If voice fallback is macOS only, the bubble shows: *"🔇 Voice fallback active · Text tutoring still works"*
- After the reply, Ultra returns to `Ready` state and accepts another question.

**Additional questions to test:**
- `what should I do next?`
- `repeat that`
- `explain this more`

---

## Test 7: Voice Fallback Behavior

**Setup:** ElevenLabs 402 and/or OpenAI TTS 429 are active (no billing).

**Steps:**
1. Switch to **Ultra mode**.
2. Start a walkthrough from any real-app test above.
3. Ghost cursor starts → Ultra speaks a prompt.
4. Check the UltraReplyBubble.

**Pass criteria:**
- If TTS falls to macOS `say`: the orange pill *"🔇 Voice fallback active · Text tutoring still works"* appears in the reply bubble.
- The walkthrough continues normally.
- Ultra still accepts typed follow-up questions.
- Voice does NOT silently fail and leave the state stuck — macOS `say` completes and Ultra returns to `Ready`.

---

## Test 8: Debug Provider Status Pills

**Steps:**
1. Double-shift → Specter appears.
2. Click **⚙️ Debug** in the HUD.
3. Click **Check Voice Backend** button.

**Pass criteria:**
- Three pills appear in the debug panel:
  - `Claude vision: ready` (green) OR `Claude vision: <error>` (red)
  - `Whisper: ready` (green) OR `Whisper: missing key` (red)
  - `Voice: ElevenLabs` / `OpenAI TTS` / `macOS fallback` (green if natural voice available, red if not)
- Raw health text also appears below.

---

## Summary: What "real product" means

| Test | Ghost over real app | Manual fallback works | Ultra text works |
|---|---|---|---|
| Chrome | ✅ | ✅ | ✅ |
| Slides/Figma | ✅ | ✅ | ✅ |
| Blender | ✅ | ✅ | ✅ |
| Finder | ✅ | ✅ | ✅ |

**Voice is provider-dependent.** Natural voice works when billing/quotas are resolved.
**The ghost tutor works on any app regardless of voice provider.**
