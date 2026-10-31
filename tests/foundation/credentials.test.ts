import test from "node:test";
import assert from "node:assert/strict";
import {
  CloudflareCredentialVault, CredentialVaultError, VAULT_SERVICE,
  createNativeKeyringFactory, type CredentialReference, type KeyringFactory,
} from "../../src/server/credentials/index.ts";

const accountId = "0123456789abcdef0123456789abcdef";
const otherId = "ffffffffffffffffffffffffffffffff";
const token1 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi012345";
const token2 = "ZYXWVUTSRQPONMLKJIHGFEDCBAabcdefghi012345";
const ref: CredentialReference = { kind: "cloudflare-api-token", accountId };

function fakeVault() {
  const backing = new Map<string, string>();
  const called: string[] = [];
  const factory: KeyringFactory = (service, account) => {
    called.push(service + ":" + account);
    return {
      setPassword(password) { backing.set(service + ":" + account, password); },
      getPassword() {
        const value = backing.get(service + ":" + account);
        if (!value) throw new Error("Native provider might include secret " + token1);
        return value;
      },
      deletePassword() {
        if (!backing.delete(service + ":" + account)) throw new Error("No entry");
      },
    };
  };
  return { vault: new CloudflareCredentialVault(factory), backing, called };
}

test("P1D-B native credential broker supports store/read/rotate/revoke with no secret in references", () => {
  const { vault, backing, called } = fakeVault();
  assert.deepEqual(vault.store(ref, token1), ref);
  assert.equal(vault.read(ref), token1);
  assert.equal(vault.rotate(ref, token2).accountId, accountId);
  assert.equal(vault.read(ref), token2);
  assert.equal(backing.size, 1);
  assert.equal(called.every(value => value.startsWith(VAULT_SERVICE + ":cloudflare-api-token:")), true);
  assert.equal(JSON.stringify(ref).includes(token1), false);
  assert.equal(JSON.stringify(vault.store(ref, token2)).includes(token2), false);
  vault.revoke(ref);
  assert.equal(backing.size, 0);
  assert.throws(() => vault.read(ref), CredentialVaultError);
});

test("P1D-B credential IDs and token formats are strictly validated before vault access", () => {
  const { vault, called } = fakeVault();
  for (const bad of [
    { ...ref, accountId: "../../etc/passwd" },
    { ...ref, accountId: "x" },
    { ...ref, accountId: otherId, extra: "unexpected" },
    { ...ref, kind: "local-owner-key" },
  ]) {
    assert.throws(() => vault.store(bad as CredentialReference, token1), CredentialVaultError);
  }
  for (const badToken of ["hello", "token with spaces", "", null, 42, token1 + "\n"]) {
    assert.throws(() => vault.store(ref, badToken), CredentialVaultError);
  }
  assert.equal(called.length, 0);
});

test("P1D-B rotation fails closed if original credential is absent", () => {
  const { vault, backing } = fakeVault();
  assert.throws(() => vault.rotate(ref, token2), /Could not securely rotate/);
  assert.equal(backing.size, 0);
});

test("P1D-B native provider failures do not expose secret data or provider errors", () => {
  const factory: KeyringFactory = () => ({
    getPassword() { throw new Error("provider returned secret=" + token1); },
    setPassword() { throw new Error("provider returned secret=" + token1); },
    deletePassword() { throw new Error("provider returned secret=" + token1); },
  });
  const vault = new CloudflareCredentialVault(factory);
  for (const op of [
    () => vault.store(ref, token1),
    () => vault.read(ref),
    () => vault.rotate(ref, token2),
    () => vault.revoke(ref),
  ]) {
    assert.throws(op, (e: unknown) => {
      assert.ok(e instanceof CredentialVaultError);
      assert.equal(String(e).includes(token1), false);
      assert.equal(String(e).includes(token2), false);
      return true;
    });
  }
});

test("P1D-B Linux requires native persistent Secret Service, no kernel fallback", () => {
  const options: unknown[] = [];
  class FakeEntry {
    constructor(_service: string, _account: string, option?: unknown) {
      options.push(option);
    }
    setPassword(_value: string) {}
    getPassword() { return token1; }
    deletePassword() {}
  }
  const load = (moduleName: string) => {
    assert.equal(moduleName, "@napi-rs/keyring");
    return { Entry: FakeEntry };
  };
  const linux = new CloudflareCredentialVault(createNativeKeyringFactory("linux", load));
  linux.store(ref, token1);
  assert.deepEqual(options[0], { linux: { store: "secret-service" } });

  const windows = new CloudflareCredentialVault(createNativeKeyringFactory("win32", load));
  windows.store(ref, token1);
  assert.equal(options[1], undefined);

  const mac = new CloudflareCredentialVault(createNativeKeyringFactory("darwin", load));
  mac.store(ref, token1);
  assert.equal(options[2], undefined);
});

test("P1D-B rejects missing/unsupported/locked native credential providers without fallback", () => {
  assert.throws(() => createNativeKeyringFactory("freebsd"), CredentialVaultError);
  assert.throws(() => createNativeKeyringFactory("linux", () => { throw new Error("secret " + token1); }),
    (e: unknown) => {
      assert.ok(e instanceof CredentialVaultError);
      assert.equal(String(e).includes(token1), false);
      return true;
    });
  const unavailable = createNativeKeyringFactory("linux", () => ({
    Entry: class {
      constructor() { throw new Error("Secret Service locked: " + token1); }
    },
  }));
  const vault = new CloudflareCredentialVault(unavailable);
  assert.throws(() => vault.store(ref, token1), (e: unknown) => {
    assert.ok(e instanceof CredentialVaultError);
    assert.equal(String(e).includes(token1), false);
    return true;
  });
});
