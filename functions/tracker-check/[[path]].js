// Optional, user-initiated tracking start check. Stores only a random session key,
// the active attempt key and a boolean. Never stores VID, UA, IP, or event details.
const COOKIE_NAME = "__Host-tracker_probe_session";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = () => ({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
});
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {status, headers: {...headers(), ...extra}});
}
function cookieValue(raw) {
  const value = (raw || "").split(";").map(v => v.trim()).find(v => v.startsWith(COOKIE_NAME + "="));
  return value ? value.slice(COOKIE_NAME.length + 1) : null;
}
export async function onRequest({request, env}) {
  const url = new URL(request.url);
  const action = url.pathname.slice("/tracker-check/".length);
  if (!["prepare", "mark", "verify"].includes(action)) return json({error:"not_found"}, 404);
  if (request.method !== "POST") return json({error:"method_not_allowed"}, 405, {Allow:"POST"});
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if ((origin && origin !== url.origin) || (fetchSite && !["same-origin","none"].includes(fetchSite))) {
    return json({error:"forbidden"}, 403);
  }
  if (!env.TRACKER_DB) return json({error:"database_unavailable"}, 503);
  let sid = cookieValue(request.headers.get("Cookie"));
  if (!UUID.test(sid || "")) sid = null;
  try {
    if (action === "prepare") {
      const newSession = !sid;
      if (!sid) sid = crypto.randomUUID();
      const attempt = crypto.randomUUID();
      await env.TRACKER_DB.prepare(
        "INSERT INTO tracker_probe (session_id, attempt_id, value) VALUES (?1, ?2, 0) " +
        "ON CONFLICT(session_id) DO UPDATE SET attempt_id = excluded.attempt_id, value = 0"
      ).bind(sid, attempt).run();
      const extra = newSession
        ? {"Set-Cookie": COOKIE_NAME + "=" + sid + "; Path=/; Secure; HttpOnly; SameSite=Lax"}
        : {};
      return json({attempt}, 200, extra);
    }
    if (!sid) return json({error:"session_missing"}, 409);
    if (action === "mark") {
      const attempt = request.headers.get("X-Probe-Attempt") || "";
      if (!UUID.test(attempt)) return json({error:"invalid_attempt"}, 400);
      await env.TRACKER_DB.prepare(
        "UPDATE tracker_probe SET value = 1 WHERE session_id = ?1 AND attempt_id = ?2"
      ).bind(sid, attempt).run();
      return new Response(null, {status:204, headers:{"Cache-Control":"no-store"}});
    }
    // Read and delete the attempt atomically. A late mark cannot recreate
    // a deleted row. The session cookie may be reused for the next test.
    const attempt = request.headers.get("X-Probe-Attempt") || "";
    if (!UUID.test(attempt)) return json({error:"invalid_attempt"}, 400);
    const results = await env.TRACKER_DB.batch([
      env.TRACKER_DB.prepare(
        "SELECT value FROM tracker_probe WHERE session_id = ?1 AND attempt_id = ?2"
      ).bind(sid, attempt),
      env.TRACKER_DB.prepare(
        "DELETE FROM tracker_probe WHERE session_id = ?1 AND attempt_id = ?2"
      ).bind(sid, attempt)
    ]);
    const row = results[0]?.results?.[0];
    if (!row) return json({error:"attempt_not_found"}, 409);
    return json({received: row.value === 1});
  } catch (error) {
    console.error("Tracker check backend failure:", String(error));
    return json({error:"database_error"}, 503);
  }
}
