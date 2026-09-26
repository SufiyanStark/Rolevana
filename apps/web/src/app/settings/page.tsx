import { Badge, Card } from "@rolevana/ui";
import { publicRuntimeConfig } from "@rolevana/config";
import { getSessionUser } from "@/lib/auth";
import { readAIProviderHealth } from "@/lib/job-store";
import { AIProviderSettings } from "@/components/ai-provider-settings";

export default async function SettingsPage() {
  const config = publicRuntimeConfig(process.env);
  const user = await getSessionUser();
  const health = user ? await readAIProviderHealth(user.id) : [];
  const rows = [["Autopilot discovery",config.autopilotDiscovery?"Enabled":"Off"],["Scan interval",`${config.scanIntervalMinutes} minutes`],["Remote only","Enabled"],["Free AI only",config.freeAiOnly?"Enabled":"Disabled"],["AI spend limit",`$${config.maxAiCostUsd.toFixed(2)}`],["Free infrastructure mode",config.freeInfraMode?"Enabled":"Disabled"],["AI batch size",String(config.aiJobAnalysisBatchSize)],["Application submission","Disabled in Phase 2"],["Email sending","Disabled in Phase 2"]];
  return <div>
    <h1 className="m-0 text-3xl font-semibold">Settings</h1>
    <p className="mt-2 text-sm text-slate-400">Fail-closed controls for discovery and verified-free AI.</p>
    <Card className="mt-6 overflow-hidden">{rows.map(([label,value])=><div className="flex items-center justify-between gap-5 border-b border-white/[.06] px-5 py-4 last:border-0" key={label}><span className="text-sm text-slate-400">{label}</span><span className="text-right text-sm font-semibold">{value}</span></div>)}</Card>
    <div className="mt-5 flex flex-wrap gap-2">
      <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-200">DRY_RUN=true · fail closed</Badge>
      <Badge className="border-emerald-300/20 bg-emerald-300/10 text-emerald-200">Paid and unknown-cost models blocked</Badge>
    </div>
    <AIProviderSettings initialHealth={health}/>
  </div>;
}
