# Fingerprint Lab

Independent browser fingerprinting and tracking research laboratory. Not affiliated with Fingerprint.

## Tests

- **Fingerprint Pro test** — compare Direct and first-party proxy identification, inspect visitor IDs and export results. Includes optional Google Analytics 4 diagnostics and adblocking detection.
- **1P Custom Tracking Simulator** — test first-party identification with FingerprintJS OSS, local tracking IDs and behavioral events.
- **FingerprintJS OSS Raw Components** — inspect individual browser components, errors, timing, and locally export the complete raw JSON.
- **Privacy and data processing** — information about data processing, local storage and third-party services.

## How it works?

The main test offers two Fingerprint Pro connection methods:

- **Direct:** the browser communicates directly with Fingerprint.
- **1P Proxy:** requests pass through the laboratory's Cloudflare Pages proxy.

Fingerprint Pro identification starts only when the visitor explicitly initiates a test. The interface shows the results for each method and supports copying visitor IDs and exporting JSON.

The tracking simulator demonstrates first-party identification and browser storage. Its demonstration events remain in the browser.

## Server Event inspector (section 03)

Section 03 fetches individual Fingerprint Server API v4 events on demand, including any Smart Signals or raw attributes available on the workspace plan. It does not run a new identification. The legacy manual VID comparison in that section has been replaced.

Configure **both** values as encrypted secrets in the Cloudflare Pages deployment (not in GitHub, wrangler.toml, client-side JavaScript, or plain environment variables):

- `FP_SERVER_API_KEY`: Fingerprint Secret API Key for this workspace / environment, EU region.
- `LAB_EVENT_ACCESS_TOKEN`: separate randomly generated access token of at least 32 characters, used to authorize lab-only event lookups.

Until both secrets are present, `POST /api/event` responds with HTTP 503 and **no Server API request is made**. The UI prompts for the lab access token, not the Fingerprint Secret API Key. The access token is kept only in the current page memory/input and sent in the `X-Lab-Event-Token` request header over HTTPS. The endpoint is read-only, checks the origin and the token, and does not set CORS headers. Do not share the access token or store it in the repository. Rotate it if compromised.

The publicly deployed lab remains accessible without authentication; only the Server Event reader is protected. Server API responses can contain sensitive event information (including IP data), so treat exported JSON accordingly.

Availability of `raw_device_attributes` and individual Smart Signals depends on the plan and workspace. Their presence in the API documentation does not imply availability on Free/Pro.

Cloudflare provides hosting and traffic analytics. Google Analytics 4 is optional and requires separate consent.

## Purpose

Fingerprint Lab is a public research and testing tool, not a production anti-fraud service. Results reflect the conditions of each test; repeated measurements are needed to assess linkability.

## Attribution

Independent testing using Fingerprint Pro and FingerprintJS OSS. Not an official Fingerprint product.
