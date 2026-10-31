// Independent tracker-start verification. No extra button, no GA4/FP Pro IDs.
(() => {
  "use strict";
  const startButton = document.getElementById("startBtn");
  const status = document.getElementById("trackerCheckStatus");
  if (!startButton || !status) return;

  let current = null;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function request(action, attempt) {
    const options = {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: attempt ? {"X-Probe-Attempt": attempt} : {}
    };
    const response = await fetch("/tracker-check/" + action, options);
    if (!response.ok) {
      let error = "HTTP " + response.status;
      try { error = (await response.json()).error || error; } catch {}
      throw new Error(error);
    }
    if (action === "mark") return;
    return response.json();
  }

  // Called only by the original tracker start() after its local initialization.
  window.trackerProbeMark = () => {
    const state = current;
    if (!state || state.markPromise) return;
    state.markPromise = state.init.then(({attempt}) => request("mark", attempt));
  };

  startButton.addEventListener("click", () => {
    if (current?.busy) return;
    const state = {busy: true, markPromise: null, init: request("prepare")};
    current = state;
    status.textContent = "Provjera 1P trackera...";
    status.style.color = "#9bd7ff";

    (async () => {
      try {
        const {attempt} = await state.init;
        // Give the original synchronous start() listener time to run.
        await delay(200);
        if (state.markPromise) {
          // Do not wait indefinitely when a blocker stalls the tracking request.
          await Promise.race([state.markPromise.catch(() => null), delay(3500)]);
        } else {
          await delay(800);
        }
        const {received} = await request("verify", attempt);
        if (current !== state) return;
        status.textContent = received
          ? "1P tracker: komunikacija potvrđena."
          : "Adblocking detected / suspected — 1P tracker nije potvrđen.";
        status.style.color = received ? "#85edbd" : "#ffb86c";
      } catch (error) {
        if (current !== state) return;
        status.textContent = "Provjera trackera trenutačno nije dostupna.";
        status.style.color = "#ffb86c";
      } finally {
        state.busy = false;
      }
    })();
  }, true);
})();
