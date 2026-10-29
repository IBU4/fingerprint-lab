// Google tag gateway for this laboratory only.
// Google owns/updates the actual tag; no Google script is stored in this repository.
// This route intentionally does not import or alter the Fingerprint proxy or consent code.

const PATH = "/mosaic";
const TAG_ID = "G-F6JRRE08DC";
const UPSTREAM_HOST = "fps.goog";

export async function onRequest({ request }) {
  const incoming = new URL(request.url);

  if (incoming.pathname !== PATH && !incoming.pathname.startsWith(PATH + "/")) {
    return new Response("Not found", { status: 404 });
  }
  if (!["GET", "HEAD", "POST"].includes(request.method)) {
    return new Response("Method not allowed", {
      status: 405,
      headers: { "allow": "GET, HEAD, POST" }
    });
  }

  // A browser posting measurement events must originate from this site.
  const origin = request.headers.get("origin");
  if (origin && origin !== incoming.origin) {
    return new Response("Forbidden", { status: 403 });
  }

  // Based on Google's documented Cloudflare gateway forwarding specification.
  // Preserve the complete path and query string: the upstream serves both
  // the tag and its measurement endpoints under the same first-party prefix.
  const destination = new URL(incoming);
  destination.protocol = "https:";
  destination.hostname = UPSTREAM_HOST;
  destination.port = "";

  const headers = new Headers(request.headers);
  for (const name of [
    "host", "content-length", "cf-connecting-ip", "cf-connecting-ipv6",
    "x-gtg-tag-id", "x-gtg-implementation", "x-forwarded-for",
    "x-forwarded-country", "x-forwarded-region", "x-forwarded-geolocation"
  ]) headers.delete(name);

  headers.set("X-Gtg-Tag-Id", TAG_ID);
  headers.set("X-Gtg-Implementation", "Snippet");

  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers.set("X-Forwarded-For", clientIp);

  const geo = request.cf || {};
  if (geo.country) headers.set("X-Forwarded-Country", geo.country);
  if (geo.regionCode) headers.set("X-Forwarded-Region", geo.regionCode);
  if (geo.latitude != null && geo.longitude != null) {
    const coordinates = "latlong=" + geo.latitude + "," + geo.longitude;
    const city = geo.city ? ";city=" + geo.city : "";
    headers.set("X-Forwarded-Geolocation", coordinates + city);
  }

  try {
    const upstream = await fetch(new Request(destination.toString(), {
      method: request.method,
      headers,
      body: request.method === "POST" ? request.body : undefined,
      redirect: "follow"
    }));
    return upstream;
  } catch (error) {
    console.error("Measurement gateway upstream failure:", String(error));
    return new Response("Measurement service unavailable", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
    });
  }
}
