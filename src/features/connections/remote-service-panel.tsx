"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CirclePlay, CircleStop, RefreshCw, ShieldCheck, Settings2 } from "lucide-react";
import { useDashboard } from "@/context/dashboard-context";

type ManagedStatus = {
  state: "stopped" | "starting" | "running" | "stopping" | "error";
  managed: boolean;
  pid: number | null;
  startedAt: string | null;
  lastError: string | null;
};
type ServiceResponse = {
  status: ManagedStatus;
  configReady: boolean;
  mode: string;
  error?: string;
};

export default function RemoteServicePanel() {
  const { setGuide } = useDashboard();
  const [status, setStatus] = useState<ManagedStatus | null>(null);
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/local/service", { cache: "no-store" });
      const data = await response.json() as ServiceResponse;
      if (!response.ok || !data.status) throw new Error(data.error || "Cannot load MCP status.");
      setStatus(data.status);
      setReady(data.configReady);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Local service status unavailable.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 6000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  async function control(action: "start" | "stop") {
    const prompt = action === "start"
      ? "Start this installation's read-only MCP HTTP process? Cloudflare Tunnel is managed separately."
      : "Stop the MCP HTTP process started by this dashboard?";
    if (!window.confirm(prompt)) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/local/service", {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", "x-local-mcp-action": "dashboard" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json() as { status?: ManagedStatus; error?: string };
      if (!response.ok || !data.status) throw new Error(data.error || "Service request was refused.");
      setStatus(data.status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Service action failed.");
    } finally {
      setWorking(false);
      void refresh();
    }
  }

  const isRunning = status?.state === "running";
  const isTransitioning = working || status?.state === "starting" || status?.state === "stopping";

  return <section className="mt-4 rounded-2xl border border-slate-700/70 bg-panel p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-white">Remote MCP Service</h2>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          Manage the separate read-only MCP HTTP process on this computer.
          Cloudflare Tunnel and OS startup are not controlled here.
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs">
        <span className={"size-2 rounded-full " + (isRunning ? "bg-emerald-400" : "bg-slate-500")}/>
        <strong>{status?.state ?? "Checking..."}</strong>
      </div>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-slate-900/60 p-3">
        <span className="text-xs text-slate-400">Cloudflare settings</span>
        <p className={"mt-1 text-sm font-bold " + (ready ? "text-emerald-300" : "text-amber-300")}>
          {ready ? "Saved / valid format" : "Not configured"}
        </p>
      </div>
      <div className="rounded-xl bg-slate-900/60 p-3">
        <span className="text-xs text-slate-400">Managed process</span>
        <p className="mt-1 text-sm font-bold">{status?.managed ? "Yes" : "No"}</p>
      </div>
      <div className="rounded-xl bg-slate-900/60 p-3">
        <span className="text-xs text-slate-400">Process ID</span>
        <p className="mt-1 text-sm font-bold">{status?.pid ?? "—"}</p>
      </div>
    </div>

    {status?.lastError && <p className="mt-3 flex items-start gap-2 text-xs text-amber-200">
      <AlertTriangle size={15}/>{status.lastError}
    </p>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-rose-800 p-3 text-xs text-rose-200">{error}</p>}

    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button type="button" className="button button-primary"
        disabled={!ready || !!status?.managed || isTransitioning}
        onClick={() => void control("start")}>
        <CirclePlay size={16}/> Start MCP HTTP
      </button>
      <button type="button" className="button button-secondary"
        disabled={!status?.managed || isTransitioning}
        onClick={() => void control("stop")}>
        <CircleStop size={16}/> Stop
      </button>
      <button type="button" className="button button-secondary" onClick={() => void refresh()}>
        <RefreshCw size={16}/> Refresh
      </button>
      <button type="button" className="button button-secondary" onClick={() => setGuide("claude-web")}>
        <Settings2 size={16}/> Cloudflare config
      </button>
    </div>

    <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-amber-200">
      <ShieldCheck size={16} className="mt-0.5 shrink-0"/>
      This is an in-process alpha supervisor. A running process is not proof that
      Cloudflare Access OAuth or any web client is connected. Do not expose the
      dashboard port 3100 or enable public access without verifying the Access policy.
    </p>
  </section>;
}
