// First-party GA4 Measurement Protocol experiment (web stream, EU endpoint).
// API secret never leaves the Cloudflare server. Explicit opt-in only.
const STREAM = "G-F6JRRE08DC";
// Explicit action event names make user journeys readable in GA4 Path Exploration.
const ACTION_EVENTS = new Set([
  "fp_select_direct", "fp_select_proxy", "ga4_mode_change", "fp_test_run",
  "tracker_start", "fingerprintjs_run", "fp_server_fetch",
  "json_view", "json_copy", "json_save", "vid_copy"
]);
const JSON_ORIGINS = new Set(["fingerprint_pro", "server_lab", "tracking_simulator", "fingerprintjs_oss"]);
const ALLOWED = new Set(["page_view", "section_view", "section_engagement", "section_interaction", "mp_test_event", ...ACTION_EVENTS]);
// Cloudflare Pages serves HTML files using extensionless canonical paths.
const PAGES = new Set([
  "/", "/index", "/index.html",
  "/tracking-simulator", "/tracking-simulator.html",
  "/fingerprintjs-raw", "/fingerprintjs-raw.html",
  "/beacon-test", "/beacon-test.html",
  "/privacy", "/privacy.html"
]);
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
    // Show only diagnostic tests in GA4 DebugView, not production analytics events.
    output.debug_mode = true;
  } else if (ACTION_EVENTS.has(event)) {
    // Accept only predefined action metadata. Never forward identifiers, tokens or JSON.
    if (typeof params.section_id === "string") {
      if (!SECTIONS.has(params.section_id)) return json({ ok: false, error: "invalid_section" }, 400);
      output.section_id = params.section_id;
    }
    if (event === "ga4_mode_change") {
      if (!["tag", "mp"].includes(params.ga4_channel)) {
        return json({ ok: false, error: "invalid_ga4_channel" }, 400);
      }
      output.ga4_channel = params.ga4_channel;
    }
    if (event === "fingerprintjs_run") {
      if (!["start", "rerun"].includes(params.test_action)) {
        return json({ ok: false, error: "invalid_test_action" }, 400);
      }
      output.test_action = params.test_action;
    }
    if (["json_view", "json_copy", "json_save"].includes(event)) {
      if (!JSON_ORIGINS.has(params.action_origin)) {
        return json({ ok: false, error: "invalid_action_origin" }, 400);
      }
      output.action_origin = params.action_origin;
    }
    if (typeof params.experiment_scenario === "string" &&
        ["casual", "researcher", "proxy", "documentation"].includes(params.experiment_scenario)) {
      output.experiment_scenario = params.experiment_scenario;
    }
    if (params.debug_mode === true) output.debug_mode = true;
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
  if (typeof country === "string" && /^[A-Z]{2}$/.test(country) && country !== "XX") {
    payload.user_location = { country_id: country };
  } else {
    // T1 (Tor), XX (unknown), or missing country: let GA4 geolocate the exit IP.
    const clientIp = request.headers.get("cf-connecting-ip");
    if (clientIp) payload.ip_override = clientIp;
  }
  // GA4 supports user_agent as an alternative to the optional structured device object.
  // Do not send an incomplete device object: strict validation requires device.model.
  const ua = request.headers.get("user-agent") || "";
  if (ua) payload.user_agent = ua.slice(0, 500);
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
