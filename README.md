# Fingerprint Lab

Independent, opt-in tests of browser identification. Not affiliated with Fingerprint.

## Tests

- **Direct control:** [index.html](index.html) imports the official Fingerprint Agent v4, EU.
- **Experimental same-origin proxy:** [proxy.html](proxy.html) uses a Cloudflare Pages Function at `/bridge/`.

Neither test starts identification automatically. Both require an explicit checkbox and button.

## Cloudflare Pages setup

Deploy this repository via Cloudflare Pages Git integration. Static files are in the repository root. The `functions/bridge/` directory is recognized automatically as Pages Functions when using Git deployments. No paid domain is required for the experimental Pages Function itself.

Before testing proxy identification, check `https://YOUR-PAGES-SITE/bridge/status`. It should return JSON with `ok:true`. Then open `https://YOUR-PAGES-SITE/proxy.html`.

**Important:** The route here is an **experimental, hand-written same-origin reverse proxy**, not the Fingerprint-managed Cloudflare Proxy Integration. Fingerprint's official integration requires a Cloudflare-managed DNS zone, a Worker route, and a vendor-generated proxy secret. Requests sent without an accepted proxy secret may fail server-side authentication (403). An error does not establish that an ad blocker defeated the agent. A success does not prove the service officially supports this integration. The direct control remains unchanged.

If Fingerprint provides a vendor-issued secret for this environment, store it **only** as an encrypted Cloudflare Pages Functions binding named `PROXY_SECRET`. Never commit the secret or paste it into frontend JavaScript.

The Pages Function forwards only whitelisted agent-download and identification paths, always uses the EU identification region, removes site cookies except the special `_iidt` cookie, and does not forward arbitrary URLs.

## Limitations

- This is not a production anti-fraud implementation.
- Page metadata instructs compliant search engines not to index the page; the URL remains public.
- Fingerprint's own processing, retention and privacy policies apply after a visitor consents and launches a test.
- The current project does not provide visitor account management or a fingerprint database.

## License / attribution

This independent lab calls Fingerprint's commercial service through a public API key. It is not an official Fingerprint product or integration.
