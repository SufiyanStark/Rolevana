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
      const body = await response.json() as { recordsFetched?:number;persistence?:{created?:number;updated?:number;unchanged?:number;duplicates?:number};qualifiedJobs?:number;jobsQueuedToBrain?:number;error?: string };
      setMessage(response.ok ? `Scan complete · ${body.recordsFetched??0} fetched · ${body.persistence?.created??0} new · ${body.persistence?.updated??0} updated · ${body.persistence?.unchanged??0} unchanged · ${body.persistence?.duplicates??0} duplicates · ${body.qualifiedJobs??0} qualified · ${body.jobsQueuedToBrain??0} queued · 0 applications` : body.error ?? "Scan failed safely.");
      if (response.ok) window.location.reload();
    } finally { setRunning(false); }
  }
  return <div className="flex flex-wrap items-center gap-3"><Button onClick={scan} disabled={running}><RefreshCw size={15} className={running ? "animate-spin" : ""}/>{running ? "Scanning…" : "Run Scan Now"}</Button>{message && <span className="text-xs text-slate-400">{message}</span>}</div>;
}
