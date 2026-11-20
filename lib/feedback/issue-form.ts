const REPO = "Batke96/masulino";
const MAX_URL_LENGTH = 7500;

export type IssueFormInput = {
  message: string;
  appId: string;
  appName: string;
  path: string;
  viewport?: { width: number; height: number };
  person?: string;
  roleLabel?: string;
  tenantName?: string;
};

/** Prefilled new-issue page for the case where the server has no GitHub token. */
export function feedbackIssueFormUrl(input: IssueFormInput): string {
  const title = feedbackTitle(input.appName, input.message);
  let message = input.message;
  let url = buildUrl(title, issueBody({ ...input, message }));
  while (url.length > MAX_URL_LENGTH && message.length > 80) {
    message = `${message.slice(0, Math.floor(message.length * 0.7)).trimEnd()}…`;
    url = buildUrl(title, issueBody({ ...input, message }));
  }
  return url;
}

function buildUrl(title: string, body: string): string {
  const url = new URL(`https://github.com/${REPO}/issues/new`);
  url.searchParams.set("title", title);
  url.searchParams.set("body", body);
  return url.toString();
}

function issueBody(input: IssueFormInput): string {
  const lines = [
    "## Nachricht",
    "",
    input.message,
    "",
    "## Kontext",
    "",
    `- App: ${input.appName} (\`${input.appId}\`)`,
    `- Pfad: ${input.path}`,
  ];
  if (input.person) lines.push(`- Person: ${input.person}`);
  if (input.roleLabel) lines.push(`- Rolle: ${input.roleLabel}`);
  if (input.tenantName) lines.push(`- Betrieb: ${input.tenantName}`);
  if (input.viewport) lines.push(`- Viewport: ${input.viewport.width} × ${input.viewport.height}`);
  return lines.join("\n");
}

function feedbackTitle(appName: string, message: string): string {
  const line = message.split(/\r?\n/).map((part) => part.trim()).find(Boolean) ?? "";
  const clipped = [...line].length > 72 ? `${[...line].slice(0, 71).join("").trimEnd()}…` : line;
  const prefix = `Feedback · ${appName}`;
  const title = clipped ? `${prefix}: ${clipped}` : prefix;
  return [...title].length > 240 ? `${[...title].slice(0, 239).join("").trimEnd()}…` : title;
}
