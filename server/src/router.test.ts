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
});
