"use client";
import { useState } from "react";
import { Badge, Button, Card } from "@rolevana/ui";
import type { AIProviderHealth, DiagnosticProviderId } from "@rolevana/ai";

const names: Record<DiagnosticProviderId, string> = { openrouter: "OpenRouter", nvidia: "NVIDIA / DeepSeek", "agent-router": "Agent Router" };
export function AIProviderSettings({ initialHealth = [] }: { initialHealth?: AIProviderHealth[] }) {
  const [providers, setProviders] = useState<AIProviderHealth[]>(initialHealth);
  const [testing, setTesting] = useState<DiagnosticProviderId | null>(null);
  async function test(provider: DiagnosticProviderId) {
    setTesting(provider);
    const response = await fetch(`/api/ai/health?provider=${provider}`, { method: "POST" });
    const body = await response.json() as { providers?: AIProviderHealth[] };
    if (body.providers?.[0]) setProviders((current) => [...current.filter((item) => item.provider !== provider), body.providers![0]!]);
    setTesting(null);
  }
  return <section className="mt-8"><div className="mb-3"><h2 className="m-0 text-lg font-semibold">AI providers</h2><p className="mt-1 text-xs text-slate-500">Server-side diagnostics only. Credentials are never returned to this page.</p></div><div className="grid gap-4 xl:grid-cols-3">{(["openrouter", "nvidia", "agent-router"] as DiagnosticProviderId[]).map((id) => { const item = providers.find((entry) => entry.provider === id); return <Card className="p-5" key={id}><div className="flex items-start justify-between gap-3"><h3 className="m-0 text-base font-semibold">{names[id]}</h3><Badge>{item?.status ?? "NOT TESTED"}</Badge></div><dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs"><dt className="text-slate-500">API key</dt><dd className="m-0 text-right">{item?.configured ? "Configured" : "Not configured"}</dd><dt className="text-slate-500">Authentication</dt><dd className="m-0 text-right">{item?.authenticated ? "Verified" : "Not verified"}</dd><dt className="text-slate-500">Model</dt><dd className="m-0 break-all text-right">{item?.model ?? "—"}</dd><dt className="text-slate-500">Free verification</dt><dd className="m-0 text-right">{item?.freeVerified ? "Yes" : "No"}</dd><dt className="text-slate-500">Latency</dt><dd className="m-0 text-right">{item?.latencyMs ? `${item.latencyMs} ms` : "—"}</dd><dt className="text-slate-500">Last check</dt><dd className="m-0 text-right">{item?.checkedAt ? new Date(item.checkedAt).toLocaleString() : "Never"}</dd></dl><Button className="mt-5 w-full" variant="secondary" disabled={testing !== null} onClick={() => test(id)}>{testing === id ? "Testing safely…" : "Test connection"}</Button></Card>; })}</div></section>;
}
