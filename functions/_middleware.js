
export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const started = Date.now();

  // Nastavi na postojeći proxy ili statičku stranicu.
  const response = await context.next();

  const cf = request.cf || {};
  const ua = request.headers.get("user-agent") || "";

  const clientHints = request.headers.get("sec-ch-ua") || "";

  const browser =
    /(?:bot\b|crawler|spider|headlesschrome|facebookexternalhit|curl\/|wget\/|python-requests\/|python-urllib\/|postmanruntime\/|go-http-client\/|node-fetch\/)/i.test(ua) ? "Bot" :
    /EdgA?|EdgiOS/.test(ua) ? "Edge" :
    /SamsungBrowser\//i.test(ua) ? "Samsung Internet" :
    /Brave\//i.test(ua) || /"Brave"\s*;\s*v=/i.test(clientHints) ? "Brave" :
    /Firefox|FxiOS/.test(ua) ? "Firefox/Tor" :
    /Chrome|CriOS/.test(ua) ? "Chrome" :
    /Safari\//.test(ua) ? "Safari" :
    "Other";

  const path = url.pathname.startsWith("/bridge/")
    ? "/bridge"
    : url.pathname.slice(0, 128);

  try {
    if (context.env.TRAFFIC) {
      context.env.TRAFFIC.writeDataPoint({
        indexes: [],
        blobs: [
          path,
          request.method,
          String(response.status),
          cf.country || "unknown",
          String(cf.asn || ""),
          browser,
          request.headers.get("sec-fetch-mode") || "unknown"
        ],
        doubles: [Date.now() - started]
      });
    }
  } catch (error) {
    console.error("Traffic logging error:", error);
  }

  return response;
}
