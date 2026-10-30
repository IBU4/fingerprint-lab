// Isolated, opt-in Beacon delivery probe. No analytics or identifiers.
// Receipt markers are random, short-lived, and stored only in the local Cloudflare edge cache.
const RECEIPT_TTL_SECONDS = 75;

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return new Response(JSON.stringify({ error: "invalid_test_id" }), { status: 400, headers });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...headers, Allow: "GET, POST" }
    });
  }

  const receiptKey = new Request(new URL("/__probe_receipt/" + id, url.origin).toString());
  const cache = caches.default;

  if (request.method === "POST") {
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) {
      return new Response(JSON.stringify({ error: "invalid_origin" }), { status: 403, headers });
    }
    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > 256) {
      return new Response(JSON.stringify({ error: "payload_too_large" }), { status: 413, headers });
    }
    try {
      await cache.put(receiptKey, new Response("received", {
        status: 200,
        headers: { "Cache-Control": "public, max-age=" + RECEIPT_TTL_SECONDS }
      }));
    } catch (error) {
      console.error("Delivery probe receipt unavailable:", String(error));
      return new Response(JSON.stringify({ error: "receipt_unavailable" }), { status: 503, headers });
    }
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const match = await cache.match(receiptKey);
    return new Response(JSON.stringify({ received: !!match }), { status: 200, headers });
  } catch (error) {
    console.error("Delivery probe lookup unavailable:", String(error));
    return new Response(JSON.stringify({ error: "receipt_lookup_unavailable" }), { status: 503, headers });
  }
}
