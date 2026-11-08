import fs from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FoundationError } from "../contracts/index.ts";

const TTL = 2 * 60 * 1000;
type Ticket = {
  id: string; rootId: string; file: string;
  createdAt: number; expiresAt: number; approved: boolean;
};
function stateDir(): string {
  return process.env.LOCAL_MCP_STATE_DIR?.trim() ||
    path.join(os.homedir(), process.platform === "win32"
      ? "AppData/Local/LocalMCPManager" : ".config/local-mcp-manager");
}
async function directory(): Promise<string> {
  const folder = path.join(stateDir(), "pending-delete");
  await fs.mkdir(folder, { recursive:true, mode:0o700 });
  const info = await fs.lstat(folder);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Unsafe approval directory");
  if (process.platform !== "win32") await fs.chmod(folder,0o700);
  return folder;
}
function fileOf(folder:string,id:string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new FoundationError("INVALID_INPUT", "Invalid approval ID.");
  return path.join(folder,id+".json");
}
async function readTicket(filename:string):Promise<Ticket|null> {
  try {
    const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size>2048) return null;
      const data:unknown = JSON.parse(await handle.readFile("utf8"));
      if (!data || typeof data!=="object") return null;
      const t=data as Partial<Ticket>;
      if (typeof t.id!=="string" || typeof t.rootId!=="string" ||
          typeof t.file!=="string" || typeof t.expiresAt!=="number" ||
          typeof t.createdAt!=="number" || typeof t.approved!=="boolean")return null;
      return t as Ticket;
    } finally { await handle.close(); }
  } catch { return null; }
}
export async function requestDelete(rootId:string,file:string) {
  const folder=await directory();
  // Expired tickets must not permanently exhaust the owner's queue.
  for (const name of await fs.readdir(folder)) {
    if (!/^[0-9a-f-]{36}\.json$/.test(name)) continue;
    const location = path.join(folder, name);
    const existing = await readTicket(location);
    if (!existing || existing.expiresAt <= Date.now()) {
      await fs.unlink(location).catch(() => {});
    }
  }
  if ((await fs.readdir(folder)).filter(name => /^[0-9a-f-]{36}\.json$/.test(name)).length >= 100) {
    throw new FoundationError("UNAVAILABLE","Too many pending delete requests.");
  }
  const id=randomUUID();
  const ticket:Ticket={id,rootId,file,createdAt:Date.now(),expiresAt:Date.now()+TTL,approved:false};
  await fs.writeFile(fileOf(folder,id),JSON.stringify(ticket),{flag:"wx",mode:0o600});
  return { approvalId:id, status:"approval_required", expiresAt:ticket.expiresAt };
}
export async function listDeleteApprovals():Promise<Ticket[]> {
  const folder=await directory();
  const files=(await fs.readdir(folder)).filter(x=>/^[0-9a-f-]{36}\.json$/.test(x)).slice(0,100);
  const list:Ticket[]=[];
  for(const name of files) {
    const item=await readTicket(path.join(folder,name));
    if(item && item.expiresAt>Date.now() && !item.approved) list.push(item);
  }
  return list;
}
export async function approveDelete(id:string):Promise<void> {
  const folder=await directory();
  const file=fileOf(folder,id);
  const original=await readTicket(file);
  if(!original || original.id!==id || original.expiresAt<=Date.now()) {
    throw new FoundationError("NOT_FOUND","Delete approval expired or not found.");
  }
  const next={...original,approved:true};
  const temp=path.join(folder,"approval-"+randomUUID()+".tmp");
  try {
    await fs.writeFile(temp,JSON.stringify(next),{flag:"wx",mode:0o600});
    await fs.rename(temp,file);
  } finally { await fs.rm(temp,{force:true}).catch(()=>{}); }
}
export async function consumeDelete(rootId:string,file:string,id:string):Promise<void> {
  const folder=await directory();
  const location=fileOf(folder,id);
  // An exclusive per-ticket claim makes Windows consume atomic, too.
  // Concurrent fs.rename calls are not a reliable single-consumer guard.
  const lockFile = path.join(folder, "claim-" + id + ".lock");
  let lock: Awaited<ReturnType<typeof fs.open>>;
  try {
    lock = await fs.open(lockFile, "wx", 0o600);
  } catch {
    throw new FoundationError("ACCESS_DENIED", "Local owner approval required for this exact deletion.");
  }
  try {
    const claimed = path.join(folder, "spent-" + randomUUID() + ".tmp");
    try {
      await fs.rename(location, claimed);
    } catch {
      throw new FoundationError("ACCESS_DENIED", "Local owner approval required for this exact deletion.");
    }
    try {
      const ticket = await readTicket(claimed);
      if (!ticket || ticket.id !== id || ticket.rootId !== rootId || ticket.file !== file ||
          !ticket.approved || ticket.expiresAt <= Date.now()) {
        throw new FoundationError("ACCESS_DENIED", "Local owner approval required for this exact deletion.");
      }
    } finally {
      await fs.unlink(claimed).catch(() => {});
    }
  } finally {
    await lock.close();
    await fs.unlink(lockFile).catch(() => {});
  }
}
