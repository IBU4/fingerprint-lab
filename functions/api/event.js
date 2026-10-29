// Read-only Fingerprint Server API v4 lookup. Requires TWO Cloudflare Pages secrets.
// FP_SERVER_API_KEY never leaves Cloudflare; LAB_EVENT_ACCESS_TOKEN authorizes lab operator.
const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, private",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer"
};
function reply(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: HEADERS });
}
async function tokenMatches(supplied, expected) {
  if (!supplied || !expected || supplied.length > 512) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
export async function onRequestPost({ request, env }) {
  if (!env.FP_SERVER_API_KEY || !env.LAB_EVENT_ACCESS_TOKEN || env.LAB_EVENT_ACCESS_TOKEN.length < 32)
    return reply({ error: "server_event_not_configured" }, 503);

  const requestOrigin = new URL(request.url).origin;
  if (request.headers.get("origin") !== requestOrigin)
    return reply({ error: "origin_not_allowed" }, 403);

  const accessToken = request.headers.get("x-lab-event-token") || "";
  if (!(await tokenMatches(accessToken, env.LAB_EVENT_ACCESS_TOKEN)))
    return reply({ error: "access_denied" }, 403);

  if (!(request.headers.get("content-type") || "").startsWith("application/json"))
    return reply({ error: "expected_json" }, 415);
  const declaredSize = Number(request.headers.get("content-length") || "0");
  if (declaredSize > 1024) return reply({ error: "request_too_large" }, 413);

  let data;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return reply({ error: "request_too_large" }, 413);
    data = JSON.parse(raw);
  } catch (_) {
    return reply({ error: "invalid_json" }, 400);
  }
  const eventId = typeof data?.eventId === "string" ? data.eventId.trim() : "";
  if (!/^[A-Za-z0-9._-]{8,128}$/.test(eventId))
    return reply({ error: "invalid_event_id" }, 400);

  // Trim common copy/paste whitespace; never expose the server API key to the client.
  const secretKey = env.FP_SERVER_API_KEY.trim();
  if (!secretKey || /[\r\n]/.test(secretKey))
    return reply({ error: "fingerprint_secret_key_invalid_format" }, 503);

  const endpoint = "https://eu.api.fpjs.io/v4/events/" + encodeURIComponent(eventId);
  let upstream;
  try {
    upstream = await fetch(endpoint, {
      method: "GET",
      headers: {
        "authorization": "Bearer " + secretKey,
        "accept": "application/json",
        "cache-control": "no-store",
        "pragma": "no-cache"
      },
      redirect: "error"
    });
  } catch (error) {
    // Do not expose the request, its Authorization header or the upstream body.
    console.error("Server Event upstream transport failed:", error?.name || "Error");
    return reply({ error: "fingerprint_transport_failure", stage: "upstream_fetch" }, 502);
  }
  if (!upstream.ok) {
    const status = upstream.status;
    return reply({
      error: status === 400 ? "fingerprint_bad_request" :
        status === 401 || status === 403 ? "fingerprint_auth_or_permission_rejected" :
        status === 404 ? "event_not_found" :
        status === 429 ? "fingerprint_rate_limited" : "fingerprint_upstream_error",
      upstreamStatus: status,
      stage: "upstream_http"
    }, status === 404 ? 404 : status === 429 ? 429 : 502);
  }
  let result;
  try {
    result = await upstream.json();
  } catch (error) {
    console.error("Server Event upstream response parsing failed:", error?.name || "Error");
    return reply({
      error: "fingerprint_invalid_json_response",
      upstreamStatus: upstream.status,
      contentType: (upstream.headers.get("content-type") || "").slice(0, 80),
      stage: "upstream_response"
    }, 502);
  }
  return reply(result);
}
