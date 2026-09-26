import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { publicRuntimeConfig } from "@rolevana/config";
import "./globals.css";

export const metadata: Metadata = { title: "Rolevana — Find. Tailor. Apply.", description: "AI-powered remote job hunting and application automation." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const config = publicRuntimeConfig(process.env);
  return <html lang="en"><body><AppShell dryRun={config.dryRun}>{children}</AppShell></body></html>;
}

