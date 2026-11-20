import { describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "./api-entry";
import {
  FeedbackDeliveryError,
  createGithubIssue,
  feedbackConfig,
  feedbackIssue,
  parseFeedbackBody,
  resetFeedbackSlots,
  takeFeedbackSlot,
} from "./feedback";

const input = {
  message: "Der Saalplan springt nach dem Speichern zurück.",
  appId: "bookings",
  appName: "Buchungen",
  path: "/#buchungen",
  viewport: { width: 1440, height: 900 },
};

describe("parseFeedbackBody", () => {
  it("keeps a short note with the current app", () => {
    expect(parseFeedbackBody(input)).toEqual(input);
  });

  it("drops a broken viewport and still accepts the note", () => {
    expect(parseFeedbackBody({ ...input, viewport: { width: "wide" } })).toEqual({
      message: input.message,
      appId: input.appId,
      appName: input.appName,
      path: input.path,
    });
  });

  it("rejects an empty note, a foreign path and an oversized app id", () => {
    expect(parseFeedbackBody({ ...input, message: "  " })).toBeNull();
    expect(parseFeedbackBody({ ...input, path: "https://evil.example" })).toBeNull();
    expect(parseFeedbackBody({ ...input, appId: "Buchungen" })).toBeNull();
    expect(parseFeedbackBody({ ...input, message: "a".repeat(4001) })).toBeNull();
  });
});

describe("feedbackIssue", () => {
  it("names the app, the person and the Berlin time", () => {
    const issue = feedbackIssue(
      { ...input, appName: "A | B" },
      {
        name: "Peed",
        email: "user@example.test",
        roleLabel: "Inhaber",
        tenantName: "Masulino Spielwelt",
      },
      {
        userAgent: "TestBrowser",
        at: new Date("2026-11-20T08:10:00.000Z"),
      },
    );
    expect(issue.title).toBe("Feedback · A | B: Der Saalplan springt nach dem Speichern zurück.");
    expect(issue.body).toContain("Der Saalplan springt nach dem Speichern zurück.");
    expect(issue.body).toContain("A \\| B (`bookings`)");
    expect(issue.body).toContain("user@example.test");
    expect(issue.body).toContain("Inhaber");
    expect(issue.body).toContain("Masulino Spielwelt");
    expect(issue.body).toContain("/#buchungen");
    expect(issue.body).toContain("09:10");
    expect(issue.body).toContain("Europe/Berlin");
    expect(issue.body).toContain("1440 × 900");
    expect(issue.body).toContain("TestBrowser");
  });
});

describe("takeFeedbackSlot", () => {
  it("stops one person after five notes in the window", () => {
    resetFeedbackSlots();
    const now = Date.parse("2026-11-20T08:00:00.000Z");
    for (let i = 0; i < 5; i += 1) expect(takeFeedbackSlot("person", now + i)).toBe(true);
    expect(takeFeedbackSlot("person", now + 6)).toBe(false);
    expect(takeFeedbackSlot("other", now + 7)).toBe(true);
    expect(takeFeedbackSlot("person", now + WINDOW_PAST)).toBe(true);
  });
});

describe("feedbackConfig", () => {
  it("stays off until a repository token is present", () => {
    expect(feedbackConfig({})).toBeNull();
    expect(feedbackConfig({ GITHUB_FEEDBACK_TOKEN: "short" })).toBeNull();
    expect(feedbackConfig({ GITHUB_FEEDBACK_TOKEN: "github_pat_feedback_token" })).toEqual({
      repo: "Batke96/masulino",
      token: "github_pat_feedback_token",
    });
    expect(feedbackConfig({ GH_TOKEN: "github_pat_feedback_token" })?.token).toBe("github_pat_feedback_token");
    expect(feedbackConfig({ GITHUB_FEEDBACK_TOKEN: '"github_pat_feedback_token"' })?.token).toBe(
      "github_pat_feedback_token",
    );
    expect(
      feedbackConfig({
        GITHUB_FEEDBACK_TOKEN: "github_pat_feedback_token",
        GITHUB_FEEDBACK_REPO: "https://github.com/Batke96/masulino.git",
      })?.repo,
    ).toBe("Batke96/masulino");
    expect(
      feedbackConfig({
        GITHUB_FEEDBACK_TOKEN: "github_pat_feedback_token",
        GITHUB_FEEDBACK_REPO: "not a repo",
      }),
    ).toBeNull();
  });
});

describe("createGithubIssue", () => {
  it("posts the issue and returns the html url", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ html_url: "https://github.com/Batke96/masulino/issues/41", number: 41 }),
    );
    const created = await createGithubIssue({
      repo: "Batke96/masulino",
      token: "github_pat_feedback_token",
      title: "Feedback · Buchungen",
      body: "Hallo",
      fetchImpl,
    });
    expect(created).toEqual({ url: "https://github.com/Batke96/masulino/issues/41", number: 41 });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://api.github.com/repos/Batke96/masulino/issues");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer github_pat_feedback_token");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      title: "Feedback · Buchungen",
      body: "Hallo",
    });
  });

  it("hides the token when GitHub refuses the issue", async () => {
    const token = "github_pat_feedback_token";
    const fetchImpl = vi.fn(async () => Response.json({ message: token }, { status: 401 }));
    const error = await createGithubIssue({
      repo: "Batke96/masulino",
      token,
      title: "Feedback",
      body: "Hallo",
      fetchImpl,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(FeedbackDeliveryError);
    expect(error).toMatchObject({ status: 401 });
    expect((error as Error).message).not.toContain(token);
  });
});

describe("POST /api/feedback", () => {
  it("rejects a note before it asks for a session", async () => {
    const response = await handleApiRequest(
      new Request("http://staff.test/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "   " }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "validation" });
  });

  it("reports that GitHub is not configured", async () => {
    const previous = {
      GITHUB_FEEDBACK_TOKEN: process.env.GITHUB_FEEDBACK_TOKEN,
      GH_TOKEN: process.env.GH_TOKEN,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    };
    delete process.env.GITHUB_FEEDBACK_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    try {
      const response = await handleApiRequest(
        new Request("http://staff.test/api/feedback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        }),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "feedback_unavailable" });
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

const WINDOW_PAST = 10 * 60 * 1000 + 1;
