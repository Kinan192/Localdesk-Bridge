"use client";
import AppShell from "@/components/layout/app-shell";
import DashboardDialogs from "@/components/layout/dashboard-dialogs";
import FirstRunWizard from "@/features/onboarding/first-run-wizard";
import OwnerPairingBanner from "@/features/onboarding/owner-pairing-banner";
import { DashboardProvider, useDashboard } from "@/context/dashboard-context";
import OverviewPage from "@/features/overview/overview-page";
import FileAccessPage from "@/features/file-access/file-access-page";
import ToolsPage from "@/features/mcp-tools/tools-page";
import ConnectionsPage from "@/features/connections/connections-page";
import ActivityPage from "@/features/activity/activity-page";
import SettingsPage from "@/features/settings/settings-page";

const pageComponents = {
 overview: OverviewPage,
 roots: FileAccessPage,
 tools: ToolsPage,
 connections: ConnectionsPage,
 activity: ActivityPage,
 settings: SettingsPage,
} as const;

function DashboardContent() {
 const { page } = useDashboard();
 const Page = pageComponents[page];

 return <AppShell>
  <OwnerPairingBanner />
  <Page />
  <DashboardDialogs />
  <FirstRunWizard />
 </AppShell>;
}

export default function Dashboard() {
 return <DashboardProvider><DashboardContent /></DashboardProvider>;
}
