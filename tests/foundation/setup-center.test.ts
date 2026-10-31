import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("Setup Center links all active first-run steps and shows honest service statuses", async () => {
  const source = await fs.readFile("src/app/setup-center/page.js", "utf8");
  for (const page of ["/credential-vault", "/cloudflare-setup", "/cloudflare-config", "/oauth-settings"]) {
    assert.ok(source.includes(page), "Missing step: " + page);
  }
  for (const api of ["/api/local/owner", "/api/local/policy", "/api/local/cloudflare/deployment",
      "/api/local/service", "/api/local/tunnel", "/api/local/status"]) {
    assert.ok(source.includes(api), "Missing status API " + api);
  }
  assert.match(source, /credentials: "same-origin"/);
  assert.match(source, /"X-Local-MCP-Action"/);
  assert.match(source, /owner\.paired !== true/);
  assert.match(source, /list_roots/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /(?:sk-|ghp_)[A-Za-z0-9]{20,}/);
});

test("Standalone setup pages always offer a route back to Setup Center", async () => {
  for (const name of ["cloudflare-setup", "cloudflare-config", "credential-vault",
      "oauth-settings", "tunnel-control"]) {
    const src = await fs.readFile("src/app/" + name + "/page.js", "utf8");
    assert.match(src, /href="\/setup-center"/, name);
  }
});

test("Production demo fixtures cannot imply fake file permissions or activity", async () => {
  const src = await fs.readFile("src/lib/demo.ts", "utf8");
  assert.match(src, /sampleRoots: FolderRoot\[\] = \[\];/);
  assert.match(src, /sampleEvents: EventEntry\[\] = \[\];/);
});
