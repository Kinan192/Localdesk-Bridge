"use client";

import { SetupNavigation } from "@/components/setup-navigation";
import { MCPSettingsPanel } from "@/features/setup-center/mcp-settings-panel";

/** Compatibility route. Setup Center step 5 uses the same protected logic. */
export default function CloudflareConfigImportPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-12 text-slate-100">
      <SetupNavigation current="/cloudflare-config" />
      <MCPSettingsPanel />
    </main>
  );
}

