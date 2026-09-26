export type ApplicationContext = { jobId: string; resumeId: string; answers: Record<string, string>; dryRun: boolean };
export type ApplicationResult = { status: "SIMULATED" | "SUBMITTED" | "NEEDS_REVIEW" | "FAILED"; confirmationId?: string; reason?: string };
export interface ApplicationAdapter {
  readonly id: string;
  supports(url: string): boolean;
  apply(context: ApplicationContext): Promise<ApplicationResult>;
}
export class MockApplicationAdapter implements ApplicationAdapter {
  readonly id = "mock";
  supports() { return true; }
  async apply(context: ApplicationContext): Promise<ApplicationResult> {
    if (!context.dryRun) return { status: "NEEDS_REVIEW", reason: "The Phase 1 adapter never submits real applications." };
    return { status: "SIMULATED", confirmationId: `dry-run-${context.jobId}` };
  }
}
export const assertAutomaticSubmissionAllowed = (dryRun: boolean) => {
  if (dryRun) throw new Error("Submission blocked: Rolevana is running in DRY RUN mode.");
};

export type QueueTaskStatus = "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED" | "WAITING_FOR_FREE_AI" | "PAID_SERVICE_REQUIRED";
export type QueueTask<T> = { id: string; payload: T; status: QueueTaskStatus; attempts: number; availableAt: Date; reason?: string };
export interface TaskQueue<T> {
  enqueue(task: QueueTask<T>): Promise<void>;
  takeReady(now?: Date): Promise<QueueTask<T> | null>;
  update(task: QueueTask<T>): Promise<void>;
}
export class LocalTaskQueue<T> implements TaskQueue<T> {
  private readonly tasks = new Map<string, QueueTask<T>>();
  async enqueue(task: QueueTask<T>) { if (!this.tasks.has(task.id)) this.tasks.set(task.id, task); }
  async takeReady(now = new Date()) { return [...this.tasks.values()].find((task) => task.status === "QUEUED" && task.availableAt <= now) ?? null; }
  async update(task: QueueTask<T>) { this.tasks.set(task.id, task); }
}
export function assertFreeInfrastructure(operation: { feature: string; requiresPaidService: boolean }, freeInfraMode: boolean) {
  if (freeInfraMode && operation.requiresPaidService) throw new Error(`PAID_SERVICE_REQUIRED: ${operation.feature}`);
}
