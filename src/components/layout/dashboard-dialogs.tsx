"use client";
import { ArrowRight, FolderPlus, Info, Plus, Wrench, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import LocalClientSetup from "@/features/connections/local-client-setup";
import RemoteTunnelSetup from "@/features/connections/remote-tunnel-setup";
import { useDashboard } from "@/context/dashboard-context";
import { IconBubble, Modal } from "@/components/ui";

// Independent dialogs rendered above the dashboard shell.
export default function DashboardDialogs() {
 const [writeAvailable,setWriteAvailable]=useState(false);
 useEffect(() => {
  let active=true;
  void fetch("/api/local/policy", { credentials:"same-origin",cache:"no-store" })
   .then(async response => response.ok ? response.json() : null)
   .then(value => { if(active)setWriteAvailable(value?.writeRelease?.available===true); })
   .catch(() => { if(active)setWriteAvailable(false); });
  return () => {active=false;};
 },[]);
 const {
  folderModal,setFolderModal,folderName,setFolderName,folderPath,setFolderPath,
  folderAccess,setFolderAccess,folderError,addFolder,roots,guide,setGuide,openPage,
  welcome,setWelcome,welcomeStep,setWelcomeStep
 } = useDashboard();
 const normalizedFolderPath = (value: string) => value.trim().replace(/\/+$/, "") || "/";
 const existingFolder = roots.find(root =>
   normalizedFolderPath(root.path) === normalizedFolderPath(folderPath));
 return <>
    {folderModal && <Modal title="Add a folder" subtitle="Choose a folder and the exact access permission the AI may use." onClose={() => setFolderModal(false)}>
      <form className="modal-form flex flex-col gap-4" onSubmit={event => { event.preventDefault(); addFolder(); }}>
        <label>Display name<input required value={folderName} onChange={event => setFolderName(event.target.value)} placeholder="Example: My Workspace" maxLength={45} /></label>
        <label>Folder path<input required value={folderPath} onChange={event => setFolderPath(event.target.value)} placeholder="/home/you/Projects or C:\Users\You\Documents" maxLength={260} /></label>
        <label>Access level<select value={folderAccess} onChange={event => setFolderAccess(event.target.value as "read" | "write")}><option value="read">Read only (recommended)</option><option value="write" disabled={!writeAvailable}>Read & write</option></select></label>
        {existingFolder && <p className="text-xs text-amber-200" role="status">
          Folder ini sudah terdaftar sebagai "{existingFolder.name}". Menyimpan akan memperbarui
          izin folder yang sama, bukan menambah duplikat.
        </p>}
        {folderError && <p className="input-error text-xs text-rose-300" role="alert">{folderError}</p>}
        <div className="modal-info flex items-start gap-2 rounded-lg border border-violet-700/50 bg-violet-950/30 p-3 text-xs leading-5 text-violet-200"><Info size={16} /> Adding this folder updates your local allowlist. The MCP process reads the policy on its next connection. Only approve folders you want AI to access. Read & Write requires a working sandbox; deleting still requires separate local confirmation.</div>
        <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setFolderModal(false)}>Cancel</button><button className="button button-primary" type="submit"><Plus size={16} /> {existingFolder ? "Update permission" : "Approve folder"}</button></div>
      </form>
    </Modal>}

    {guide && (guide === "claude-code" || guide === "claude-desktop") && <LocalClientSetup client={guide} onClose={() => setGuide(null)} onReviewRoots={() => { setGuide(null); openPage("roots"); }} />}
    {guide && (guide === "chatgpt" || guide === "claude-web") && <RemoteTunnelSetup provider={guide} onClose={() => setGuide(null)}/>}
    {welcome && <Modal title="Getting started" subtitle="A quick tour of your future MCP workspace." onClose={() => { setWelcome(false); setWelcomeStep(0); }}>
      <div className="tour-progress my-5 flex gap-2">{[0,1,2].map(index => <span className={welcomeStep >= index ? "tour-active" : ""} key={index} />)}</div>
      <div className="tour-page py-3">{welcomeStep === 0 ? <><IconBubble icon={FolderPlus} tone="mint" /><h3>1. Choose your folders</h3><p>Select a few non-sensitive folders and choose Read Only or Read & Write access in the local MCP allowlist.</p></> : welcomeStep === 1 ? <><IconBubble icon={Wrench} tone="blue" /><h3>2. Configure MCP tools</h3><p>Read operations work by default. File changes require explicit folder permission and a supported sandbox.</p></> : <><IconBubble icon={Zap} tone="purple" /><h3>3. Connect your AI</h3><p>The Claude Desktop/Claude Code setup wizard is available. Use the existing Remote MCP setup in Setup Center for ChatGPT/Claude Web.</p></>}</div>
      <div className="modal-actions"><button className="button button-secondary" onClick={() => { if (welcomeStep === 0) { setWelcome(false); } else setWelcomeStep(value => value - 1); }}>{welcomeStep === 0 ? "Skip tour" : "Back"}</button><button className="button button-primary" onClick={() => { if (welcomeStep < 2) setWelcomeStep(value => value + 1); else { setWelcome(false); setWelcomeStep(0); openPage("roots"); } }}>{welcomeStep === 2 ? "Explore dashboard" : "Continue"} <ArrowRight size={16} /></button></div>
    </Modal>}

 </>;
}
