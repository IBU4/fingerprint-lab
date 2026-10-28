// Experimental same-origin Pages Functions proxy for Fingerprint Agent v4.
// Not the official Cloudflare integration. The provider may require a proxy secret.
const PUBLIC_KEY = "Frwke9hBtB2iD0ce1G4W";
const DOWNLOAD = new RegExp("^/web/v4/" + PUBLIC_KEY + "(?:/[a-zA-Z0-9._-]+)?/?$");
const LIMIT_BYTES = 262144;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status, headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

export async function onRequest({ request, env }) {
  const incoming = new URL(request.url);
  const relativePath = incoming.pathname.slice("/bridge".length) || "/";

  if (request.method === "GET" && relativePath === "/status") {
    return json({
      ok: true,
      implementation: "experimental Pages Functions proxy",
      region: "eu",
      vendorProxySecretConfigured: !!env.PROXY_SECRET,
      routes: "agent GET and v4 API POST"
    });
  }

  const isScript = request.method === "GET" && DOWNLOAD.test(relativePath);
  // Agent v4 can POST to different API subpaths; the original proxy incorrectly
  // accepted only POST / and silently discarded the query string.
  const isIdentification = request.method === "POST" &&
    /^\/(?:[a-zA-Z0-9._~-]+\/)*[a-zA-Z0-9._~-]*$/.test(relativePath) &&
    !relativePath.startsWith("/web/");

  if (!isScript && !isIdentification) {
    return json({ error: "unsupported_route", method: request.method, path: relativePath }, 404);
  }

  if (isIdentification) {
    const origin = request.headers.get("origin");
    if (origin && origin !== incoming.origin)
      return json({ error: "cross_origin_request_not_permitted" }, 403);
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > LIMIT_BYTES)
      return json({ error: "request_too_large" }, 413);
  }

  const target = new URL("https://" + (isScript ? "api.fpjs.io" : "eu.api.fpjs.io") + relativePath);
  // Keep the public agent request parameters, including any API key, nonce,
  // endpoint metadata and session markers supplied by the v4 agent.
  target.search = incoming.search;
  if (isIdentification) target.searchParams.set("region", "eu");

  const headers = new Headers(request.headers);
  const cookieHeader = headers.get("cookie") || "";
  headers.delete("cookie");
  const iid = cookieHeader.split(";").map(x => x.trim()).find(x => x.startsWith("_iidt="));
  if (iid) headers.set("cookie", iid);
  for (const name of [
    "authorization","host","origin","referer","content-length","cf-connecting-ip",
    "FPJS-Proxy-Secret","FPJS-Proxy-Client-IP","FPJS-Proxy-Forwarded-Host"
  ]) headers.delete(name);

  if (isIdentification) {
    const cfIP = request.headers.get("cf-connecting-ip") || "";
    const pseudo = request.headers.get("cf-pseudo-ipv4");
    const clientIP = cfIP && cfIP === pseudo ? (request.headers.get("cf-connecting-ipv6") || "") : cfIP;
    headers.set("FPJS-Proxy-Client-IP", clientIP);
    headers.set("FPJS-Proxy-Forwarded-Host", incoming.hostname);
    if (env.PROXY_SECRET) headers.set("FPJS-Proxy-Secret", env.PROXY_SECRET);
  }

  try {
    const response = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: isIdentification ? request.body : undefined,
      redirect: "follow"
    });
    // Retain the original API response and make status observable in Network.
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("strict-transport-security");
    responseHeaders.delete("access-control-allow-origin");
    responseHeaders.delete("access-control-allow-credentials");
    responseHeaders.set("x-lab-upstream-status", String(response.status));
    responseHeaders.set("x-content-type-options", "nosniff");
    if (isIdentification) responseHeaders.set("cache-control", "no-store");
    console.log("fingerprint-lab proxy", request.method, relativePath, "upstream:", response.status);
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    console.error("fingerprint-lab upstream error", request.method, relativePath, String(error));
    return json({ error: "upstream_unavailable", message: String(error?.message || error) }, 502);
  }
}
