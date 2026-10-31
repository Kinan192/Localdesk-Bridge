import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, FolderClosed, Wrench, Zap, Activity, Settings2 } from "lucide-react";
import type { PageId } from "@/lib/demo";

export type NavItem = { id: PageId; label: string; icon: LucideIcon; group: "workspace" | "management" };
export const menu: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "workspace" },
  { id: "roots", label: "File Access", icon: FolderClosed, group: "workspace" },
  { id: "tools", label: "MCP Tools", icon: Wrench, group: "workspace" },
  { id: "connections", label: "AI Connections", icon: Zap, group: "workspace" },
  { id: "activity", label: "Activity Logs", icon: Activity, group: "management" },
  { id: "settings", label: "Settings", icon: Settings2, group: "management" },
];
export const pageInfo: Record<PageId, { title: string; eyebrow: string; description: string }> = {
  overview: { title: "Overview", eyebrow: "WORKSPACE OVERVIEW", description: "One place to manage your local AI workspace." },
  roots: { title: "File Access", eyebrow: "ACCESS CONTROL", description: "Decide which folders AI assistants are allowed to access." },
  tools: { title: "MCP Tools", eyebrow: "PERMISSION CENTER", description: "Choose which capabilities each connection may use." },
  connections: { title: "AI Connections", eyebrow: "CONNECT YOUR ASSISTANTS", description: "Connect local or remote AI clients through guided setup." },
  activity: { title: "Activity Logs", eyebrow: "LOCAL AUDIT TRAIL", description: "Inspect real recorded MCP tool activity and policy decisions." },
  settings: { title: "Settings", eyebrow: "PREFERENCES & DEVICE", description: "Configure your personal workspace experience." },
};

