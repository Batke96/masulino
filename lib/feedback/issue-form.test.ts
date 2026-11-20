import { describe, expect, it } from "vitest";
import { feedbackIssueFormUrl } from "./issue-form";

describe("feedbackIssueFormUrl", () => {
  it("opens a prefilled issue for the current app", () => {
    const url = new URL(
      feedbackIssueFormUrl({
        message: "Der Saalplan springt zurück.",
        appId: "bookings",
        appName: "Buchungen",
        path: "/#buchungen",
        viewport: { width: 1440, height: 900 },
        person: "User · user@example.test",
        roleLabel: "Inhaber",
        tenantName: "Masulino Spielwelt",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://github.com/Batke96/masulino/issues/new");
    expect(url.searchParams.get("title")).toBe("Feedback · Buchungen: Der Saalplan springt zurück.");
    const body = url.searchParams.get("body") ?? "";
    expect(body).toContain("Der Saalplan springt zurück.");
    expect(body).toContain("Buchungen (`bookings`)");
    expect(body).toContain("user@example.test");
    expect(body).toContain("Inhaber");
    expect(body).toContain("/#buchungen");
    expect(body).toContain("1440 × 900");
  });

  it("keeps a very long note inside a browser url", () => {
    const url = feedbackIssueFormUrl({
      message: "Hinweis ".repeat(2000),
      appId: "today",
      appName: "Übersicht",
      path: "/",
    });
    expect(url.length).toBeLessThanOrEqual(7500);
    expect(url).toContain("https://github.com/Batke96/masulino/issues/new");
  });
});
