
export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const started = Date.now();

  // Nastavi na postojeći proxy ili statičku stranicu.
  const response = await context.next();

  const cf = request.cf || {};
  const ua = request.headers.get("user-agent") || "";

  const browser =
    /EdgA?|EdgiOS/.test(ua) ? "Edge" :
    /Firefox|FxiOS/.test(ua) ? "Firefox/Tor" :
    /Chrome|CriOS/.test(ua) ? "Chrome" :
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
