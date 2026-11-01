// Consent-gated GA4 section interest experiment for the existing Fingerprint Lab.
// No Fingerprint IDs, event IDs, tokens, form contents, or JSON results are sent.
(() => {
  "use strict";

  // This page uses the shared, site-wide GA4 consent manager.
  if (!window.FingerprintLabGA4) return;

  const definitions = [
    ["identification", "#run"],
    ["results", "#visitor"],
    ["server_lab_and_response", "#serverLabEvent"],
    ["tracking_simulator", "#custom-tracking"],
    ["raw_components", "#fingerprintjs-raw"],
    ["documentation", "#about-lab"]
  ];
  const sections = definitions.map(([id, selector]) => {
    const element = document.querySelector(selector)?.closest("section");
    return element ? { id, element, visibleMs: 0, pendingMs: 0, entered: false } : null;
  }).filter(Boolean);

  const query = new URLSearchParams(location.search);
  const scenarios = new Set(["casual", "researcher", "proxy", "documentation"]);
  const scenario = query.get("scenario");
  const metadata = { experiment_id: "section_interest_v1" };
  if (scenarios.has(scenario)) metadata.experiment_scenario = scenario;
  if (query.get("ga_debug") === "1") metadata.debug_mode = true;

  let enabled = false;
  let lastSample = performance.now();
  const MIN_VIEW_MS = 1000;
  const FLUSH_MS = 10000;
  const MIN_REPORT_SECONDS = 2;

  function permitted() {
    return window.FingerprintLabGA4.hasConsent() &&
      typeof window.FingerprintLabGA4.sendEvent === "function";
  }

  function emit(eventName, parameters) {
    if (!enabled || !permitted()) return;
    window.FingerprintLabGA4.sendEvent(eventName, { ...metadata, ...parameters });
  }

  function sufficientlyVisible(element) {
    if (document.visibilityState !== "visible") return false;
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    if (rect.height <= 0 || viewportHeight <= 0) return false;
    const visibleHeight = Math.max(0,
      Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
    // A long section must occupy at least half the viewport; a short section
    // must have at least half of itself visible.
    return visibleHeight >= 0.5 * Math.min(rect.height, viewportHeight);
  }

  function flush(section) {
    if (section.entered) {
      const seconds = Math.floor(section.pendingMs / 1000);
      if (seconds >= MIN_REPORT_SECONDS) {
        emit("section_engagement", {
          section_id: section.id,
          section_duration_seconds: seconds
        });
        section.pendingMs -= seconds * 1000;
      }
    }
  }

  function sample() {
    const now = performance.now();
    const elapsed = Math.max(0, Math.min(now - lastSample, 1250));
    lastSample = now;
    if (!enabled) return;

    for (const section of sections) {
      if (sufficientlyVisible(section.element)) {
        section.visibleMs += elapsed;
        section.pendingMs += elapsed;
        if (!section.entered && section.visibleMs >= MIN_VIEW_MS) {
          section.entered = true;
          emit("section_view", { section_id: section.id });
        }
        if (section.entered && section.pendingMs >= FLUSH_MS) flush(section);
      } else {
        flush(section);
        section.visibleMs = 0;
        section.pendingMs = 0;
        section.entered = false;
      }
    }
  }

  function reset() {
    enabled = false;
    for (const section of sections) {
      section.visibleMs = 0;
      section.pendingMs = 0;
      section.entered = false;
    }
  }

  function syncConsent() {
    if (!permitted()) {
      // Withdrawal discards unsent measurements and suppresses all new events.
      reset();
      return;
    }
    reset();
    enabled = true;
    lastSample = performance.now();
  }

  document.addEventListener("fingerprintlab:ga-consent", syncConsent);
  if (permitted()) syncConsent();

  setInterval(sample, 1000);
  document.addEventListener("visibilitychange", sample);
  window.addEventListener("pagehide", () => {
    sample();
    for (const section of sections) {
      flush(section);
      section.visibleMs = 0;
      section.pendingMs = 0;
      section.entered = false;
    }
  });
  window.addEventListener("pageshow", () => {
    lastSample = performance.now();
  });

  // One named event per important button; retain section_interaction for diagnostics/links.
  const clicks = {
    run: ["fp_test_run", { section_id: "identification" }],
    gaCheck: ["section_interaction", { section_id: "identification", section_action: "check_ga4_tag" }],
    copy: ["vid_copy", { section_id: "results" }],
    save: ["json_save", { section_id: "results", action_origin: "fingerprint_pro" }],
    serverLabRun: ["fp_server_fetch", { section_id: "server_lab_and_response" }],
    serverLabCopy: ["json_copy", { section_id: "server_lab_and_response", action_origin: "server_lab" }],
    serverLabSave: ["json_save", { section_id: "server_lab_and_response", action_origin: "server_lab" }]
  };

  document.querySelector("main")?.addEventListener("click", event => {
    const target = event.target;
    if (!enabled || !permitted() || !(target instanceof Element)) return;
    const button = target.closest("button");
    if (button && !button.disabled && clicks[button.id]) {
      const [eventName, params] = clicks[button.id];
      emit(eventName, params);
      return;
    }
    const anchor = target.closest("a[href]");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    const destinations = {
      "/tracking-simulator.html": ["tracking_simulator", "open_simulator"],
      "/fingerprintjs-raw.html": ["raw_components", "open_raw_components"],
      "/privacy.html": ["documentation", "open_privacy"]
    };
    if (destinations[href]) {
      const [section_id, section_action] = destinations[href];
      emit("section_interaction", { section_id, section_action });
    } else if (anchor.closest("#about-lab")) {
      emit("section_interaction", { section_id: "documentation",
        section_action: "open_reference" });
    }
  });

  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener("change", () => {
      if (radio.checked && ["direct", "proxy"].includes(radio.value)) {
        emit("fp_select_" + radio.value, { section_id: "identification" });
      }
    });
  });
  // The GA4 channel selector reloads the page. Queue its action in this tab,
  // then report after reload using the newly selected channel. Consent logic is unchanged.
  const MODE_EVENT_KEY = "fingerprint_lab_ga4_mode_event_pending_v1";
  const channelSelect = document.getElementById("gaMode");
  channelSelect?.addEventListener("change", () => {
    const next = channelSelect.value;
    if (!permitted() || !["mp", "tag"].includes(next) ||
        next === window.FingerprintLabGA4.getMode()) return;
    try { sessionStorage.setItem(MODE_EVENT_KEY, next); } catch {}
  });
  document.addEventListener("DOMContentLoaded", () => {
    let pending = null;
    try {
      pending = sessionStorage.getItem(MODE_EVENT_KEY);
      sessionStorage.removeItem(MODE_EVENT_KEY);
    } catch {}
    if (permitted() && pending === window.FingerprintLabGA4.getMode()) {
      emit("ga4_mode_change", { ga4_channel: pending });
    }
  }, { once: true });

  document.getElementById("gaDiagnostics")?.addEventListener("toggle", event => {
    if (event.currentTarget.open) {
      emit("section_interaction", {
        section_id: "identification", section_action: "open_ga_diagnostics"
      });
    }
  });
})();
