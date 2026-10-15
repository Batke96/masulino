import { describe, expect, it } from "vitest";
import { bearerMatches } from "./security";

describe("bearerMatches", () => {
  it("accepts only the exact bearer secret", () => {
    expect(bearerMatches("Bearer local-dev-cron-secret-16", "local-dev-cron-secret-16")).toBe(true);
    expect(bearerMatches("Bearer local-dev-cron-secret-15", "local-dev-cron-secret-16")).toBe(false);
    expect(bearerMatches("local-dev-cron-secret-16", "local-dev-cron-secret-16")).toBe(false);
    expect(bearerMatches(null, "local-dev-cron-secret-16")).toBe(false);
    expect(bearerMatches("Bearer ", "local-dev-cron-secret-16")).toBe(false);
  });
});
