"use client";
import { useState } from "react";
import { Button } from "@rolevana/ui";
import { RefreshCw } from "lucide-react";

export function DiscoveryControls() {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  async function scan() {
    setRunning(true); setMessage("");
    try {
      const response = await fetch("/api/jobs/scan", { method: "POST" });
      const body = await response.json() as { totalJobs?: number; error?: string };
      setMessage(response.ok ? `Scan complete · ${body.totalJobs ?? 0} canonical jobs · 0 applications` : body.error ?? "Scan failed safely.");
      if (response.ok) window.location.reload();
    } finally { setRunning(false); }
  }
  return <div className="flex flex-wrap items-center gap-3"><Button onClick={scan} disabled={running}><RefreshCw size={15} className={running ? "animate-spin" : ""}/>{running ? "Scanning…" : "Run Scan Now"}</Button>{message && <span className="text-xs text-slate-400">{message}</span>}</div>;
}
