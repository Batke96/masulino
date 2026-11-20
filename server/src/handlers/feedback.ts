import { isAppError } from "@masulino/contracts";
import { errorResponse, json } from "../errors";
import {
  createGithubIssue,
  feedbackConfig,
  feedbackIssue,
  parseFeedbackBody,
  takeFeedbackSlot,
} from "../feedback";
import { describeRole, loadRequestActor, requireStaffSession } from "../session";

const MAX_BODY = 20_000;

export async function handleFeedback(request: Request): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: "validation" }, 400);

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    return json({ error: "validation" }, 400);
  }
  const input = parseFeedbackBody(payload);
  if (!input) return json({ error: "validation" }, 400);

  const config = feedbackConfig(process.env);
  if (!config) return json({ error: "feedback_unavailable" }, 503);

  let staff;
  try {
    staff = await requireStaffSession(request);
  } catch (error) {
    if (isAppError(error)) return errorResponse(error);
    throw error;
  }

  const membership = staff.memberships.find((item) => item.status === "active");
  if (!membership) return json({ error: "forbidden" }, 403);
  if (!takeFeedbackSlot(staff.user.id)) return json({ error: "rate_limited" }, 429);

  let roleLabel = "";
  try {
    const actor = await loadRequestActor(staff, membership.tenant_id);
    if (actor?.membershipStatus === "active") roleLabel = describeRole(actor.grants).roleLabel;
  } catch (error) {
    if (!isAppError(error)) throw error;
  }

  const issue = feedbackIssue(
    input,
    {
      name: staff.user.name,
      email: staff.user.email,
      roleLabel,
      tenantName: membership.tenant_name,
    },
    {
      userAgent: request.headers.get("user-agent") ?? "",
      at: new Date(),
    },
  );

  try {
    const created = await createGithubIssue({ ...config, title: issue.title, body: issue.body });
    return json({ ok: true, number: created.number, url: created.url }, 201);
  } catch (error) {
    console.error("feedback issue failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "feedback_failed" }, 502);
  }
}
