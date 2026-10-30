// Beacon and fetch comparison, triggered only on a button press.
// No analytics, external endpoints, or persistent browser identifiers.
(() => {
  "use strict";

  const button = document.getElementById("probeRun");
  const status = document.getElementById("probeStatus");
  const output = document.getElementById("probeResults");
  if (!button || !status || !output) return;
  const compact = button.hasAttribute("data-compact");

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const endpoint = id => "/delivery-probe?id=" + encodeURIComponent(id);

  async function confirmed(id) {
    const response = await fetch(endpoint(id), { cache: "no-store", credentials: "omit" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = await response.json();
    return data.received === true;
  }

  async function poll(id) {
    for (let i = 0; i < 13; i++) {
      await sleep(500);
      if (await confirmed(id)) return true;
    }
    return false;
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    status.hidden = false;
    output.hidden = false;
    status.textContent = "Provjera u tijeku...";
    output.textContent = "Čekanje potvrde poslužitelja...";

    try {
      if (typeof navigator.sendBeacon !== "function") {
        status.textContent = "Beacon API nije dostupan.";
        output.textContent = "Ovaj preglednik ne izlaže navigator.sendBeacon().";
        return;
      }
      if (!crypto.randomUUID) {
        status.textContent = "Nedostaje generator testnih oznaka.";
        return;
      }

      const beaconId = crypto.randomUUID();
      const fetchId = crypto.randomUUID();
      const beaconQueued = navigator.sendBeacon(endpoint(beaconId), "probe");
      let fetchResponse = "nije pokrenut";
      try {
        const response = await fetch(endpoint(fetchId), {
          method: "POST",
          body: "probe",
          credentials: "omit",
          cache: "no-store",
          headers: { "Content-Type": "text/plain" }
        });
        fetchResponse = "HTTP " + response.status;
      } catch (error) {
        fetchResponse = "pogreška: " + String(error?.message || error);
      }

      let beaconReceived = false;
      let fetchReceived = false;
      let lookupError = "";
      try {
        const results = await Promise.all([poll(beaconId), poll(fetchId)]);
        [beaconReceived, fetchReceived] = results;
      } catch (error) {
        lookupError = String(error?.message || error);
      }

      const lines = [
        "Beacon poziv prihvaćen u red: " + (beaconQueued ? "DA" : "NE"),
        "Beacon primljen na Cloudflare: " + (beaconReceived ? "DA" : "NIJE POTVRĐENO"),
        "Kontrolni fetch POST: " + fetchResponse,
        "Kontrolni fetch primljen: " + (fetchReceived ? "DA" : "NIJE POTVRĐENO")
      ];

      if (lookupError) {
        status.textContent = "Provjera poslužitelja nije uspjela.";
        lines.push("Dohvat potvrde: " + lookupError);
      } else if (beaconReceived && fetchReceived) {
        status.textContent = "Beacon i fetch uspješno primljeni.";
        lines.push("Zaključak: oba načina rade za ovaj first-party endpoint.");
      } else if (!beaconReceived && fetchReceived) {
        status.textContent = "Beacon nije primljen; fetch radi.";
        lines.push("Zaključak: moguć je Beacon-specifičan blok. Ponovi s NoScript ping ON/OFF.");
      } else {
        status.textContent = "Neodređen rezultat.";
        lines.push("Zaključak: bez potvrde kontrolnog fetch zahtjeva nije moguće pripisati uzrok Beaconu.");
      }
      if (compact) {
        // A missing confirmation is an indicator, not proof of adblocking.
        const suspected = !beaconReceived || !fetchReceived;
        status.textContent = lookupError
          ? "Provjera nije uspjela"
          : suspected ? "Adblocking detected / suspected" : "Komunikacija: OK";
        output.textContent = lookupError
          ? "Potvrda poslužitelja nije dostupna."
          : "Beacon: " + (beaconReceived ? "OK" : "nije potvrđen") +
            " · fetch: " + (fetchReceived ? "OK" : "nije potvrđen") +
            " (testni poslužitelj).";
      } else {
        output.textContent = lines.join("\n");
      }
    } catch (error) {
      status.textContent = "Test se nije mogao dovršiti.";
      output.textContent = String(error?.message || error);
    } finally {
      button.disabled = false;
    }
  });
})();
