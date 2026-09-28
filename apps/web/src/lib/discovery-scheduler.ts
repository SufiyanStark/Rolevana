import { NonOverlappingDiscoveryScheduler } from "@rolevana/job-sources";
import { runJobDiscovery } from "./discovery";
import { runRolevanaBrain } from "./brain-service";

const globalScheduler = globalThis as typeof globalThis & { rolevanaDiscoveryScheduler?: NonOverlappingDiscoveryScheduler };

export function ensureLocalDiscoveryScheduler(userId: string) {
  if (process.env.AUTOPILOT_DISCOVERY !== "true") return null;
  if (!globalScheduler.rolevanaDiscoveryScheduler) {
    globalScheduler.rolevanaDiscoveryScheduler = new NonOverlappingDiscoveryScheduler(async () => {
      await runJobDiscovery(userId);
      await runRolevanaBrain(userId, Math.min(10, Number(process.env.TARGET_APPLICATIONS_PER_HOUR ?? 10)));
    }, Number(process.env.AUTO_SYNC_INTERVAL_MINUTES ?? process.env.JOB_SCAN_INTERVAL_MINUTES ?? 60));
    globalScheduler.rolevanaDiscoveryScheduler.start();
  }
  return globalScheduler.rolevanaDiscoveryScheduler;
}
