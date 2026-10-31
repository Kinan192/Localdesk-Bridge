/**
 * M2.1: Persist ONLY the selected wizard step, never configuration state,
 * credentials, Access JWTs, pairing tickets, or verified-completion flags.
 * Actual step completion continues to be derived from owner-protected APIs.
 */
export const STEP_STORAGE_KEY = "localdesk.setup.active-step.v1";

export const SETUP_STEP_IDS = [
  "system",
  "folders",
  "credentials",
  "cloudflare",
  "mcp",
  "oauth",
  "services",
  "clients",
] as const;

export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

type StepStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function indexForStepId(value: unknown): number {
  return typeof value === "string"
    ? SETUP_STEP_IDS.findIndex(id => id === value)
    : -1;
}

/** A broken or malicious value must not become application state. */
export function loadSelectedStep(store: StepStore): number {
  try {
    const value = store.getItem(STEP_STORAGE_KEY);
    const index = indexForStepId(value);
    if (value !== null && index === -1) store.removeItem(STEP_STORAGE_KEY);
    return index === -1 ? 0 : index;
  } catch {
    // Private/locked-down browsers can reject storage access.
    return 0;
  }
}

/** Clamp/validate the step and save its ID only (no provider state). */
export function storeSelectedStep(store: StepStore, index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= SETUP_STEP_IDS.length) {
    throw new Error("Invalid wizard step.");
  }
  try {
    store.setItem(STEP_STORAGE_KEY, SETUP_STEP_IDS[index]);
  } catch { /* Navigation remains functional when browser storage is disabled. */ }
  return index;
}

/** Call only from an owner-paired browser; this is UX state, not authorization. */
export function loadBrowserSelectedStep(): number {
  if (typeof window === "undefined") return 0;
  try { return loadSelectedStep(window.localStorage); }
  catch { return 0; }
}

export function storeBrowserSelectedStep(index: number): number {
  if (typeof window === "undefined") return 0;
  try { return storeSelectedStep(window.localStorage, index); }
  catch { return index; }
}

export function nextSelectedStep(current: number, direction: -1 | 1): number {
  if (!Number.isInteger(current) || current < 0 ||
      current >= SETUP_STEP_IDS.length || (direction !== -1 && direction !== 1)) {
    throw new Error("Invalid wizard navigation.");
  }
  return Math.max(0, Math.min(SETUP_STEP_IDS.length - 1, current + direction));
}
