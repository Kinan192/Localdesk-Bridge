import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  OnboardingRepository, OnboardingSchema, OnboardingPatch, defaultOnboarding,
} from "../../src/server/onboarding/index.ts";

test("First-run setup starts unfinished and persists only guided progress", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-onboarding-"));
  try {
    const repository = new OnboardingRepository(folder);
    assert.deepEqual(await repository.load(), defaultOnboarding());
    assert.equal(defaultOnboarding().mode, "new", "Fresh installations must prioritize remote Web MCP");
    const selection = await repository.patch({ step: 2, mode: "existing" });
    assert.deepEqual(selection, { version: 1, step: 2, mode: "existing", dismissed: false });
    const localChoice = await repository.patch({ mode: "local" });
    assert.equal(localChoice.mode, "local");
    const restoredChoice = await repository.patch({ mode: "existing" });
    assert.equal(restoredChoice.mode, "existing");
    const stopped = await repository.patch({ dismissed: true });
    assert.equal(stopped.dismissed, true);
    assert.equal((await new OnboardingRepository(folder).load()).mode, "existing");
    assert.equal((await new OnboardingRepository(folder).load()).step, 2);
    const text = await fs.readFile(path.join(folder, "onboarding.json"), "utf8");
    assert.equal(text.includes("token"), false);
    assert.equal(text.includes("secret"), false);
    if (process.platform !== "win32") {
      const stat = await fs.stat(path.join(folder, "onboarding.json"));
      assert.equal(stat.mode & 0o077, 0);
    }
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test("First-run setup rejects unknown fields, secrets, or invalid progress without mutation", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-onboarding-reject-"));
  try {
    const repository = new OnboardingRepository(folder);
    const stable = await repository.patch({ mode: "new", step: 1 });
    for (const invalid of [
      { step: 7 }, { step: -1 }, { mode: "cloudflare" }, { token: "secret" },
      { cloudflareApiKey: "secret" }, { dismissed: "yes" }, {},
    ]) {
      await assert.rejects(() => repository.patch(invalid));
      assert.deepEqual(await repository.load(), stable);
    }
    assert.equal(OnboardingSchema.safeParse({ ...stable, token: "forbidden" }).success, false);
    assert.equal(OnboardingPatch.safeParse({ step: 1, access: "write" }).success, false);
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test("First-run setup refuses symlinks and malformed or oversized state", async () => {
  if (process.platform === "win32") return;
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-onboarding-file-"));
  try {
    const target = path.join(folder, "external.json");
    await fs.writeFile(target, JSON.stringify(defaultOnboarding()));
    await fs.symlink(target, path.join(folder, "onboarding.json"));
    await assert.rejects(() => new OnboardingRepository(folder).load());
    await fs.rm(path.join(folder, "onboarding.json"));
    await fs.writeFile(path.join(folder, "onboarding.json"), "x".repeat(5000));
    await assert.rejects(() => new OnboardingRepository(folder).load());
    await fs.rm(path.join(folder, "onboarding.json"));
    await fs.writeFile(path.join(folder, "onboarding.json"), "{\"version\":0}");
    await assert.rejects(() => new OnboardingRepository(folder).load());
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});
