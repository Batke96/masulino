import { describe, expect, it } from "vitest";
import { sanitizeNoticeText } from "./sanitize";

describe("notice text", () => {
  it("strips markup and keeps the visible words", () => {
    expect(sanitizeNoticeText("<script>alert(1)</script><b>Hallo</b>")).toBe("Hallo");
    expect(sanitizeNoticeText("javascript:alert(1) bleibt Text")).toBe("alert(1) bleibt Text");
  });
});
