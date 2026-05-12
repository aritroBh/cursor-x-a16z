import { resolveTarget } from "../src/main/automation/targetResolver";

function runTests() {
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`PASS: ${msg}`);
    } else {
      console.error(`FAIL: ${msg}`);
    }
  }

  const res1 = resolveTarget(
    {},
    {
      hasDOM: true,
      domSelector: "#btn",
      axTarget: { bbox: {} },
      vlmTarget: {},
    },
  );
  assert(res1.source === "playwright", "Playwright priority 1");

  const res2 = resolveTarget(
    {},
    { axTarget: { isOpenAra: true, bbox: {} }, vlmTarget: {} },
  );
  assert(res2.source === "openara", "Openara priority 2");

  const res3 = resolveTarget({}, { axTarget: { bbox: {} }, vlmTarget: {} });
  assert(res3.source === "ax", "AX priority 3");

  const res4 = resolveTarget({}, { vlmTarget: { confidence: 0.8 } });
  assert(res4.source === "vision", "Vision priority 4");
  assert(
    res4.requiresConfirmation === false,
    "High conf vision does not require confirmation",
  );

  const res5 = resolveTarget({}, { vlmTarget: { confidence: 0.5 } });
  assert(
    res5.source === "vision" && res5.requiresConfirmation === true,
    "Low conf vision requires confirmation",
  );

  const res6 = resolveTarget({}, {});
  assert(
    res6.source === "manual" && res6.requiresConfirmation === true,
    "Manual fallback",
  );

  console.log(`${passed}/${total} targetResolver tests passed`);
  if (passed !== total) process.exit(1);
}

runTests();
