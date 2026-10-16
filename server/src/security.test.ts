import { describe, expect, it } from "vitest";
import { bearerMatches, websiteActorId } from "./security";

describe("bearerMatches", () => {
  it("accepts only the exact bearer secret", () => {
    expect(bearerMatches("Bearer local-dev-cron-secret-16", "local-dev-cron-secret-16")).toBe(true);
    expect(bearerMatches("Bearer local-dev-cron-secret-15", "local-dev-cron-secret-16")).toBe(false);
    expect(bearerMatches("local-dev-cron-secret-16", "local-dev-cron-secret-16")).toBe(false);
    expect(bearerMatches(null, "local-dev-cron-secret-16")).toBe(false);
    expect(bearerMatches("Bearer ", "local-dev-cron-secret-16")).toBe(false);
  });

  it("derives a stable website actor id from the site key", () => {
    const first = websiteActorId("local-dev-site-key-16");
    expect(first).toBe(websiteActorId("local-dev-site-key-16"));
    expect(first).not.toBe(websiteActorId("local-dev-site-key-17"));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
