// Experimental same-origin proxy for Fingerprint Agent v4 on Cloudflare Pages.
// NOT the official Fingerprint Cloudflare integration.
// No arbitrary destinations, no dashboard secret in source code.
// The upstream may reject requests without the vendor-issued proxy secret.
const PUBLIC_KEY = "Frwke9hBtB2iD0ce1G4W";
const SAFE_SCRIPT = new RegExp("^/web/v4/" + PUBLIC_KEY + "(?:/[a-zA-Z0-9._-]+)?/?$");

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
  });
}

export async function onRequest({ request, env }) {
  const incoming = new URL(request.url);
  const prefix = "/bridge";
  const relativePath = incoming.pathname.slice(prefix.length) || "/";

  if (request.method === "GET" && relativePath === "/status") {
    return json({ ok: true, mode: "experimental-same-origin", region: "eu", authorized: Boolean(env.PROXY_SECRET) });
  }

  const scriptRequest = request.method === "GET" && SAFE_SCRIPT.test(relativePath);
  const idRequest = request.method === "POST" && (relativePath === "/" || relativePath === "");

  if (!scriptRequest && !idRequest) {
    return json({ error: "unsupported_route_or_method" }, 404);
  }

  if (idRequest) {
    const origin = request.headers.get("origin");
    if (origin && origin !== incoming.origin) {
      return json({ error: "cross_origin_request_not_permitted" }, 403);
    }
    const len = Number(request.headers.get("content-length") || "0");
    if (len > 262144) return json({ error: "request_too_large" }, 413);
  }

  const upstream = scriptRequest
    ? new URL("https://api.fpjs.io" + relativePath)
    : new URL("https://eu.api.fpjs.io/");

  if (idRequest) {
    // The region is fixed to the EU workspace.
    upstream.searchParams.set("region", "eu");
  }

  const headers = new Headers(request.headers);
  // Do not forward site cookies, credentials, or spoofed fingerprint proxy headers.
  const cookieHeader = headers.get("cookie") || "";
  headers.delete("cookie");
  const iidCookie = cookieHeader.split(";").map(x => x.trim()).find(x => x.startsWith("_iidt="));
  if (iidCookie) headers.set("cookie", iidCookie);
  headers.delete("authorization");
  headers.delete("host");
  headers.delete("origin");
  headers.delete("referer");
  headers.delete("FPJS-Proxy-Secret");
  headers.delete("FPJS-Proxy-Client-IP");
  headers.delete("FPJS-Proxy-Forwarded-Host");

  if (idRequest) {
    const cfIP = request.headers.get("cf-connecting-ip") || "";
    const pseudo = request.headers.get("cf-pseudo-ipv4");
    const clientIP = cfIP && cfIP === pseudo ? (request.headers.get("cf-connecting-ipv6") || "") : cfIP;
    headers.set("FPJS-Proxy-Client-IP", clientIP);
    headers.set("FPJS-Proxy-Forwarded-Host", incoming.hostname);
    if (env.PROXY_SECRET) headers.set("FPJS-Proxy-Secret", env.PROXY_SECRET);
  }

  try {
    const response = await fetch(upstream.toString(), {
      method: request.method,
      headers,
      body: idRequest ? request.body : undefined,
      redirect: "follow",
    });
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("strict-transport-security");
    responseHeaders.delete("access-control-allow-origin");
    responseHeaders.delete("access-control-allow-credentials");
    responseHeaders.set("x-content-type-options", "nosniff");
    if (idRequest) responseHeaders.set("cache-control", "no-store");

    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    return json({ error: "upstream_unavailable", message: String(error && error.message || error) }, 502);
  }
}
