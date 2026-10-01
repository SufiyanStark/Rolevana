"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@rolevana/ui";

export function PrepareApplicationButton({ jobId, packageId, qualified }: { jobId: string; packageId?: string; qualified: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (packageId) return <Button onClick={() => router.push(`/applications/${packageId}/review`)}>Review prepared package</Button>;
  return <div className="text-right"><Button disabled={!qualified || busy} onClick={async () => { setBusy(true); setError(""); try { const response = await fetch("/api/applications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId }) }); const payload = await response.json() as { package?: { id: string }; error?: string }; if (!response.ok || !payload.package) throw new Error(payload.error ?? "Preparation failed"); router.push(`/applications/${payload.package.id}/review`); router.refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Preparation failed"); } finally { setBusy(false); } }}>{busy ? "Preparing…" : qualified ? "Prepare application package" : "Qualification required"}</Button>{error && <div className="mt-2 max-w-64 text-xs text-rose-400">{error}</div>}</div>;
}
