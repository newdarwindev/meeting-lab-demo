# Meeting Lab

Static concept site. The Deck workstation has component runtime evidence. Lima’s workbench layout is documented; the release board is synthetic. Neither browser-to-desktop operation nor the complete teach-back is presented as shipped. The five images are illustrations served locally.

## Pages and local checks

- `index.html`: technical terminal, with the synthetic evidence test at `index.html?view=terminal#teach-back-title`.
- `business.html`: four business decisions, their inputs and their evidence thresholds.
- Each edition has its own `#early-access` section. No signup information is collected by this repository.

Run `python3 -m http.server 8080` from the repo root and open the local root. Then run `python3 scripts/check_site.py` and `node scripts/check_experiment.cjs`. The browser simulation uses synthetic URLs and sends no network requests.

## A/B configuration

The experiment is **disabled** in `experiment.js`. To activate, configure all of these:

- `enabled`: `true` only after end-to-end qualification.
- `endpoint`: the deployed aggregate Google Apps Script HTTPS URL ending in `/exec`.
- `terminalForm` and `businessForm`: two distinct published Google Forms **responder** URLs with the same prompts and settings. Use no edit URLs or prefilled parameters.
- `generalForm` (recommended): a third distinct responder URL for manual/direct visits, browsers that opt out, and storage-restricted visitors. Do not reuse either arm’s form. The general responder works without an enabled experiment or valid analytics/arm configuration; it never sends experiment events. Without this third form, excluded visitors have no experimental signup link. Without JavaScript, the pages and synthetic demo work; a signup link is not inserted.

Only the canonical root (trailing slash) can assign a new browser, with a uniform random bit. A bare root or one with only ordinary campaign keys qualifies: `ref`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id`, `utm_source_platform`, `utm_creative_format`, and `utm_marketing_tactic`. Values are ignored and stripped on assignment, never stored or emitted. Any URL fragment, edition selector, internal marker, version/debug key, or other query key excludes an entry. Local storage records only the arm, not a user ID. A business assignment uses a one-time session handoff; both layouts keep their own #early-access link. Direct business visits and explicit `?view=terminal` are unbucketed, including the destination of an edition switch. The source edition can record one voluntary switch. DNT/GPC and inaccessible storage prevent assignment or collection. Changing experiment definitions requires a new version and aligned collector configuration.

## Aggregate event contract and interpretation

A best-effort HTTPS POST sends only `{"experiment":"meeting-lab-v1","arm":"terminal","event":"impression"}`. Valid arms are `terminal` and `business`; valid events are `impression`, `attention`, `variant_switch`, and `waitlist_click`. The POST uses text/plain, no CORS readback, no cookies, no referrer, and keepalive. There is no event ID, email, visitor ID, URL, screen payload or browser metadata in the application body. Standard transport infrastructure may still see connection metadata. Keep the collector aggregate-only; do not log full requests.

- Impression: once when an assigned page is visible, per browser page session.
- Attention: once after at least 10 seconds cumulatively visible **and focused**. This is a proxy for reading, not proof of comprehension.
- Variant switch: once after an explicit opposite-edition link click from the assigned edition. No attribution or impressions on the manual destination.
- Waitlist click: once after the assigned edition’s responder-link click. **Not a submitted signup.**

Deduplication is local to the browser page session; a new tab/session, cleared storage, another browser/device, dropped sends, or blockers can change counts. Use the same agreed observation interval and compare both arm counters and the **two separate Google Forms completed-response counts**; exclude the general form. Report attention/impression, outbound click/impression, and completed response/impression separately. The last is an aggregate estimate, not a user-level conversion rate: browser counts are not unique people, there is no event-to-response join, and directly shared responder links or multiple submissions can contaminate the numerator. Compare absolute rates and percentage-point differences with counts and caveats. Never infer a lift from an outbound click or claim a winner on a handful of visits.

## GitHub Pages

Under **Settings → Pages**, use **Deploy from a branch**, `main`, `/ (root)`. Keep `.nojekyll`. Relative links work under the repository’s project-page prefix; no custom Actions workflow is needed. Verify both page links and all illustrations signed out. Before enabling the test, submit synthetic cases on both responder forms and the general form, verify only the expected aggregate buckets change, and isolate/remove test responses from reporting per the owner’s instructions. Never put edit links, production form responses or credentials in this repo.
