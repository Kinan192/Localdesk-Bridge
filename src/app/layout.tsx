import type { Metadata } from "next";
import OwnerPairingBanner from "@/features/onboarding/owner-pairing-banner";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local MCP Manager — Control Center",
  description: "Local-first MCP dashboard for secure file access and AI connections.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="id"><body>{children}  <OwnerPairingBanner />
      </body></html>;
}
