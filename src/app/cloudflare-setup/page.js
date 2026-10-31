"use client";

import { SetupNavigation } from "@/components/setup-navigation";
import { CloudflareDeploymentPanel } from "@/features/setup-center/cloudflare-deployment-panel";

/**
 * Backward-compatible advanced route.
 * M2.4 shares the SAME guarded Cloudflare flow with the Setup Center wizard.
 */
export default function CloudflareSetupPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-12 text-slate-100">
      <SetupNavigation current="/cloudflare-setup" />
      <CloudflareDeploymentPanel />
    </main>
  );
}

