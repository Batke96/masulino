const DEFAULT_REPO = "Batke96/masulino";
const WINDOW_MS = 10 * 60 * 1000;
const USER_MAX = 5;
const GLOBAL_MAX = 20;
const GLOBAL_KEY = "*";

const hits = new Map<string, number[]>();

export type FeedbackInput = {
  message: string;
  appId: string;
  appName: string;
  path: string;
  viewport?: { width: number; height: number };
};

export type FeedbackAuthor = {
  name: string;
  email: string;
  roleLabel: string;
  tenantName: string;
};

export type FeedbackIssue = {
  title: string;
  body: string;
};

export class FeedbackDeliveryError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`GitHub responded with ${status}`);
    this.name = "FeedbackDeliveryError";
    this.status = status;
  }
}

const TOKEN_KEYS = ["GITHUB_FEEDBACK_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"] as const;

/** Live process environment. Kept dynamic so a deploy can see a token added in Vercel. */
export function runtimeEnv(): NodeJS.ProcessEnv {
  return globalThis.process.env;
}

export function feedbackConfig(env: NodeJS.ProcessEnv): { repo: string; token: string } | null {
  const token = feedbackToken(env);
  const repo = feedbackRepo(env.GITHUB_FEEDBACK_REPO);
  if (!token || !repo) return null;
  return { repo, token };
}

function feedbackToken(env: NodeJS.ProcessEnv): string {
  for (const key of TOKEN_KEYS) {
    const value = env[key];
    const token = typeof value === "string" ? value.trim() : "";
    if (token.length >= 20) return token;
  }
  return "";
}

export function feedbackRepo(value: string | undefined): string | null {
  const raw = (value?.trim() || DEFAULT_REPO).replace(/\.git$/i, "");
  const fromUrl = raw.match(/github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i);
  const repo = fromUrl ? `${fromUrl[1]}/${fromUrl[2]}` : raw;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return null;
  return repo;
}

export function parseFeedbackBody(value: unknown): FeedbackInput | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const message = cleanMessage(body.message);
  const appId = cleanAppId(body.appId);
  const appName = cleanLabel(body.appName, 80);
  const path = cleanPath(body.path);
  if (!message || !appId || !appName || !path) return null;
  const viewport = cleanViewport(body.viewport);
  return viewport ? { message, appId, appName, path, viewport } : { message, appId, appName, path };
}

export function feedbackIssue(
  input: FeedbackInput,
  author: FeedbackAuthor,
  meta: { userAgent: string; at: Date },
): FeedbackIssue {
  const clock = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "full",
    timeStyle: "short",
  }).format(meta.at);
  const rows: Array<[string, string]> = [
    ["App", `${input.appName} (\`${input.appId}\`)`],
    ["Pfad", input.path],
    ["Person", `${author.name} · ${author.email}`],
  ];
  if (author.roleLabel) rows.push(["Rolle", author.roleLabel]);
  if (author.tenantName) rows.push(["Betrieb", author.tenantName]);
  rows.push(["Zeitpunkt", `${clock} (Europe/Berlin)`]);
  if (input.viewport) rows.push(["Viewport", `${input.viewport.width} × ${input.viewport.height}`]);
  const agent = meta.userAgent.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  if (agent) rows.push(["Browser", agent.slice(0, 300)]);

  const table = [
    "| | |",
    "| --- | --- |",
    ...rows.map(([label, value]) => `| ${cell(label)} | ${cell(value)} |`),
  ].join("\n");

  return {
    title: feedbackTitle(input.appName, input.message),
    body: `## Nachricht\n\n${input.message}\n\n## Kontext\n\n${table}\n`,
  };
}

export function takeFeedbackSlot(userId: string, now = Date.now()): boolean {
  const userKey = `user:${userId}`;
  const userHits = fresh(userKey, now);
  const globalHits = fresh(GLOBAL_KEY, now);
  if (userHits.length >= USER_MAX || globalHits.length >= GLOBAL_MAX) {
    hits.set(userKey, userHits);
    hits.set(GLOBAL_KEY, globalHits);
    return false;
  }
  userHits.push(now);
  globalHits.push(now);
  hits.set(userKey, userHits);
  hits.set(GLOBAL_KEY, globalHits);
  return true;
}

export function resetFeedbackSlots(): void {
  hits.clear();
}

export async function createGithubIssue(args: {
  repo: string;
  token: string;
  title: string;
  body: string;
  fetchImpl?: typeof fetch;
}): Promise<{ url: string; number: number }> {
  const [owner, name] = args.repo.split("/");
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner ?? "")}/${encodeURIComponent(name ?? "")}/issues`;
  const response = await (args.fetchImpl ?? fetch)(endpoint, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${args.token}`,
      "content-type": "application/json",
      "user-agent": "masulino-feedback",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({ title: args.title, body: args.body }),
    signal: AbortSignal.timeout(8000),
  });
  let payload: { html_url?: unknown; number?: unknown } = {};
  try {
    payload = (await response.json()) as { html_url?: unknown; number?: unknown };
  } catch {
    payload = {};
  }
  if (!response.ok || typeof payload.html_url !== "string" || typeof payload.number !== "number") {
    throw new FeedbackDeliveryError(response.status);
  }
  return { url: payload.html_url, number: payload.number };
}

function feedbackTitle(appName: string, message: string): string {
  const line = message.split(/\r?\n/).map((part) => part.trim()).find(Boolean) ?? "";
  const clipped = [...line].length > 72 ? `${[...line].slice(0, 71).join("").trimEnd()}…` : line;
  const prefix = `Feedback · ${appName}`;
  const title = clipped ? `${prefix}: ${clipped}` : prefix;
  return [...title].length > 240 ? `${[...title].slice(0, 239).join("").trimEnd()}…` : title;
}

function fresh(key: string, now: number): number[] {
  return (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
}

function cleanMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\u0000/g, "").trim();
  if (!text || [...text].length > 4000) return null;
  return text;
}

function cleanAppId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^[a-z0-9-]{1,40}$/.test(text)) return null;
  return text;
}

function cleanLabel(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!text || [...text].length > max) return null;
  return text;
}

function cleanPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text.startsWith("/") || text.startsWith("//") || text.length > 500) return null;
  if (/[\u0000-\u001F\u007F]/.test(text)) return null;
  return text;
}

function cleanViewport(value: unknown): { width: number; height: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as { width?: unknown; height?: unknown };
  if (typeof record.width !== "number" || typeof record.height !== "number") return undefined;
  if (!Number.isFinite(record.width) || !Number.isFinite(record.height)) return undefined;
  const width = Math.round(record.width);
  const height = Math.round(record.height);
  if (width < 0 || height < 0 || width > 20000 || height > 20000) return undefined;
  return { width, height };
}

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
