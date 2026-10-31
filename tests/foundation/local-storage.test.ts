import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defaultPolicy } from "../../src/server/contracts/index.ts";
import { JsonPolicyRepository, MemoryPolicyRepository } from "../../src/server/storage/index.ts";

test("Memory policy storage never leaks mutable references", async () => {
  const repo = new MemoryPolicyRepository();
  const first = await repo.load();
  first.tools.read_file = false;
  assert.equal((await repo.load()).tools.read_file, true);
  await repo.save(first);
  assert.equal((await repo.load()).tools.read_file, false);
  await assert.rejects(repo.save({ ...first, unexpected: true }));
  assert.equal((await repo.load()).tools.read_file, false);
});

test("JSON adapter safely persists policy, rejects invalid state, and does not save secrets", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-repository-"));
  try {
    const repo = new JsonPolicyRepository(path.join(directory, "private-state"));
    assert.deepEqual(await repo.load(), defaultPolicy());
    const changed = defaultPolicy();
    changed.tools.read_file = false;
    await repo.save(changed);
    assert.deepEqual(await repo.load(), changed);
    await assert.rejects(repo.save({ ...changed, extraToken: "should-not-persist" }));
    assert.deepEqual(await repo.load(), changed);
    const file = await fs.readFile(path.join(directory, "private-state", "policy.json"), "utf8");
    assert.equal(file.includes("extraToken"), false);
    assert.equal(file.includes("should-not-persist"), false);

    // Reading a symlinked policy file must never silently follow it.
    const stateFile = path.join(directory, "private-state", "policy.json");
    const other = path.join(directory, "outside.json");
    await fs.writeFile(other, JSON.stringify(defaultPolicy()));
    await fs.unlink(stateFile);
    await fs.symlink(other, stateFile);
    await assert.rejects(repo.load(), /Invalid local policy file/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
