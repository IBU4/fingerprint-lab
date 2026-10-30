# Fingerprint Lab

Independent browser fingerprinting and tracking research laboratory. Not affiliated with Fingerprint.

## Tests

- **Fingerprint Pro test** — compare Direct and first-party proxy identification, inspect visitor IDs and export results. Includes optional Google Analytics 4 diagnostics and adblocking detection.
- **1P Custom Tracking Simulator** — test first-party identification with FingerprintJS OSS, local tracking IDs and behavioral events.
- **FingerprintJS OSS Raw Components** — inspect individual browser components, errors, timing, and locally export the complete raw JSON.
- **Privacy and data processing** — information about data processing, local storage and third-party services.

## How it works

The main test offers two Fingerprint Pro connection methods:

- **Direct:** the browser communicates directly with Fingerprint.
- **1P Proxy:** requests pass through the laboratory's Cloudflare Pages proxy.

Fingerprint Pro identification starts only when the visitor explicitly initiates a test. The interface shows the results for each method and supports copying visitor IDs and exporting JSON.

The tracking simulator demonstrates first-party identification and browser storage. Its demonstration events remain in the browser.

Cloudflare provides hosting and traffic analytics. Google Analytics 4 is optional and requires separate consent.

## Purpose

Fingerprint Lab is a public research and testing tool, not a production anti-fraud service. Results reflect the conditions of each test; repeated measurements are needed to assess linkability.

## Attribution

Independent testing using Fingerprint Pro and FingerprintJS OSS. Not an official Fingerprint product.

## Experimental Server Lab (section 03)

The separate `server-lab-ui.js` script reads the Event ID already displayed by the unchanged
main identification script. The independent Cloudflare Pages Function
`functions/server-lab/event.js` makes a **read-only** EU Server API v4 request:
`GET https://eu.api.fpjs.io/v4/events/{event_id}`.
It does not import, replace or modify the working `/bridge` proxy. The main
Fingerprint Agent, Direct mode, 1P Proxy mode, and tracking simulator are unchanged.

Cloudflare Pages → Settings → Variables and Secrets: configure both as **encrypted secrets**,
then redeploy:

- `FP_SERVER_API_KEY`: your **Fingerprint Server API Secret API Key** (not the Proxy Secret).
- `LAB_EVENT_ACCESS_TOKEN`: independent private lab access token (at least 32 characters).

The existing `PROXY_SECRET` is **only** for the original `/bridge` integration and must
not be substituted for `FP_SERVER_API_KEY`.

The browser sends the lab access token only to its own origin in the
`x-server-lab-token` request header; it never sends the Fingerprint Secret API Key.
The separate `POST /server-lab/event` endpoint checks authorization and calls Fingerprint
from Cloudflare, not from the browser. It does not use localStorage or set cookies.
The GET Event API has no additional identification charge.

Troubleshooting returns clear, non-sensitive errors including:
`server_lab_not_configured` (HTTP 503), `access_denied` (403),
`upstream_api_key_or_region_rejected` (upstream 401/403),
`event_not_found` (404), and `upstream_transport_failed` (502).
Never commit either secret to GitHub. Do not share event JSON containing IP or
other sensitive signals without reviewing it. Availability of raw device
attributes and Smart Signals depends on the Fingerprint plan and workspace.


## GA4 section interest experiment (opt-in)

The independent `section-analytics.js` monitors only the existing **main page**.
It does not alter the Fingerprint Pro agent, `/bridge`, `/mosaic`, Server Lab,
the simulator, or the interface layout.

After the existing GA4 checkbox is selected, these events are queued through the
existing `gtag()` integration:

- `section_view` — a section occupies at least 50% of the smaller of its own
  height or the viewport for at least one sampled second.
- `section_engagement` — active on-screen visibility, emitted in approximately
  ten-second chunks and on leaving the section; parameter
  `section_duration_seconds` (integer). Background tabs do not accrue time.
- `section_interaction` — whitelisted button clicks, section links, mode
  changes, and opening GA diagnostics; parameter `section_action`.

All carry `section_id` and `experiment_id=section_interest_v1`. Six page areas
are tracked: `identification`, `results`, `server_lab_and_response`,
`tracking_simulator`, `raw_components`, `documentation`. Section 03 and
section 04 share one physical HTML section and are therefore one measured area.
The counters reset when consent is withdrawn, with no queued engagement flush.
No Visitor ID, Event ID, API token, input contents, or raw results are included.

To **simulate** different interests, navigate to one of the following URL variants,
then opt in to GA4 and interact with the page normally:

- `/?scenario=casual&ga_debug=1`
- `/?scenario=researcher&ga_debug=1`
- `/?scenario=proxy&ga_debug=1`
- `/?scenario=documentation&ga_debug=1`

The optional `scenario` value is a controlled experiment label, not an inferred
user identity; `ga_debug=1` sets GA4 `debug_mode` on these custom events.
Without either query parameter the same events operate normally, without a
scenario label or debug flag.

In GA4 **Admin → Data display → Custom definitions**, register these
*event-scoped custom dimensions*: `section_id`, `section_action`,
`experiment_id`, `experiment_scenario`. Register
`section_duration_seconds` as an *event-scoped custom metric* (seconds).
Use Realtime / DebugView to check delivery, then Explorations to compare the
section metrics across scenarios. These UI registrations are not performed
by committing this repository. Events use the **existing** GA4 property; a
separate GA4 test property has not been created.

GA4 event queuing does not prove that Google received a measurement.
Adblocking can still block downstream collection even when the tag loads.
The experiment measures visible on-screen time, not whether a person actually
read the section.
