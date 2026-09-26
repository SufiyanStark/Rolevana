import { describe, expect, it } from "vitest";
import { parseEnv } from "./index";
describe("environment", () => {
  it("fails closed into dry-run mode", () => expect(parseEnv({}).DRY_RUN).toBe(true));
  it("enables free AI and infrastructure modes by default", () => {
    const env = parseEnv({});
    expect(env.FREE_AI_ONLY).toBe(true);
    expect(env.FREE_INFRA_MODE).toBe(true);
    expect(env.MAX_AI_COST_USD).toBe(0);
    expect(env.OPENROUTER_MODEL).toBe("openrouter/free");
  });
  it("rejects a non-zero AI budget in free-only mode", () => expect(() => parseEnv({ MAX_AI_COST_USD: "0.01" })).toThrow());
  it("rejects unsafe scan rates", () => expect(() => parseEnv({ JOB_SCAN_INTERVAL_MINUTES: "1" })).toThrow());
});
