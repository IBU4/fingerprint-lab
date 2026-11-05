// Independent Server Lab UI. Does not touch the existing Fingerprint agent,
// modes, proxy, request handlers or the working identification script.
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const ids = ["serverLabEvent", "serverLabToken", "serverLabRun",
    "serverLabCopy", "serverLabSave", "serverLabStatus", "serverLabJson",
    "serverLabDecision", "serverLabRisk", "event"];
  if (ids.some(id => !$(id))) return;

  let running = false;
  let serverResult = null;
  let lastAgentEvent = "";
  let autoSequence = 0;

  const validEventId = value => /^[a-zA-Z0-9._-]{8,128}$/.test(value);
  const updateButtons = () => {
    $("serverLabRun").disabled = running ||
      !validEventId($("serverLabEvent").value.trim()) ||
      !$("serverLabToken").value;
    $("serverLabCopy").disabled = !serverResult;
    $("serverLabSave").disabled = !serverResult;
  };
  const resetServerResult = () => {
    serverResult = null;
    $("serverLabDecision").hidden = true;
    $("serverLabRisk").textContent = "—";
    $("serverLabRisk").className = "score";
    $("serverLabJson").textContent = "Nema dohvaćenog serverskog odgovora.";
    updateButtons();
  };
  // Map the actual Fingerprint Rules Engine decision to the main score label.
  // This never applies the action to HTTP traffic.
  const readRulesetDecision = payload => {
    const action = payload?.rule_action;
    if (!action || typeof action !== "object") return null;
    const type = String(action.type || "").toLowerCase();
    if (type === "block") return "BLOCK 403";
    if (type !== "allow") return null;
    const edits = action.request_header_modifications || {};
    const headers = [...(Array.isArray(edits.set) ? edits.set : []),
      ...(Array.isArray(edits.append) ? edits.append : [])];
    const access = headers.find(header => String(header?.name || "").trim().toLowerCase() === "access");
    const value = String(access?.value || "").trim().toUpperCase();
    return value === "CAPTCHA" || value === "OK" ? value : null;
  };
  // Read activity text from the evaluated rule without executing the rule action.
  function readRulesetActivity(payload) {
    const action = payload?.rule_action;
    if (!action || typeof action !== "object") return null;
    const type = String(action.type || "").toLowerCase();
    if (type === "block")
      return typeof action.body === "string" && action.body.trim() ? action.body : null;
    if (type !== "allow") return null;
    const append = action.request_header_modifications?.append;
    if (!Array.isArray(append)) return null;
    const item = append.find(header =>
      typeof header?.name === "string" && header.name.trim().toLowerCase() === "activity");
    return typeof item?.value === "string" && item.value.trim() ? item.value : null;
  }
  // Shared rendering for automatic and manual Server API lookups.
  const showServerResponse = (payload, eventId) => {
    serverResult = payload;
    const label = readRulesetDecision(payload);
    if (label) {
      const colors = { "OK": "score-ok", "CAPTCHA": "score-captcha", "BLOCK 403": "score-block" };
      $("serverLabRisk").textContent = label;
      $("serverLabRisk").className = "score " + colors[label];
      $("serverLabDecision").hidden = false;
    }
    if (payload?.event_id === eventId) {
      const identity = payload.identification || {};
      window.dispatchEvent(new CustomEvent("fingerprint-lab:ruleset-evaluated", {
        detail: {
          eventId,
          label,
          activity: readRulesetActivity(payload),
          score: typeof payload.suspect_score === "number" ? payload.suspect_score : null,
          confidence: typeof identity.confidence?.score === "number" ? identity.confidence.score : null,
          visitorFound: typeof identity.visitor_found === "boolean" ? identity.visitor_found : null,
          firstSeenAt: identity.first_seen_at ?? null,
          lastSeenAt: identity.last_seen_at ?? null
        }
      }));
    }
    $("serverLabJson").textContent = JSON.stringify(payload, null, 2);
    updateButtons();
  };

  const autoFetch = async (eventId, sequence) => {
    const isCurrent = () => sequence === autoSequence &&
      $("event").textContent.trim() === eventId;
    $("serverLabStatus").textContent = "Automatski dohvat serverskog odgovora…";
    $("serverLabJson").textContent = "Čitanje Fingerprint Server API-ja…";
    // A fresh event can briefly return 404 before becoming available.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, attempt === 1 ? 450 : 1100));
      if (!isCurrent()) return;
      try {
        const response = await fetch("/server-lab/auto", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ event_id: eventId }),
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer"
        });
        const payload = await response.json();
        if (!isCurrent()) return;
        if (response.status === 404 && attempt < 2) {
          $("serverLabStatus").textContent = "Događaj se obrađuje; ponavljam dohvat…";
          continue;
        }
        if (!response.ok) {
          $("serverLabStatus").textContent = "Automatski dohvat nije uspio (HTTP " + response.status + ").";
          $("serverLabJson").textContent = JSON.stringify({ http_status: response.status, ...payload }, null, 2);
          return;
        }
        showServerResponse(payload, eventId);
        $("serverLabStatus").textContent = "Serverski odgovor automatski dohvaćen.";
        return;
      } catch (error) {
        if (!isCurrent()) return;
        $("serverLabStatus").textContent = "Pogreška automatskog dohvata.";
        $("serverLabJson").textContent = (error?.name || "Error") + ": " +
          (error?.message || String(error));
        return;
      }
    }
  };
  const syncAgentEvent = () => {
    const eventId = $("event").textContent.trim();
    if (eventId === lastAgentEvent) return;
    lastAgentEvent = eventId;
    const sequence = ++autoSequence;
    if (!validEventId(eventId)) return;
    $("serverLabEvent").value = eventId;
    resetServerResult();
    void autoFetch(eventId, sequence);
  };
  // Read only the existing result element; never modify the agent or its callbacks.
  new MutationObserver(syncAgentEvent).observe($("event"), {
    childList: true, subtree: true, characterData: true
  });
  syncAgentEvent();
  $("serverLabEvent").addEventListener("input", () => {
    ++autoSequence;
    resetServerResult();
    $("serverLabStatus").textContent = "Ručni Event ID spreman za dohvat.";
  });
  $("serverLabToken").addEventListener("input", updateButtons);

  $("serverLabRun").addEventListener("click", async () => {
    if (running) return;
    const eventId = $("serverLabEvent").value.trim();
    const accessToken = $("serverLabToken").value;
    if (!validEventId(eventId) || !accessToken) return;
    ++autoSequence;
    running = true;
    resetServerResult();
    $("serverLabStatus").textContent = "Dohvat u tijeku…";
    $("serverLabJson").textContent = "Čitanje Fingerprint Server API-ja…";
    updateButtons();
    try {
      const response = await fetch("/server-lab/event", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-server-lab-token": accessToken
        },
        body: JSON.stringify({ event_id: eventId }),
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer"
      });
      const payload = await response.json();
      if (!response.ok) {
        $("serverLabStatus").textContent = "Dohvat nije uspio.";
        $("serverLabJson").textContent = JSON.stringify({
          http_status: response.status,
          ...payload
        }, null, 2);
        return;
      }
      showServerResponse(payload, eventId);
      $("serverLabStatus").textContent = "Server Event dohvaćen. Prikazana su samo polja koja je API vratio.";
    } catch (error) {
      $("serverLabStatus").textContent = "Mrežna ili parserska pogreška.";
      $("serverLabJson").textContent = (error?.name || "Error") + ": " +
        (error?.message || String(error));
    } finally {
      running = false;
      updateButtons();
    }
  });

  $("serverLabCopy").addEventListener("click", async () => {
    if (serverResult) await navigator.clipboard.writeText(JSON.stringify(serverResult, null, 2));
  });
  $("serverLabSave").addEventListener("click", () => {
    if (!serverResult) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(serverResult, null, 2)], {
      type: "application/json"
    }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "server-lab-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  updateButtons();
})();
