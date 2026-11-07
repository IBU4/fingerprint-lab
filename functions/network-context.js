// Displays the requester's network context after they start the tracking simulator.
// No persistent storage or third-party lookups; existing middleware logs only
// HTTP status/path and coarse country/ASN, never this response's IP address.
export function onRequestGet({ request }) {
  const cf = request.cf || {};
  const body = {
    ip: request.headers.get("cf-connecting-ip") || null,
    country: typeof cf.country === "string" ? cf.country : null,
    asn: Number.isSafeInteger(cf.asn) && cf.asn > 0 ? cf.asn : null,
    asOrganization: typeof cf.asOrganization === "string" ? cf.asOrganization : null
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin"
    }
  });
}
