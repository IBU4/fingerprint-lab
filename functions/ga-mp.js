// First-party GA4 Measurement Protocol experiment (web stream, EU endpoint).
// API secret never leaves the Cloudflare server. Explicit opt-in only.
const STREAM = "G-F6JRRE08DC";
const ALLOWED = new Set(["page_view", "section_view", "section_engagement", "section_interaction", "mp_test_event"]);
const PAGES = new Set(["/", "/index.html", "/tracking-simulator.html", "/fingerprintjs-raw.html", "/beacon-test.html", "/privacy.html"]);
const SECTIONS = new Set(["identification", "results", "server_lab_and_response", "tracking_simulator", "raw_components", "documentation"]);
const ACTIONS = new Set(["run_test", "check_ga4_tag", "copy_vid", "export_json", "fetch_event", "copy_event_json", "export_event_json", "open_simulator", "open_raw_components", "open_privacy", "open_reference", "select_direct", "select_proxy", "open_ga_diagnostics"]);

const asObject = x => x !== null && typeof x === "object" && !Array.isArray(x);
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store", "x-content-type-options": "nosniff" }
});

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin !== url.origin || (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")) {
    return json({ ok: false, error: "origin_not_allowed" }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ ok: false, error: "content_type" }, 415);
  }
  if (!env.GA4_MP_SECRET) return json({ ok: false, error: "mp_secret_missing" }, 503);
  const size = Number(request.headers.get("content-length") || 0);
  if (size > 4096) return json({ ok: false, error: "too_large" }, 413);
  let incoming;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ ok: false, error: "too_large" }, 413);
    incoming = JSON.parse(raw);
  } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  if (!asObject(incoming) || incoming.consent !== "granted" || incoming.mode !== "mp") {
    return json({ ok: false, error: "consent_required" }, 403);
  }
  if (typeof incoming.client_id !== "string" || !/^\d{1,10}\.\d{1,10}$/.test(incoming.client_id)) {
    return json({ ok: false, error: "invalid_client_id" }, 400);
  }
  if (!Number.isSafeInteger(incoming.session_id) || incoming.session_id <= 0) {
    return json({ ok: false, error: "invalid_session_id" }, 400);
  }
  if (!ALLOWED.has(incoming.event_name) || !asObject(incoming.params)) {
    return json({ ok: false, error: "invalid_event" }, 400);
  }
  const event = incoming.event_name;
  const params = incoming.params;
  const output = {
    session_id: incoming.session_id,
    engagement_time_msec: Math.min(60000, Math.max(1, Number.isFinite(incoming.engagement_time_msec)
      ? Math.round(incoming.engagement_time_msec) : 100)),
    delivery_channel: "server_mp"
  };
  if (event === "page_view") {
    if (typeof params.page_path !== "string" || !PAGES.has(params.page_path)) {
      return json({ ok: false, error: "invalid_page_path" }, 400);
    }
    output.page_location = url.origin + params.page_path;
    output.page_title = typeof params.page_title === "string"
      ? params.page_title.slice(0, 100) : "Fingerprint Lab";
  } else if (event === "mp_test_event") {
    output.test_source = "fingerprint_lab";
  } else {
    if (!SECTIONS.has(params.section_id)) {
      return json({ ok: false, error: "invalid_section" }, 400);
    }
    output.section_id = params.section_id;
    output.experiment_id = "section_interest_v1";
    if (event === "section_engagement") {
      if (!Number.isFinite(params.section_duration_seconds) || params.section_duration_seconds < 0 || params.section_duration_seconds > 3600) {
        return json({ ok: false, error: "invalid_duration" }, 400);
      }
      output.section_duration_seconds = Math.round(params.section_duration_seconds);
    }
    if (event === "section_interaction") {
      if (!ACTIONS.has(params.section_action)) {
        return json({ ok: false, error: "invalid_action" }, 400);
      }
      output.section_action = params.section_action;
    }
    if (typeof params.experiment_scenario === "string" &&
        ["casual", "researcher", "proxy", "documentation"].includes(params.experiment_scenario)) {
      output.experiment_scenario = params.experiment_scenario;
    }
    if (params.debug_mode === true) output.debug_mode = true;
  }

  const payload = {
    client_id: incoming.client_id,
    consent: { ad_user_data: "DENIED", ad_personalization: "DENIED" },
    events: [{ name: event, params: output }]
  };
  const country = request.cf?.country;
  if (typeof country === "string" && /^[A-Z]{2}$/.test(country)) {
    payload.user_location = { country_id: country };
  }
  const ua = request.headers.get("user-agent") || "";
  payload.device = { category: /Mobile|Android|iPhone|iPod/i.test(ua) ? "mobile" :
    /iPad|Tablet/i.test(ua) ? "tablet" : "desktop" };
  if (event === "mp_test_event" && incoming.validate === true) {
    payload.validation_behavior = "ENFORCE_RECOMMENDATIONS";
  }
  const validateOnly = event === "mp_test_event" && incoming.validate === true;
  const endpoint = validateOnly ? "/debug/mp/collect" : "/mp/collect";
  const upstreamUrl = new URL("https://region1.google-analytics.com" + endpoint);
  upstreamUrl.searchParams.set("measurement_id", STREAM);
  upstreamUrl.searchParams.set("api_secret", env.GA4_MP_SECRET);

  let response;
  try {
    response = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "manual"
    });
  } catch {
    return json({ ok: false, error: "upstream_unreachable" }, 502);
  }
  if (!response.ok) return json({ ok: false, error: "upstream_http_" + response.status }, 502);
  if (validateOnly) {
    try {
      const result = await response.json();
      return json({ ok: true, validation: result.validationMessages || [] });
    } catch { return json({ ok: false, error: "validation_unreadable" }, 502); }
  }
  // A 2xx means Google received the HTTP request, not that GA4 processed the event.
  return json({ ok: true, accepted_by_endpoint: true, event });
}
