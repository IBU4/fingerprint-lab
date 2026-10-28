# Fingerprint Lab


**[Launch the live Fingerprint Lab test](https://fingerprint-lab.pages.dev/)**
Independent, opt-in browser identification laboratory. Not affiliated with Fingerprint.

## Tests and pages

- [Main lab](index.html): Fingerprint Pro Direct vs 1P Proxy, optional consent-based GA4 with diagnostics and suspected adblocking indicator.
- [1P Custom Tracking Simulator](tracking-simulator.html): first-party demo ID, FingerprintJS OSS, local behavioral events and session JSON. Demo events are not uploaded; ID is stored in cookie and localStorage.
- [Privacy and data processing](privacy.html): description of current behavior and outstanding information required for a complete GDPR notice.

## Fingerprint Pro: two routes.

The entire test UI is in **[index.html](index.html)**:

- **Direct**: import Fingerprint Pro Agent v4 from the Fingerprint CDN and use its direct EU endpoint.
- **1P Proxy**: import the same Agent v4 through the Cloudflare Pages Function route `/bridge/web/v4/…` and send the identification request through `/bridge/?region=eu`.

Select a mode and manually start identification. The SDK is **not imported before a user action**. Each mode keeps its latest result in memory. The on-page history labels which mode produced each VID. Copy VID and export JSON are available in both modes. Data is not saved to localStorage.

**Live URL:** https://fingerprint-lab.pages.dev/

The older `/proxy` and `/proxy.html` URLs redirect to `/?mode=proxy` via small Pages Functions. The former proxy URL is not a separate Fingerprint Pro test page; the tracking simulator is a separate page.

## Cloudflare deployment

The repository is deployed through Cloudflare Pages Git integration. Static output directory is the repository root. Commits to `main` trigger deployments.

- `functions/bridge/[[path]].js`: experimental same-origin proxy for public Agent download and EU identification requests.
- `functions/bridge/index.js`: routes the proxy root.
- `functions/_middleware.js`: server-side HTTP request metadata recorded through Cloudflare Analytics Engine when the `TRAFFIC` binding exists; this middleware runs on requests regardless of the visitor's Fingerprint/GA4 consent.
- `_routes.json`: routes application requests through Pages Functions to support middleware.

The `PROXY_SECRET` binding **must be a Cloudflare Pages Production Secret** containing the vendor-issued Fingerprint **Proxy Key**, never a client-visible JavaScript value or a GitHub secret committed in source.

Open `https://fingerprint-lab.pages.dev/bridge/status` to check that the proxy Function is deployed and sees the secret. This endpoint does **not** expose the secret.

The `TRAFFIC` Analytics Engine binding is separate from Fingerprint and does not store VID. It records HTTP request metadata rather than client-side analytics. Cloudflare Web Analytics may also independently record visits. GA4 is implemented with separate opt-in, dynamic gtag.js loading, client_id diagnostics and a suspected-adblocking status. GA4 uses the gtag.js URL hosted by Google Tag Manager; there is no separate GTM container configured in this repository.

## Scope and limitations

- This proxy was built experimentally; it is **not** the official vendor-managed Cloudflare integration.
- The public lab is a research instrument, not a production anti-fraud solution.
- A successful identification establishes that the agent ran and the API returned a VID, not that visits are consistently linkable over time.
- Direct blocking and proxy success are separate observations from FPP effectiveness; FPP changes exposed signals, not the final API response.
- Only the user-triggered identification runs the Fingerprint Agent. Unexecuted bots will not generate Fingerprint events.
- The main page uses a `noindex` directive, but its URL and API key are public. Never disclose `PROXY_SECRET`.

## License / attribution

Independent testing of the Fingerprint commercial service using its public client API key. Not an official Fingerprint product or integration.
