"use client";

import { SetupNavigation } from "@/components/setup-navigation";
import { OAuthCallbacksPanel } from "@/features/setup-center/oauth-callbacks-panel";

/** Compatibility route. Setup Center step 6 shares this guarded flow. */
export default function OAuthSettingsPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 text-slate-100">
      <SetupNavigation current="/oauth-settings" />
      <OAuthCallbacksPanel />
    </main>
  );
}

