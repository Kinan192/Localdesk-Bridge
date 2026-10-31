import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { RemoteConfig } from "./remote-config.ts";

/**
 * Verify a Cloudflare Access application JWT, including signature, issuer,
 * application AUD, algorithm and expiry. The key source is injectable ONLY
 * for deterministic offline security tests; production always uses CF JWKS.
 */
export async function verifyAccessAssertion(
  assertion: unknown,
  config: Pick<RemoteConfig, "teamDomain" | "applicationAudience">,
  keys: JWTVerifyGetKey,
): Promise<{ subject: string }> {
  if (typeof assertion !== "string" || assertion.length < 20 || assertion.length > 12000) {
    throw new Error("Missing Cloudflare Access assertion");
  }

  const { payload } = await jwtVerify(assertion, keys, {
    issuer: "https://" + config.teamDomain,
    audience: config.applicationAudience,
    algorithms: ["RS256"],
    clockTolerance: 5,
  });
  if (typeof payload.sub !== "string" || !payload.sub ||
      typeof payload.exp !== "number" || typeof payload.iat !== "number") {
    throw new Error("Invalid Cloudflare Access identity or token lifetime");
  }
  return { subject: payload.sub };
}

/**
 * Cloudflare Managed OAuth performs login at the edge and forwards a signed
 * Cf-Access-Jwt-Assertion to our origin. An untrusted header alone is never
 * authorization, and X-Forwarded-* is not used as identity.
 */
export function createAccessVerifier(config: RemoteConfig) {
  const issuer = "https://" + config.teamDomain;
  const keys = createRemoteJWKSet(new URL(issuer + "/cdn-cgi/access/certs"), {
    timeoutDuration: 4000,
    cooldownDuration: 30000,
    cacheMaxAge: 10 * 60 * 1000,
  });
  return (assertion: unknown) => verifyAccessAssertion(assertion, config, keys);
}

