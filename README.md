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
