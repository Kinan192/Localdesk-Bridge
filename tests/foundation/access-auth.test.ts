import test from "node:test";
import assert from "node:assert/strict";
import {
  createLocalJWKSet, exportJWK, generateKeyPair, SignJWT,
} from "jose";
import { verifyAccessAssertion } from "../../src/server/mcp/access-auth.ts";

const config = {
  teamDomain: "myteam.cloudflareaccess.com",
  applicationAudience: "audience-0123456789abcdef",
};

test("Cloudflare Access assertion accepts valid RS256 app JWT but rejects forged tokens and wrong claims", async () => {
  // Local test keys: never fetch production Cloudflare certificates or use real tokens.
  const pair = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(pair.publicKey);
  const keys = createLocalJWKSet({ keys: [{ ...jwk, alg: "RS256", use: "sig", kid: "fixture-key" }] });

  const sign = (options: {
    issuer?: string;
    audience?: string | string[];
    subject?: string;
    withIssuedAt?: boolean;
    withExpiry?: boolean;
    expiry?: string;
  } = {}) => {
    let claim = new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "fixture-key" })
      .setIssuer(options.issuer ?? "https://" + config.teamDomain)
      .setAudience(options.audience ?? config.applicationAudience);
    if (options.subject !== "") claim = claim.setSubject(options.subject ?? "my-owner-user");
    if (options.withIssuedAt !== false) claim = claim.setIssuedAt();
    if (options.withExpiry !== false) claim = claim.setExpirationTime(options.expiry ?? "5m");
    return claim.sign(pair.privateKey);
  };

  const good = await sign();
  assert.deepEqual(await verifyAccessAssertion(good, config, keys), { subject: "my-owner-user" });
  const multiAudience = await sign({ audience: ["another-app", config.applicationAudience] });
  assert.deepEqual(await verifyAccessAssertion(multiAudience, config, keys), { subject: "my-owner-user" });
  await assert.rejects(verifyAccessAssertion(undefined, config, keys));
  await assert.rejects(verifyAccessAssertion("forged", config, keys));
  await assert.rejects(verifyAccessAssertion(await sign({ issuer: "https://evil.cloudflareaccess.com" }), config, keys));
  await assert.rejects(verifyAccessAssertion(await sign({ audience: "wrong-audience" }), config, keys));
  await assert.rejects(verifyAccessAssertion(await sign({ expiry: "-10m" }), config, keys));
  await assert.rejects(verifyAccessAssertion(await sign({ subject: "" }), config, keys));
  await assert.rejects(verifyAccessAssertion(await sign({ withExpiry: false }), config, keys));
  await assert.rejects(verifyAccessAssertion(await sign({ withIssuedAt: false }), config, keys));

  const stranger = await generateKeyPair("RS256", { extractable: true });
  const forged = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "fixture-key" })
    .setIssuer("https://" + config.teamDomain)
    .setAudience(config.applicationAudience)
    .setSubject("my-owner-user")
    .setIssuedAt().setExpirationTime("5m")
    .sign(stranger.privateKey);
  await assert.rejects(verifyAccessAssertion(forged, config, keys));
});
