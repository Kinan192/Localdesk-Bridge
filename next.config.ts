import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Native Node addon (.node) must load through Node.js, not an ESM Turbopack chunk.
  // Keep the OS keyring on the server; never bundle it into browser or server ESM output.
  serverExternalPackages: ["@napi-rs/keyring"],
};

export default nextConfig;
