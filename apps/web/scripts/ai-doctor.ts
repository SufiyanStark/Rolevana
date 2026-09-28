import { AIProviderDiagnostics, diagnosticConfigFromEnv } from "@rolevana/ai";
import { loadRolevanaEnv } from "./load-env";
import { saveAIProviderHealth } from "../src/lib/job-store";

async function main() {
loadRolevanaEnv();
const diagnostics = new AIProviderDiagnostics(diagnosticConfigFromEnv(process.env));
const results = await diagnostics.diagnoseAll();
await saveAIProviderHealth("local-development-user", results);
console.log("Rolevana AI Diagnostics\n");
for (const item of results) {
  console.log(item.provider.toUpperCase());
  console.log(`Configured: ${item.configured ? "Yes" : "No"}`);
  console.log(`Authenticated: ${item.authenticated ? "Yes" : "No"}`);
  console.log(`Model: ${item.model ?? "-"}`);
  console.log(`Cost policy: ${item.freeVerified ? "VERIFIED FREE" : "FREE ONLY / NOT VERIFIED"}`);
  console.log(`Inference: ${item.inference}`);
  console.log(`Privacy classes: ${item.privacyClasses.join(", ")}`);
  console.log(`Latency: ${item.latencyMs === null ? "-" : `${item.latencyMs} ms`}`);
  console.log(`Cooldown: ${item.cooldownUntil ?? "-"}`);
  console.log(`Status: ${item.status}\n`);
}
console.log(`Overall: ${results.filter((item) => item.status === "WORKING").length}/${results.length} providers operational`);
console.log("AI Spend: $0.00");
}
void main();
