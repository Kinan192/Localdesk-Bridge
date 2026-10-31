"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";

type State = "checking" | "paired" | "unpaired" | "pairing" | "error";

// React dev StrictMode can re-run effects after the URL fragment was removed.
// Keep the in-flight single-use redemption across that effect replay.
let pendingPairing: Promise<void> | null = null;

/**
 * Fragment-based single-use pairing. The future native installer opens this
 * URL automatically; the development CLI prints it for testing.
 */
export default function OwnerPairingBanner() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const ticket = params.get("owner-pair");
    if (ticket !== null) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      pendingPairing = (async () => {
        const result = await fetch("/api/local/owner/pair", {
          method: "POST", cache: "no-store", credentials: "same-origin",
          headers: { "Content-Type": "application/json", "x-local-mcp-action": "dashboard" },
          body: JSON.stringify({ ticket }),
        });
        if (!result.ok) throw new Error("pairing denied");
      })();
    }
    const pairing = pendingPairing;
    async function run() {
      try {
        if (pairing) {
          if (alive) setState("pairing");
          await pairing;
        }
        const response = await fetch("/api/local/owner", { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) throw new Error("owner status unavailable");
        const result = await response.json() as { paired?: boolean };
        if (alive) setState(result.paired ? "paired" : "unpaired");
      } catch { if (alive) setState("error"); }
    }
    void run();
    return () => { alive = false; };
  }, []);

  if (state === "checking" || state === "pairing") return (
    <p role="status" className="mb-3 text-xs text-slate-400">Checking local owner session...</p>
  );
  if (state === "paired") return (
    <div role="status" className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-800/50 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200">
      <CheckCircle2 size={15}/> Owner browser paired. Cloudflare verification is available; remote provisioning is still disabled.
    </div>
  );
  return (
    <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
      <ShieldAlert size={16}/>
      <div>
        <strong>{state === "error" ? "Owner pairing failed or expired" : "Owner browser not paired"}</strong>
        <p className="mt-1">Cloudflare token verification requires owner pairing first. In this developer build, run <code>npm run owner:pair</code> and open its one-time link. The packaged desktop launcher will handle this automatically.</p>
      </div>
    </div>
  );
}
