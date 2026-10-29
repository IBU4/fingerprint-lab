// Independent, read-only Fingerprint Server API v4 experiment.
// This function does not import or modify the production /bridge proxy.
// Cloudflare encrypted secrets: FP_SERVER_API_KEY and LAB_EVENT_ACCESS_TOKEN.
const RESPONSE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, private",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer"
};

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS });
}

async function matchesAccessToken(provided, expected) {
  if (!provided || provided.length > 512 || !expected) return false;
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const left = new Uint8Array(leftHash);
  const right = new Uint8Array(rightHash);
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

export async function onRequestPost({ request, env }) {
  // Both secrets are independent of the working 1P proxy's PROXY_SECRET.
  const apiKey = typeof env.FP_SERVER_API_KEY === "string"
    ? env.FP_SERVER_API_KEY.trim() : "";
  const labToken = typeof env.LAB_EVENT_ACCESS_TOKEN === "string"
    ? env.LAB_EVENT_ACCESS_TOKEN : "";
  if (!apiKey || !labToken || labToken.length < 32)
    return reply({ error: "server_lab_not_configured", stage: "configuration" }, 503);
  if (/[\r\n]/.test(apiKey))
    return reply({ error: "server_api_key_format_invalid", stage: "configuration" }, 503);

  // Require an actual same-origin browser POST; cross-origin forms cannot supply
  // the custom access-token header. No CORS headers are returned.
  const url = new URL(request.url);
  if (request.headers.get("origin") !== url.origin)
    return reply({ error: "origin_not_allowed", stage: "authorization" }, 403);

  if (!(await matchesAccessToken(request.headers.get("x-server-lab-token") || "", labToken)))
    return reply({ error: "access_denied", stage: "authorization" }, 403);

  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || ""))
    return reply({ error: "expected_json", stage: "request" }, 415);

  const size = Number(request.headers.get("content-length") || "0");
  if (size > 1024) return reply({ error: "request_too_large", stage: "request" }, 413);

  let payload;
  try {
    const text = await request.text();
    if (text.length > 1024) return reply({ error: "request_too_large", stage: "request" }, 413);
    payload = JSON.parse(text);
  } catch (_) {
    return reply({ error: "invalid_json", stage: "request" }, 400);
  }
  const eventId = typeof payload?.event_id === "string" ? payload.event_id.trim() : "";
  if (!/^[a-zA-Z0-9._-]{8,128}$/.test(eventId))
    return reply({ error: "invalid_event_id", stage: "request" }, 400);

  // Requesting an existing event does not trigger browser identification.
  const endpoint = "https://eu.api.fpjs.io/v4/events/" + encodeURIComponent(eventId);
  let upstream;
  try {
    upstream = await fetch(endpoint, {
      method: "GET",
      headers: {
        "authorization": "Bearer " + apiKey,
        "accept": "application/json"
      },
      redirect: "manual"
    });
  } catch (error) {
    // Only non-sensitive category logged; no keys, event IDs or upstream bodies.
    console.error("server-lab fetch:", error?.name || "Error");
    return reply({ error: "upstream_transport_failed", stage: "fetch" }, 502);
  }

  if (!upstream.ok) {
    const status = upstream.status;
    // Upstream body is deliberately not reflected to avoid accidental data leaks.
    return reply({
      error: status === 400 ? "upstream_invalid_request"
        : status === 401 || status === 403 ? "upstream_api_key_or_region_rejected"
        : status === 404 ? "event_not_found"
        : status === 429 ? "upstream_rate_limited"
        : status >= 300 && status < 400 ? "upstream_redirect"
        : "upstream_http_error",
      stage: "upstream_http",
      upstream_status: status
    }, status === 404 ? 404 : status === 429 ? 429 : 502);
  }

  let result;
  try {
    result = await upstream.json();
  } catch (_) {
    return reply({
      error: "upstream_non_json_response",
      stage: "parse",
      upstream_status: upstream.status,
      upstream_content_type: (upstream.headers.get("content-type") || "").slice(0, 80)
    }, 502);
  }
  // Full provider payload on demand, authorized; no event history is stored here.
  return reply(result);
}
