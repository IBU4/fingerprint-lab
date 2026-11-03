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
  // Display score-only risk bands. The raw Server API response is unchanged.
  const showScoreRisk = payload => {
    const score = Number(payload?.suspect_score);
    if (payload?.suspect_score === null || payload?.suspect_score === undefined ||
        payload?.suspect_score === "" || !Number.isFinite(score) || score < 0) return;
    const label = score <= 20 ? "OK" : score <= 30 ? "CAPTCHA" : "HIGH RISK";
    const color = score <= 20 ? "score-ok" : score <= 30 ? "score-captcha" : "score-block";
    $("serverLabRisk").textContent = label;
    $("serverLabRisk").className = "score " + color;
    $("serverLabDecision").hidden = false;
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
  const syncAgentEvent = () => {
    const eventId = $("event").textContent.trim();
    if (eventId === lastAgentEvent) return;
    lastAgentEvent = eventId;
    if (!validEventId(eventId)) return;
    $("serverLabEvent").value = eventId;
    resetServerResult();
    $("serverLabStatus").textContent = "Event ID iz posljednje identifikacije spreman.";
  };
  // Read only the existing result element; never modify the agent or its callbacks.
  new MutationObserver(syncAgentEvent).observe($("event"), {
    childList: true, subtree: true, characterData: true
  });
  syncAgentEvent();
  $("serverLabEvent").addEventListener("input", () => {
    resetServerResult();
    $("serverLabStatus").textContent = "Ručni Event ID spreman za dohvat.";
  });
  $("serverLabToken").addEventListener("input", updateButtons);

  $("serverLabRun").addEventListener("click", async () => {
    if (running) return;
    const eventId = $("serverLabEvent").value.trim();
    const accessToken = $("serverLabToken").value;
    if (!validEventId(eventId) || !accessToken) return;
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
      serverResult = payload;
      showScoreRisk(payload);
      // Historical lookup stays read-only; only a matching visible event is updated.
      const label = readRulesetDecision(payload);
      if (label && payload?.event_id === eventId) {
        window.dispatchEvent(new CustomEvent("fingerprint-lab:ruleset-evaluated", {
          detail: {
            eventId,
            label,
            score: typeof payload.suspect_score === "number" ? payload.suspect_score : null
          }
        }));
      }
      $("serverLabJson").textContent = JSON.stringify(payload, null, 2);
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
