import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import path from "node:path";

export function loadRolevanaEnv() {
  const file = path.resolve(process.cwd(), "../../.env");
  if (existsSync(file)) loadEnvFile(file);
}
