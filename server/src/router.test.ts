import { describe, expect, it } from "vitest";
import { handleApiRequest } from "./api-entry";

describe("api entry", () => {
  it("answers health without opening the database", async () => {
    const response = await handleApiRequest(new Request("http://staff.test/api/health"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, service: "masulino-api" });
  });

  it("leaves unknown paths as not found", async () => {
    const response = await handleApiRequest(new Request("http://staff.test/api/missing"));
    expect(response.status).toBe(404);
  });

  it("hides birthday routes until the website key and venue slug are set", async () => {
    const previousKey = process.env.MASULINO_SITE_KEY;
    const previousSlug = process.env.MASULINO_PUBLIC_VENUE_SLUG;
    delete process.env.MASULINO_SITE_KEY;
    delete process.env.MASULINO_PUBLIC_VENUE_SLUG;
    try {
      const response = await handleApiRequest(new Request("http://staff.test/api/public/birthdays/times?date=2026-11-14"));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "unavailable" });
    } finally {
      restoreEnv("MASULINO_SITE_KEY", previousKey);
      restoreEnv("MASULINO_PUBLIC_VENUE_SLUG", previousSlug);
    }
  });

  it("rejects a birthday call with the wrong key before opening the database", async () => {
    const previousKey = process.env.MASULINO_SITE_KEY;
    const previousSlug = process.env.MASULINO_PUBLIC_VENUE_SLUG;
    process.env.MASULINO_SITE_KEY = "local-dev-site-key-16";
    process.env.MASULINO_PUBLIC_VENUE_SLUG = "masulino-berlin";
    try {
      const response = await handleApiRequest(
        new Request("http://staff.test/api/public/birthdays/times?date=2026-11-14", {
          headers: { authorization: "Bearer not-the-site-key" },
        }),
      );
      expect(response.status).toBe(401);
      const invalid = await handleApiRequest(
        new Request("http://staff.test/api/public/birthdays/times?date=14.11.2026", {
          headers: { authorization: "Bearer local-dev-site-key-16" },
        }),
      );
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toMatchObject({ error: "validation" });
    } finally {
      restoreEnv("MASULINO_SITE_KEY", previousKey);
      restoreEnv("MASULINO_PUBLIC_VENUE_SLUG", previousSlug);
    }
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
