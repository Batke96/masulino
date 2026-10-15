import { errorResponse } from "./errors";
import { route } from "./router";
import { withSecurityHeaders } from "./security";

/** Request handler for the Vercel function. Importing this module does not listen or read secrets. */
export async function handleApiRequest(request: Request): Promise<Response> {
  try {
    return withSecurityHeaders(await route(request));
  } catch (error) {
    return withSecurityHeaders(errorResponse(error));
  }
}
