import { loadRolevanaEnv } from "./load-env";
import { runJobDiscovery, discoveryMetrics } from "../src/lib/discovery";

async function main() {
loadRolevanaEnv();
if (process.env.DRY_RUN !== "true") throw new Error("Job discovery CLI requires DRY_RUN=true.");
const sourceFlag = process.argv.findIndex((value) => value === "--source");
const source = sourceFlag >= 0 ? process.argv[sourceFlag + 1] : undefined;
const result = await runJobDiscovery("local-development-user", source);
const metrics = discoveryMetrics(result.jobs);
console.log("Rolevana Job Discovery\n");
for (const run of result.runs) console.log(`${run.provider}\nFetched: ${run.jobsFetched}\nNew: ${run.jobsCreated}\nUpdated: ${run.jobsUpdated}\nUnchanged: ${result.persistence.bySource[run.provider]?.unchanged??0}\nRejected non-remote: ${run.jobsRejectedNonRemote}\nRejected geography: ${run.jobsRejectedLocation}\nRejected role: ${run.jobsRejectedRole}\nAmbiguous: ${run.ambiguousJobs}\nStatus: ${run.skippedReason?`SKIPPED — ${run.skippedReason}`:run.error ? `ERROR — ${run.error}` : "OK"}\n`);
console.log(`Canonical jobs: ${result.jobs.length}`);
console.log(`Remote jobs: ${metrics.remoteJobs}`);
console.log(`Remote frontend jobs: ${metrics.remoteFrontendJobs}`);
console.log(`Location eligible: ${metrics.locationEligibleJobs}`);
console.log(`Duplicates: ${result.persistence.duplicates + result.duplicatesFound}`);
console.log(`Needs AI: ${metrics.needsClassification}`);
console.log(`Queued to Brain: ${result.queuedToBrain}`);
console.log("Applications submitted: 0");
console.log("Emails sent: 0");
console.log("DRY RUN: ENABLED");
}
void main();
