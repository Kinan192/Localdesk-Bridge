"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SetupNavigation } from "@/components/setup-navigation";
import { setupSteps } from "@/features/setup-center/steps";
import { configuredStepCount, setupStepStates } from "@/features/setup-center/progress";
import { loadBrowserSelectedStep, storeBrowserSelectedStep, nextSelectedStep } from "@/features/setup-center/navigation";
import { SystemCheckPanel, FolderAccessPanel } from "@/features/setup-center/system-folder-panels";
import { CredentialVaultPanel } from "@/features/setup-center/credential-vault-panel";
import { CloudflareDeploymentPanel } from "@/features/setup-center/cloudflare-deployment-panel";
import { rootEnabledChange, rootRemoval } from "@/features/setup-center/folder-policy";

const headers = { "Content-Type": "application/json", "X-Local-MCP-Action": "dashboard" };

async function read(path) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 401
    ? "Sesi browser berakhir. Buka ulang dashboard melalui perintah start di terminal."
    : "Status layanan tidak dapat diperiksa (HTTP " + response.status + ").");
  return response.json();
}
async function mutatePolicy(method, payload) {
  const response = await fetch("/api/local/policy", {
    method, credentials: "same-origin", cache: "no-store", headers,
    body: JSON.stringify(payload),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 401
    ? "Sesi owner berakhir. Jalankan ulang localdesk untuk pairing."
    : value.error || "Perubahan izin folder gagal (HTTP " + response.status + ").");
  if (value.mode !== "read-only" || !value.policy || !Array.isArray(value.policy.roots)) {
    throw new Error("Respons kebijakan tidak terverifikasi; status izin tidak diubah.");
  }
  return value;
}

async function action(path, name) {
  const response = await fetch(path, {
    method: "POST", credentials: "same-origin", cache: "no-store", headers,
    body: JSON.stringify({ action: name }),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || "Permintaan gagal (HTTP " + response.status + ").");
  return value;
}
const steps = setupSteps;

function Status({ tone, children }) {
  return <span className={"rounded-full px-2.5 py-1 text-xs font-medium " +
    (tone === "ok" ? "bg-emerald-950 text-emerald-200" :
      tone === "warn" ? "bg-amber-950 text-amber-200" : "bg-slate-800 text-slate-300")}>
    {children}
  </span>;
}
export default function SetupCenterPage() {
  const [data, setData] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [stepRestored, setStepRestored] = useState(false);
  const policyMutationInFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [issue, setIssue] = useState("");
  const refresh = useCallback(async () => {
    setBusy(true);
    setIssue("");
    try {
      const owner = await read("/api/local/owner");
      if (owner.paired !== true) {
        setData({ paired: false });
        setIssue("Browser belum memiliki sesi pemilik yang aktif. Jalankan localdesk dan selesaikan pairing dari tautan privat di terminal, lalu buka kembali Setup Center.");
        return;
      }
      const results = await Promise.allSettled([
        read("/api/local/policy"),
        read("/api/local/cloudflare/deployment"),
        read("/api/local/status"),
        read("/api/local/service"),
        read("/api/local/tunnel"),
        read("/api/local/cloudflare/setup-draft"),
        read("/api/local/onboarding"),
      ]);
      setData({
        paired: true,
        policy: results[0].status === "fulfilled" ? results[0].value : null,
        deployment: results[1].status === "fulfilled" ? results[1].value : null,
        remote: results[2].status === "fulfilled" ? results[2].value : null,
        service: results[3].status === "fulfilled" ? results[3].value : null,
        tunnel: results[4].status === "fulfilled" ? results[4].value : null,
        credentials: results[5].status === "fulfilled" ? results[5].value : null,
        onboarding: results[6].status === "fulfilled" ? results[6].value : null,
      });
      if (results.some(x => x.status === "rejected")) {
        setIssue("Sebagian status belum tersedia. Periksa konfigurasi pada tahap terkait.");
      }
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Status dashboard tidak dapat dimuat.");
      setData(null);
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  // Resume only after the local owner session is authenticated. Persisted
  // selection is a step ID, never a token, provider result or completion flag.
  useEffect(() => {
    if (data?.paired === true && !stepRestored) {
      setActiveStep(loadBrowserSelectedStep());
      setStepRestored(true);
    } else if (data?.paired === false && stepRestored) {
      setStepRestored(false);
      setActiveStep(0);
    }
  }, [data?.paired, stepRestored]);

  function selectStep(index) {
    if (data?.paired !== true) return;
    setActiveStep(storeBrowserSelectedStep(index));
  }

  async function changeFolder(method, payload, description) {
    if (busy || policyMutationInFlight.current || data?.paired !== true ||
        data.policy?.mode !== "read-only" || !Array.isArray(data.policy?.policy?.roots)) return false;
    policyMutationInFlight.current = true;
    setBusy(true);
    setIssue("");
    setNotice("");
    try {
      const updated = await mutatePolicy(method, payload);
      setData(current => current?.paired === true
        ? { ...current, policy: updated }
        : current);
      setNotice(description + ". Kebijakan terbaru sudah tersimpan.");
      return true;
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Izin folder belum dapat diverifikasi.");
      return false;
    } finally {
      policyMutationInFlight.current = false;
      setBusy(false);
    }
  }

  async function control(path, actionName, description) {
    if (busy || data?.paired !== true) return;
    if (path === "/api/local/tunnel" && actionName === "start" &&
        !window.confirm("Pastikan cloudflared untuk Tunnel ini belum dijalankan manual. Mulai proses Tunnel baru yang dikelola dashboard?")) {
      return;
    }
    setBusy(true);
    setNotice("");
    setIssue("");
    try {
      await action(path, actionName);
      setNotice(description + ". Status akan diperiksa ulang.");
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Perubahan status belum dapat diverifikasi.");
    } finally {
      setBusy(false);
      void refresh();
    }
  }
  const folderCount = data?.policy?.policy?.roots?.filter(x => x.enabled)?.length ?? 0;
  const phase = data?.deployment?.phase || "not-started";
  const mcp = data?.remote?.remoteHttp?.state === "listening-protected";
  const tunnel = data?.tunnel?.status?.state === "running";
  const mcpConfigured = data?.service?.configReady === true;
  const mcpManaged = data?.service?.status?.managed === true;
  const tunnelManaged = data?.tunnel?.status?.managed === true;
  const url = data?.deployment?.hostname ? "https://" + data.deployment.hostname + "/mcp" : null;
  const system = data?.onboarding?.system;
  const systemReady = system?.dependenciesReady === true && system?.cloudflaredPresent === true;
  const stepStates = setupStepStates({
    systemReady,
    approvedFolders: folderCount,
    credentialAvailable: data?.credentials?.credentialAvailable === true,
    deploymentPhase: phase,
    mcpConfigured,
    mcpProtected: mcp,
    tunnelManagedRunning: tunnel,
  });
  const configuredSteps = configuredStepCount(stepStates);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-5 text-slate-100 sm:p-8">
      <SetupNavigation current="/setup-center" />
      <header className="space-y-2">
        <a href="/" className="text-sm text-sky-300 hover:underline">Dashboard</a>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Setup Center</h1>
            <p className="mt-1 text-sm text-slate-400">Satu tempat untuk menyiapkan koneksi AI dengan aman.</p>
          </div>
          <button type="button" disabled={busy} onClick={() => void refresh()}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-40">
            Perbarui status
          </button>
        </div>
      </header>
      {notice && <p role="status" className="rounded-lg border border-emerald-800 p-3 text-sm text-emerald-200">{notice}</p>}
      {issue && <p role="alert" className="rounded-lg border border-amber-800 p-3 text-sm text-amber-200">{issue}</p>}
      {data?.paired === true && <>
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-700 p-4">
            <p className="text-xs text-slate-400">Folder disetujui</p>
            <p className="mt-2 text-xl font-semibold">{folderCount}</p>
            <Status tone={folderCount ? "ok" : "warn"}>{folderCount ? "Tersedia" : "Belum ada"}</Status>
          </div>
          <div className="rounded-xl border border-slate-700 p-4">
            <p className="text-xs text-slate-400">Cloudflare deployment</p>
            <p className="mt-2 text-xl font-semibold">{phase}</p>
            <Status tone={phase === "published" ? "ok" : "warn"}>
              {phase === "published" ? "Tersimpan" : "Perlu pemeriksaan"}
            </Status>
          </div>
          <div className="rounded-xl border border-slate-700 p-4">
            <p className="text-xs text-slate-400">MCP listener & Tunnel</p>
            <p className="mt-2 text-xl font-semibold">{mcp && tunnel ? "Berjalan" : "Perlu pemeriksaan"}</p>
            <Status tone={mcp && tunnel ? "ok" : "warn"}>
              {mcp ? "MCP aktif" : "MCP tidak terdeteksi"} · {tunnel ? "Tunnel aktif" : "Tunnel belum terkonfirmasi"}
            </Status>
          </div>
        </section>

        <section className="space-y-3" aria-label="Langkah setup">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Langkah konfigurasi</h2>
            <p className="text-xs text-slate-400">
              {configuredSteps} dari {steps.length} tahap mempunyai indikator lokal · koneksi AI perlu uji terpisah
            </p>
          </div>
          <div className={activeStep === 3
            ? "grid gap-3 lg:grid-cols-[minmax(180px,0.65fr)_minmax(0,2fr)]"
            : "grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]"}>
            <nav aria-label="Daftar langkah konfigurasi" className="space-y-2">
              {steps.map((step, i) => (
                <button key={step.title} type="button" onClick={() => selectStep(i)}
                  aria-current={activeStep === i ? "step" : undefined}
                  className={"flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm transition " +
                    (activeStep === i ? "border-sky-500 bg-sky-950/30" :
                      "border-slate-700 bg-slate-900/30 hover:border-slate-500")}>
                  <span className={"flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-semibold " +
                    (activeStep === i ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300")}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{step.title}</span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {stepStates[i] === "configured" ? "Konfigurasi lokal terdeteksi" :
                        stepStates[i] === "review" ? "Perlu pemeriksaan" :
                        stepStates[i] === "verify-in-client" ? "Uji dari aplikasi AI" :
                        "Belum terkonfirmasi"}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-slate-400">{activeStep === i ? "●" : "›"}</span>
                </button>
              ))}
            </nav>
            <div className="min-w-0 space-y-4 self-start rounded-xl border border-slate-700 bg-slate-900/40 p-5">
              <p className="text-xs font-medium uppercase tracking-widest text-sky-300">
                Tahap {activeStep + 1} / {steps.length}
              </p>
              <h3 className="text-lg font-semibold">{steps[activeStep].title}</h3>
              <p className="text-xs text-slate-400">Posisi langkah disimpan di browser ini tanpa menyimpan token atau klaim penyelesaian. Setelah LocalDesk dinyalakan ulang, pairing akan membuka Dashboard terlebih dahulu; kembali ke Setup Center pada browser yang sama untuk melanjutkan langkah ini. Status konfigurasi selalu diperiksa ulang dari server.</p>
              <p className="text-sm text-slate-300">{steps[activeStep].description}</p>
              <p className="text-sm leading-6 text-slate-400">{steps[activeStep].guide}</p>
              {activeStep === 0 && (
                <SystemCheckPanel system={system} busy={busy} onRefresh={() => void refresh()} />
              )}
              {activeStep === 1 && (
                <FolderAccessPanel policyResponse={data?.policy} busy={busy}
                  onAdd={payload => changeFolder("POST", payload, "Folder diberi izin baca")}
                  onToggle={(id, enabled) => changeFolder("PATCH", rootEnabledChange(id, enabled),
                    enabled ? "Izin folder diaktifkan" : "Izin folder dinonaktifkan")}
                  onRemove={id => changeFolder("DELETE", rootRemoval(id), "Izin folder dicabut")} />
              )}
              {activeStep === 2 && (
                <CredentialVaultPanel credentialInfo={data?.credentials} parentBusy={busy}
                  onRefresh={() => refresh()} />
              )}
              {activeStep === 3 && (
                <CloudflareDeploymentPanel embedded onNavigateStep={selectStep}
                  onDeploymentChange={() => refresh()} />
              )}
              {steps[activeStep].href && (
                <a href={steps[activeStep].href}
                  className="inline-flex rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400">
                  {steps[activeStep].label}
                </a>
              )}
              {activeStep === steps.length - 1 && url && (
                <p className="break-all rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-200">{url}</p>
              )}
              <div className="flex items-center justify-between border-t border-slate-700 pt-4">
                <button type="button" disabled={activeStep === 0}
                  onClick={() => selectStep(nextSelectedStep(activeStep, -1))}
                  className="rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-30">
                  Sebelumnya
                </button>
                <button type="button" disabled={activeStep === steps.length - 1}
                  onClick={() => selectStep(nextSelectedStep(activeStep, 1))}
                  className="rounded-md border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-30">
                  Selanjutnya
                </button>
              </div>
            </div>
          </div>
        </section>
        <section className="space-y-3 rounded-xl border border-slate-700 p-5">
          <h2 className="text-lg font-semibold">Jalankan layanan</h2>
          <p className="text-sm text-slate-400">Semua layanan tetap berjalan di perangkat ini. Pengaturan tidak mengekspose dashboard ke internet.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Status tone={mcp ? "ok" : "warn"}>Remote MCP: {mcp ? "Protected listener" : "Belum aktif"}</Status>
            <button type="button" disabled={busy || mcp || !mcpConfigured} onClick={() => void control("/api/local/service", "start", "Permintaan start MCP dikirim")}
              className="rounded-lg border border-sky-600 px-3 py-2 text-sm text-sky-200 disabled:opacity-40">Start MCP</button>
            <button type="button" disabled={busy || !mcpManaged} onClick={() => void control("/api/local/service", "stop", "Permintaan stop MCP dikirim")}
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm disabled:opacity-40">Stop MCP</button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Status tone={tunnel ? "ok" : "warn"}>Tunnel: {tunnel ? "Managed process active" : "Belum aktif/di luar kontrol dashboard"}</Status>
            <button type="button" disabled={busy || !mcp || tunnel} onClick={() => void control("/api/local/tunnel", "start", "Permintaan start Tunnel dikirim")}
              className="rounded-lg border border-sky-600 px-3 py-2 text-sm text-sky-200 disabled:opacity-40">Start Tunnel</button>
            <button type="button" disabled={busy || !tunnelManaged} onClick={() => void control("/api/local/tunnel", "stop", "Permintaan stop Tunnel dikirim")}
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm disabled:opacity-40">Stop Tunnel</button>
          </div>
        </section>
        <section className="space-y-2 rounded-xl border border-slate-700 p-5">
          <h2 className="text-lg font-semibold">Hubungkan AI Assistant</h2>
          <p className="text-sm text-slate-400">Gunakan Server URL yang sama di ChatGPT dan Claude. Setiap client memiliki callback OAuth masing-masing.</p>
          <p className="break-all rounded-lg bg-slate-950 p-3 font-mono text-sm">{url || "Hostname belum dipublikasikan"}</p>
          <div className="flex flex-wrap gap-3">
            <a href="https://chatgpt.com/" target="_blank" rel="noreferrer" className="rounded-lg border border-slate-600 px-3 py-2 text-sm">Buka ChatGPT</a>
            <a href="https://claude.ai/" target="_blank" rel="noreferrer" className="rounded-lg border border-slate-600 px-3 py-2 text-sm">Buka Claude</a>
          </div>
          <p className="text-xs text-slate-400">Konektor belum diverifikasi hanya berdasarkan status proses lokal. Uji list_roots di masing-masing client.</p>
        </section>
      </>}
    </main>
  );
}
