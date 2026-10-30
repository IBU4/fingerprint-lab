// Shared, opt-in GA4 consent for all Fingerprint Lab pages.
(() => {
  "use strict";

  const KEY = "fingerprint_lab_ga4_consent_v1";
  const GA_ID = "G-F6JRRE08DC";
  const TAG_URL = "/mosaic/";
  const MODE_KEY = "fingerprint_lab_ga4_mode_v1";
  const MP_CLIENT_KEY = "fingerprint_lab_ga4_mp_client_v1";
  const MP_SESSION_KEY = "fingerprint_lab_ga4_mp_session_v1";
  let mode = "tag";
  try { if (localStorage.getItem(MODE_KEY) === "mp") mode = "mp"; } catch {}
  let mpClientMemory = "";
  let mpSessionMemory = null;
  let mpPageSent = false;
  let mpLastEventAt = performance.now();
  let choice = null;
  let started = false;
  let tagLoaded = false;
  let checkGeneration = 0;

  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "granted" || saved === "denied") choice = saved;
  } catch {}

  const signal = granted => ({
    analytics_storage: granted ? "granted" : "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  });
  const el = id => document.getElementById(id);

  // The default consent state is established synchronously in each page's HEAD.
  // Fallback for an outdated page or an interrupted inline bootstrap.
  if (!window.FingerprintLabConsentBootstrapped) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window["ga-disable-" + GA_ID] = true;
    window.gtag("consent", "default", signal(false));
  }

  // Like the tracking simulator: newest event first, fixed scroll pane.
  // Preserve the reader's position when older entries are being reviewed.
  function log(message) {
    const output = el("gaLog");
    if (!output) return;
    if (!output.dataset.logReady) {
      output.textContent = "";
      output.dataset.logReady = "1";
    }
    const oldTop = output.scrollTop;
    const entry = document.createElement("span");
    entry.className = "ga-log-entry";
    entry.textContent = new Date().toLocaleTimeString("hr-HR") + "  " + message;
    output.prepend(entry);
    while (output.childElementCount > 25) output.lastElementChild.remove();
    if (oldTop > 0) output.scrollTop = oldTop + entry.offsetHeight;
  }

  function controls() {
    const allowed = choice === "granted";
    const gaCheck = el("gaCheck");
    const probe = el("probeRun");
    if (gaCheck) gaCheck.disabled = !allowed || mode !== "tag" || !tagLoaded;
    const mpCheck = el("mpCheck");
    if (mpCheck) mpCheck.disabled = !allowed || mode !== "mp";
    const gaMode = el("gaMode");
    if (gaMode) gaMode.value = mode;
    // The first-party communication probe remains a separate implementation,
    // but its button in the GA4 diagnostics area follows that area's consent.
    if (probe && el("gaDiagnostics")) probe.disabled = !allowed;
    const adblock = el("adblockStatus");
    if (adblock && !allowed) adblock.hidden = true;
    const status = el("gaStatus");
    if (status) {
      if (!allowed) {
        status.textContent = choice === "denied"
          ? "GA4: odbijeno. Analitika je isključena."
          : "GA4: čeka odluku o privoli.";
      } else if (mode === "mp") {
        status.textContent = "GA4 MP: aktivan first-party serverski kanal.";
      }
    }
  }

  function adblockStatus(suspected) {
    const status = el("adblockStatus");
    if (status) status.hidden = choice !== "granted" || !suspected;
  }

  function checkGA4() {
    if (choice !== "granted" || !tagLoaded || typeof window.gtag !== "function") {
      log("GET provjera preskočena: tag nije potvrđeno učitan.");
      return;
    }
    log("gtag get(client_id): zahtjev za povratnu vrijednost...");
    const generation = ++checkGeneration;
    let answered = false;
    window.gtag("get", GA_ID, "client_id", value => {
      if (choice !== "granted" || generation !== checkGeneration) return;
      answered = true;
      adblockStatus(!value);
      log(value ? "GET odgovor: client_id postoji (vrijednost nije prikazana)." :
        "GET odgovor: client_id nije dostupan.");
    });
    setTimeout(() => {
      if (!answered && generation === checkGeneration && choice === "granted") {
        log("GET: nema odgovora nakon 5 s (moguće blokiranje ili neinicijaliziran tag).");
        adblockStatus(true);
      }
    }, 5000);
  }

  function startGA4() {
    if (choice !== "granted" || mode !== "tag" || started) return;
    started = true;
    window["ga-disable-" + GA_ID] = false;
    window.gtag("consent", "update", signal(true));
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
    log("Privola GA4: DA.");
    log("Config i automatski page_view dodani u dataLayer (ne potvrđuje slanje).");
    const status = el("gaStatus");
    if (status) status.textContent = "GA4: privola dana; učitavanje pokrenuto.";

    const script = document.createElement("script");
    script.async = true;
    script.src = TAG_URL;
    script.onload = () => {
      tagLoaded = true;
      if (choice !== "granted") return;
      log("gtag.js: ONLOAD (skripta preuzeta i izvršena; HTTP collect još nije potvrđen).");
      if (status) status.textContent = "GA4: gtag.js učitan; prijem podataka nije potvrđen.";
      controls();
      checkGA4();
    };
    script.onerror = () => {
      tagLoaded = false;
      if (choice !== "granted") return;
      log("gtag.js: ONERROR (blokirano ili mrežna pogreška).");
      adblockStatus(true);
      if (status) status.textContent = "GA4: učitavanje blokirano ili neuspješno.";
      controls();
    };
    document.head.appendChild(script);
  }

  function getCookie(name) {
    return document.cookie.split(";").map(x => x.trim())
      .find(x => x.startsWith(name + "="))?.slice(name.length + 1) || "";
  }

  function mpClientId() {
    // Where available, reuse the same identifier GA4 assigned through gtag.
    const ga = getCookie("_ga");
    const match = ga.match(/^GA\d+\.\d+\.(\d{1,10}\.\d{1,10})$/);
    if (match) return match[1];
    if (mpClientMemory) return mpClientMemory;
    try {
      const stored = localStorage.getItem(MP_CLIENT_KEY);
      if (stored && /^\d{1,10}\.\d{1,10}$/.test(stored)) return (mpClientMemory = stored);
      const parts = new Uint32Array(2);
      crypto.getRandomValues(parts);
      mpClientMemory = String(parts[0]) + "." + String(parts[1]);
      localStorage.setItem(MP_CLIENT_KEY, mpClientMemory);
      return mpClientMemory;
    } catch {
      const parts = new Uint32Array(2);
      crypto.getRandomValues(parts);
      return (mpClientMemory = String(parts[0]) + "." + String(parts[1]));
    }
  }

  function gaSessionIdFromCookie() {
    // The GA4 session cookie has both legacy GS1 and newer GS2 formats.
    // Parse only the session start; never forward the cookie itself to the server.
    const cookie = getCookie("_ga_" + GA_ID.slice(2));
    const gs2 = cookie.match(/^GS2\.\d+\.s(\d{9,12})(?:\$|$)/);
    if (gs2) return Number(gs2[1]);
    const gs1 = cookie.match(/^GS1\.\d+\.(\d{9,12})(?:\.|$)/);
    return gs1 ? Number(gs1[1]) : null;
  }

  function mpSessionId() {
    const now = Date.now();
    const taggedSessionId = gaSessionIdFromCookie();
    // Reuse an established GA session while it remains active. MP sends must
    // keep that same ID rather than creating a different session for each page.
    if (taggedSessionId && now >= taggedSessionId * 1000 &&
        now - taggedSessionId * 1000 < 1800000 &&
        (!mpSessionMemory || now - mpSessionMemory.last < 1800000)) {
      mpSessionMemory = { id: taggedSessionId, last: now };
      try { localStorage.setItem(MP_SESSION_KEY, JSON.stringify(mpSessionMemory)); } catch {}
      return taggedSessionId;
    }
    let previous = mpSessionMemory;
    if (!previous) {
      try { previous = JSON.parse(localStorage.getItem(MP_SESSION_KEY)); } catch {}
    }
    if (!previous || !Number.isSafeInteger(previous.id) ||
        !Number.isFinite(previous.last) || now - previous.last > 1800000 ||
        previous.last > now + 60000) {
      previous = { id: Math.floor(now / 1000), last: now };
    } else {
      previous.last = now;
    }
    mpSessionMemory = previous;
    try { localStorage.setItem(MP_SESSION_KEY, JSON.stringify(previous)); } catch {}
    return previous.id;
  }

  async function sendMP(eventName, parameters = {}, validate = false) {
    if (choice !== "granted" || mode !== "mp") return null;
    const now = performance.now();
    const engagement = Math.max(1, Math.min(60000,
      Math.round(now - mpLastEventAt)));
    mpLastEventAt = now;
    const response = await fetch("/ga-mp", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "mp", consent: "granted",
        client_id: mpClientId(), session_id: mpSessionId(),
        event_name: eventName, params: parameters,
        engagement_time_msec: engagement, validate
      })
    });
    let result;
    try { result = await response.json(); } catch { throw new Error("MP: neispravan odgovor."); }
    if (!response.ok || !result.ok) throw new Error("MP: " + (result.error || "HTTP " + response.status));
    return result;
  }

  function mpPageStatus(message) {
    let status = el("mpPageStatus");
    if (!status && mode === "mp" && choice === "granted") {
      const main = document.querySelector("main");
      if (main) {
        status = document.createElement("p");
        status.id = "mpPageStatus";
        status.className = "ga4-consent-footer";
        status.style.marginTop = "6px";
        status.style.fontSize = "12px";
        status.style.color = "#91a4b6";
        status.setAttribute("role", "status");
        main.appendChild(status);
      }
    }
    if (status) status.textContent = message;
  }

  function startMP() {
    if (choice !== "granted" || mode !== "mp" || mpPageSent) return;
    mpPageSent = true;
    log("GA4 MP: privola DA; slanje page_view preko vlastite domene.");
    mpPageStatus("GA4 MP: slanje page_view za " + location.pathname + "…");
    sendMP("page_view", {
      page_path: location.pathname, page_title: document.title
    }).then(result => {
      if (result?.accepted_by_endpoint) {
        log("GA4 MP: page_view HTTP prihvaćen za " + location.pathname +
          " (obrada u GA4 nije potvrđena).");
        mpPageStatus("GA4 MP: page_view za " + location.pathname +
          " — HTTP prihvaćen; obrada u GA4 nije potvrđena.");
      }
    }).catch(error => {
      const message = String(error?.message || error);
      log("GA4 MP: page_view " + location.pathname + " — " + message);
      mpPageStatus("GA4 MP: page_view za " + location.pathname + " — " + message);
    });
  }

  function startAnalytics() {
    if (mode === "mp") startMP();
    else startGA4();
    controls();
  }

  async function checkMP() {
    if (choice !== "granted" || mode !== "mp") return;
    const button = el("mpCheck");
    if (button) button.disabled = true;
    try {
      // Diagnostic only: never display or upload the ID itself.
      const existingGA = /^GA\d+\.\d+\.\d{1,10}\.\d{1,10}$/.test(getCookie("_ga"));
      log("GA4 MP: izvor client_id: " +
        (existingGA ? "postojeći _ga kolačić." : "lokalno generirani MP identifikator."));
      const existingSession = gaSessionIdFromCookie();
      log("GA4 MP: session_id: " +
        (existingSession && Date.now() - existingSession * 1000 < 1800000 &&
          Date.now() >= existingSession * 1000 ? "postojeća GA4 sesija." :
          "samostalna MP sesija (nije povezana s gtag sesijom)."));
      log("GA4 MP: provjera valjanosti testnog događaja...");
      const check = await sendMP("mp_test_event", {}, true);
      if (check.validation?.length) {
        log("GA4 MP: validationMessages = " + JSON.stringify(check.validation).slice(0, 250));
        return;
      }
      log("GA4 MP: validation OK; slanje testa.");
      const actual = await sendMP("mp_test_event");
      if (actual?.accepted_by_endpoint) {
        log("GA4 MP: testni POST prihvaćen; potvrdi događaj mp_test_event u Realtimeu.");
      }
    } catch (error) {
      log("GA4 MP: " + String(error?.message || error));
    } finally { controls(); }
  }

  function switchMode(nextMode) {
    if (!["tag", "mp"].includes(nextMode) || mode === nextMode) return;
    mode = nextMode;
    try { localStorage.setItem(MODE_KEY, nextMode); } catch {}
    // Reload guarantees that two channels never generate duplicate page views.
    location.reload();
  }

  function clearGACookies() {
    const cookies = document.cookie.split(";").map(part => part.trim().split("=")[0])
      .filter(name => name === "_ga" || name.startsWith("_ga_"));
    for (const name of cookies) {
      for (const domain of ["", location.hostname, "." + location.hostname]) {
        document.cookie = name + "=; Max-Age=0; Path=/; SameSite=Lax" +
          (domain ? "; Domain=" + domain : "");
      }
    }
  }

  function decide(next) {
    const previous = choice;
    choice = next;
    try { localStorage.setItem(KEY, next); } catch {}
    const dialog = el("ga4ConsentDialog");
    if (dialog && dialog.open) dialog.close();
    controls();
    if (next === "granted") {
      startAnalytics();
    } else {
      window["ga-disable-" + GA_ID] = true;
      window.gtag("consent", "update", signal(false));
      clearGACookies();
      try {
        localStorage.removeItem(MP_CLIENT_KEY);
        localStorage.removeItem(MP_SESSION_KEY);
      } catch {}
      mpClientMemory = "";
      mpSessionMemory = null;
      log("Privola GA4: NE. Analitika isključena.");
    }
    document.dispatchEvent(new CustomEvent("fingerprintlab:ga-consent", {
      detail: { granted: next === "granted" }
    }));
    // A loaded Google script cannot be unloaded. Reload to stop it cleanly.
    if (previous === "granted" && next === "denied" && started) location.reload();
  }

  function openPreferences() {
    const dialog = el("ga4ConsentDialog");
    if (!dialog) return;
    const close = el("ga4ConsentClose");
    if (close) close.hidden = choice === null;
    if (!dialog.open) dialog.showModal();
  }

  window.FingerprintLabGA4 = {
    hasConsent: () => choice === "granted",
    getMode: () => mode,
    sendEvent: (name, params) => {
      if (choice !== "granted") return;
      if (mode === "mp") {
        sendMP(name, params).catch(error => log(String(error?.message || error)));
      } else if (typeof window.gtag === "function") {
        window.gtag("event", name, params);
      }
    },
    openPreferences
  };

  function setup() {
    const style = document.createElement("style");
    style.textContent =
      ".ga4-dialog{box-sizing:border-box;width:min(510px,calc(100% - 28px));max-height:calc(100dvh - 32px);overflow:auto;" +
      "border:1px solid #45627b;border-radius:16px;background:#152333;color:#eaf1f8;padding:23px;" +
      "box-shadow:0 18px 65px #000a;font-family:system-ui,-apple-system,sans-serif}" +
      ".ga4-dialog::backdrop{background:#000a}" +
      ".ga4-dialog h2{margin:0 0 12px;font-size:21px}" +
      ".ga4-dialog p{margin:0 0 20px;font-size:15px;line-height:1.55;color:#c4d2df}" +
      ".ga4-dialog a{color:#8be7da}" +
      ".ga4-dialog-actions{display:flex;gap:10px;flex-wrap:wrap}" +
      ".ga4-dialog-actions button{flex:1;min-width:130px;min-height:45px;border-radius:9px;" +
      "padding:10px 12px;font:600 15px system-ui;cursor:pointer}" +
      ".ga4-accept{background:#78e4d4;border:1px solid #78e4d4;color:#10272b}" +
      ".ga4-decline,.ga4-close{background:#22364a;border:1px solid #547486;color:#eaf1f8}" +
      ".ga4-consent-footer{margin:24px 0 0;font:13px/1.5 system-ui,sans-serif}" +
      ".ga4-preferences{padding:0;background:none;border:0;text-decoration:underline;" +
      "text-underline-offset:3px;color:#8be7da;cursor:pointer;font:inherit}" +
      "[hidden]{display:none!important}";
    document.head.appendChild(style);

    const dialog = document.createElement("dialog");
    dialog.id = "ga4ConsentDialog";
    dialog.className = "ga4-dialog";
    dialog.setAttribute("aria-labelledby", "ga4ConsentTitle");
    dialog.innerHTML =
      '<h2 id="ga4ConsentTitle">Privatnost i analitika</h2>' +
      '<p>Google Analytics 4 koristimo za statistiku posjeta i korištenja laboratorija. ' +
      'Analitika nije obvezna. <a href="/privacy.html">Više o privatnosti</a>.</p>' +
      '<div class="ga4-dialog-actions">' +
      '<button id="ga4ConsentAccept" type="button" class="ga4-accept">Dopusti analitiku</button>' +
      '<button id="ga4ConsentDecline" type="button" class="ga4-decline">Odbij</button>' +
      '<button id="ga4ConsentClose" type="button" class="ga4-close" hidden>Zatvori</button>' +
      '</div>';
    document.body.appendChild(dialog);
    el("ga4ConsentAccept").addEventListener("click", () => decide("granted"));
    el("ga4ConsentDecline").addEventListener("click", () => decide("denied"));
    el("ga4ConsentClose").addEventListener("click", () => dialog.close());
    dialog.addEventListener("cancel", event => {
      if (choice === null) event.preventDefault();
    });

    const main = document.querySelector("main");
    if (main) {
      const footer = document.createElement("p");
      footer.className = "ga4-consent-footer";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ga4-preferences";
      button.textContent = "Postavke privatnosti";
      button.addEventListener("click", openPreferences);
      footer.appendChild(button);
      main.appendChild(footer);

    }

    const gaCheck = el("gaCheck");
    if (gaCheck) gaCheck.addEventListener("click", checkGA4);
    const mpCheck = el("mpCheck");
    if (mpCheck) mpCheck.addEventListener("click", checkMP);
    const gaMode = el("gaMode");
    if (gaMode) {
      gaMode.value = mode;
      gaMode.addEventListener("change", () => switchMode(gaMode.value));
    }
    controls();
    if (choice === "granted") startAnalytics();
    else if (choice === null && location.pathname !== "/privacy.html") openPreferences();
    else log("Privola GA4: NE. Tag nije učitan.");
    document.dispatchEvent(new CustomEvent("fingerprintlab:ga-consent", {
      detail: { granted: choice === "granted" }
    }));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  } else {
    setup();
  }
})();
