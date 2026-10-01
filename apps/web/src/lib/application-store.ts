import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PreparedApplicationPackage } from "@rolevana/applications";
import { getLocalDataDirectory } from "./local-store";

const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");
const directory = (userId: string) => path.join(getLocalDataDirectory(), safe(userId), "applications");
const indexFile = (userId: string) => path.join(directory(userId), "packages.json");
const packageFile = (userId: string, packageId: string) => path.join(directory(userId), "packages", `${safe(packageId)}.json`);
const read = async <T>(target: string, fallback: T): Promise<T> => { try { return JSON.parse(await readFile(target, "utf8")) as T; } catch { return fallback; } };
const write = async (target: string, value: unknown) => { await mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temporary, JSON.stringify(value, null, 2), "utf8"); await rename(temporary, target); };
const hydrate = (pkg: PreparedApplicationPackage): PreparedApplicationPackage => ({ ...pkg, applicationInstructions: pkg.applicationInstructions ?? [] });

export async function readApplicationPackages(userId: string) { return (await read<PreparedApplicationPackage[]>(indexFile(userId), [])).map(hydrate); }
export async function readApplicationPackage(userId: string, packageId: string) {
  const direct = await read<PreparedApplicationPackage | null>(packageFile(userId, packageId), null);
  return direct ? hydrate(direct) : (await readApplicationPackages(userId)).find((item) => item.id === packageId) ?? null;
}
export async function readApplicationPackageForJob(userId: string, jobId: string) { return (await readApplicationPackages(userId)).find((item) => item.jobId === jobId) ?? null; }
export async function saveApplicationPackage(userId: string, pkg: PreparedApplicationPackage) {
  const current = await readApplicationPackages(userId);
  const next = [pkg, ...current.filter((item) => item.id !== pkg.id && item.jobId !== pkg.jobId)].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  await Promise.all([write(indexFile(userId), next), write(packageFile(userId, pkg.id), pkg)]);
  return pkg;
}
