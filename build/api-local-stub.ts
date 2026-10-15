/**
 * Local and Cloudflare builds alias the staff API entry to this file.
 * The Vercel build uses the real Node router instead.
 */
export async function handleApiRequest(request: Request): Promise<Response> {
  if (!import.meta.env.DEV) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const target = process.env.MASULINO_API_URL ?? "http://127.0.0.1:8787";
  const incoming = new URL(request.url);
  const url = new URL(`${incoming.pathname}${incoming.search}`, target);
  const headers = new Headers(request.headers);
  const method = request.method;
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  return fetch(url, { method, headers, body, redirect: "manual" });
}
