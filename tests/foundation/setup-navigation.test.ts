import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  STEP_STORAGE_KEY, SETUP_STEP_IDS, indexForStepId, loadSelectedStep,
  storeSelectedStep, nextSelectedStep,
} from "../../src/features/setup-center/navigation.ts";

function memoryStore() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test("M2.1 step IDs are unique, stable and match the displayed wizard order", async () => {
  const { setupSteps } = await import("../../src/features/setup-center/steps.js");
  assert.equal(SETUP_STEP_IDS.length, 8);
  assert.equal(new Set(SETUP_STEP_IDS).size, 8);
  assert.deepEqual(setupSteps.map(step => step.id), [...SETUP_STEP_IDS]);
});

test("safe resume stores only selected step ID, never full form state", () => {
  const store = memoryStore();
  assert.equal(loadSelectedStep(store), 0);
  assert.equal(storeSelectedStep(store, 5), 5);
  assert.equal(store.values.size, 1);
  assert.equal(store.values.get(STEP_STORAGE_KEY), "oauth");
  assert.equal(loadSelectedStep(store), 5);
  assert.equal(indexForStepId("oauth"), 5);
  assert.equal(indexForStepId("unknown"), -1);
});

test("tampered or malformed browser state falls back to first step", () => {
  const store = memoryStore();
  for (const invalid of ["-1", "8", "", "token-ABC", "{\"token\":\"secret\"}", "constructor"]) {
    store.setItem(STEP_STORAGE_KEY, invalid);
    assert.equal(loadSelectedStep(store), 0);
    assert.equal(store.getItem(STEP_STORAGE_KEY), null);
  }
  assert.equal(indexForStepId(null), -1);
  assert.equal(indexForStepId({ id: "system" }), -1);
});

test("invalid indices and unexpected navigation are rejected", () => {
  const store = memoryStore();
  for (const index of [-1, 8, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => storeSelectedStep(store, index), /Invalid wizard step/);
  }
  assert.equal(nextSelectedStep(0, -1), 0);
  assert.equal(nextSelectedStep(7, 1), 7);
  assert.equal(nextSelectedStep(2, 1), 3);
  assert.equal(nextSelectedStep(2, -1), 1);
  assert.throws(() => nextSelectedStep(8, 1), /Invalid wizard navigation/);
});

test("storage-disabled or restricted browsers do not block safe navigation", () => {
  const blocked = {
    getItem: (_key: string): string | null => { throw new Error("blocked"); },
    setItem: (_key: string, _value: string): void => { throw new Error("blocked"); },
    removeItem: (_key: string): void => { throw new Error("blocked"); },
  };
  assert.equal(loadSelectedStep(blocked), 0);
  assert.equal(storeSelectedStep(blocked, 6), 6);
});

test("owner-paired setup UI resumes step without asserting configuration completion", async () => {
  const page = await fs.readFile("src/app/setup-center/page.js", "utf8");
  const progress = await fs.readFile("src/features/setup-center/progress.ts", "utf8");
  const nav = await fs.readFile("src/features/setup-center/navigation.ts", "utf8");
  assert.match(page, /data\?\.paired === true && !stepRestored/);
  assert.match(page, /loadBrowserSelectedStep\(\)/);
  assert.match(page, /storeBrowserSelectedStep\(index\)/);
  assert.match(page, /nextSelectedStep\(activeStep, -1\)/);
  assert.match(page, /nextSelectedStep\(activeStep, 1\)/);
  assert.match(progress, /verify-in-client/);
  assert.doesNotMatch(nav, /token\s*:\s*|password\s*:\s*|accessJwt|cookieValue/);
  assert.doesNotMatch(page, /localStorage|sessionStorage/);
});
