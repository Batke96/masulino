import "server-only";
import { handleApiRequest } from "@masulino/server/api-entry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request: Request) {
  return handleApiRequest(request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
