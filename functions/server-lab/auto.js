// Automatic read-only lookup for a freshly generated Fingerprint event.
// Separate from /server-lab/event (manual, token-protected history lookup).
// Server API credentials are read only from Cloudflare Pages Functions secrets.
const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, private",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

export async function onRequestPost({ request, env }) {
  const siteOrigin = new URL(request.url).origin;
  if (request.headers.get("origin") !== siteOrigin)
    return json({ error: "origin_not_allowed" }, 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || ""))
    return json({ error: "expected_json" }, 415);

  const size = Number(request.headers.get("content-length") || "0");
  if (size > 1024) return json({ error: "request_too_large" }, 413);
  let input;
  try {
    const body = await request.text();
    if (body.length > 1024) return json({ error: "request_too_large" }, 413);
    input = JSON.parse(body);
  } catch (_) {
    return json({ error: "invalid_json" }, 400);
  }
  const eventId = typeof input?.event_id === "string" ? input.event_id.trim() : "";
  // Agent v4 event IDs begin with a millisecond timestamp. Auto lookups are
  // restricted to recently generated events; older history stays token-protected.
  const match = /^(\d{13})\.[A-Za-z0-9_-]{4,114}$/.exec(eventId);
  if (!match) return json({ error: "invalid_event_id" }, 400);
  const age = Date.now() - Number(match[1]);
  if (age < -60000 || age > 300000)
    return json({ error: "event_outside_auto_window" }, 403);

  const apiKey = typeof env.FP_SERVER_API_KEY === "string"
    ? env.FP_SERVER_API_KEY.trim() : "";
  if (!apiKey || /[\r\n]/.test(apiKey))
    return json({ error: "server_lab_not_configured" }, 503);

  const endpoint = "https://eu.api.fpjs.io/v4/events/" + encodeURIComponent(eventId)
    + "?ruleset_id=rs_Q0YrHa9wSNrhPy";
  let response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: { "authorization": "Bearer " + apiKey, "accept": "application/json" },
      redirect: "manual"
    });
  } catch (error) {
    return json({ error: "upstream_transport_failed", stage: "fetch" }, 502);
  }
  if (!response.ok) {
    const status = response.status;
    return json({
      error: status === 404 ? "event_not_found"
        : status === 429 ? "upstream_rate_limited"
        : status === 401 || status === 403 ? "upstream_api_key_or_region_rejected"
        : "upstream_http_error",
      upstream_status: status
    }, status === 404 ? 404 : status === 429 ? 429 : 502);
  }
  try {
    const result = await response.json();
    if (result?.event_id !== eventId)
      return json({ error: "event_id_mismatch" }, 502);
    return json(result);
  } catch (_) {
    return json({ error: "upstream_non_json_response" }, 502);
  }
}
