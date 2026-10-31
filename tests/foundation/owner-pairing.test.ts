import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { OwnerPairingRepository, PAIRING_TTL_MS, SESSION_TTL_MS } from "../../src/server/owner/index.ts";

async function isolated(run: (folder: string, auth: OwnerPairingRepository) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-owner-"));
  try { await run(dir, new OwnerPairingRepository(dir)); }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test("Owner pairing issues one-time short-lived ticket and signed browser session", async () => {
  await isolated(async (folder, auth) => {
    const now = 1790000000000;
    const ticket = await auth.createTicket(now);
    assert.match(ticket, /^[A-Za-z0-9_-]{43}$/);
    const session = await auth.redeemTicket(ticket, now + 1000);
    assert.ok(session);
    assert.equal(await auth.verifySession(session, now + 1000), true);
    assert.equal(await auth.redeemTicket(ticket, now + 2000), null);
    assert.equal(await auth.verifySession(session, now + SESSION_TTL_MS + 2000), false);
    const forged = session.slice(0, -1) + (session.endsWith("A") ? "B" : "A");
    assert.equal(await auth.verifySession(forged, now + 1000), false);
    const second = new OwnerPairingRepository(folder);
    assert.equal(await second.verifySession(session, now + 2000), true);
    const raw = await fs.readFile(path.join(folder, "owner-pairing.json")).catch(() => Buffer.from(""));
    assert.equal(raw.includes(ticket), false);
    if (process.platform !== "win32") {
      const key = await fs.stat(path.join(folder, "owner-session-key.bin"));
      assert.equal(key.mode & 0o077, 0);
    }
  });
});

test("Owner pairing ticket rejects expired and incorrect codes, and consumes at most once", async () => {
  await isolated(async (_folder, auth) => {
    const at = 1790000000000;
    const first = await auth.createTicket(at);
    assert.equal(await auth.redeemTicket("x".repeat(43), at + 10), null);
    assert.equal(await auth.redeemTicket(first, at + 10), null); // invalid attempt consumes ticket
    const second = await auth.createTicket(at);
    assert.equal(await auth.redeemTicket(second, at + PAIRING_TTL_MS + 1), null);
    const third = await auth.createTicket(at);
    const result = await Promise.all([
      auth.redeemTicket(third, at + 1),
      auth.redeemTicket(third, at + 1),
    ]);
    assert.equal(result.filter(Boolean).length, 1);
    assert.equal(await auth.verifySession(undefined, at + 1), false);
  });
});

test("Owner pairing refuses symbolic-link state and unsafe signing key", async () => {
  if (process.platform === "win32") return;
  await isolated(async (folder, auth) => {
    await auth.createTicket();
    const keyPath = path.join(folder, "owner-session-key.bin");
    await fs.chmod(keyPath, 0o644);
    await assert.rejects(() => auth.createTicket(), /permissions are unsafe/);
    await fs.chmod(keyPath, 0o600);
    await fs.unlink(keyPath);
    const outside = path.join(folder, "outside.bin");
    await fs.writeFile(outside, "not-a-key", { mode: 0o600 });
    await fs.symlink(outside, keyPath);
    await assert.rejects(() => auth.createTicket());
  });
});
