// Shared, opt-in GA4 consent for all Fingerprint Lab pages.
(() => {
  "use strict";

  const KEY = "fingerprint_lab_ga4_consent_v1";
  const GA_ID = "G-F6JRRE08DC";
  const TAG_URL = "/mosaic/";
  let choice = null;
  let started = false;
  let tagLoaded = false;
  let checkGeneration = 0;
  let lines = [];

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

  function log(message) {
    lines.push(new Date().toLocaleTimeString("hr-HR") + "  " + message);
    lines = lines.slice(-25);
    const output = el("gaLog");
    if (output) output.textContent = lines.join("\n");
  }

  function controls() {
    const allowed = choice === "granted";
    const gaCheck = el("gaCheck");
    const probe = el("probeRun");
    if (gaCheck) gaCheck.disabled = !allowed || !tagLoaded;
    // The first-party communication probe remains a separate implementation,
    // but its button in the GA4 diagnostics area follows that area's consent.
    if (probe && el("gaDiagnostics")) probe.disabled = !allowed;
    const adblock = el("adblockStatus");
    if (adblock && !allowed) adblock.hidden = true;
    const status = el("gaStatus");
    if (status && !allowed) {
      status.textContent = choice === "denied"
        ? "GA4: odbijeno. Analitika je isključena."
        : "GA4: čeka odluku o privoli.";
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
    if (choice !== "granted" || started) return;
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
      startGA4();
    } else {
      window["ga-disable-" + GA_ID] = true;
      window.gtag("consent", "update", signal(false));
      clearGACookies();
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
    controls();
    if (choice === "granted") startGA4();
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
