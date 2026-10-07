# Architecture and validation limits

The public preview is a frozen Chrome 3.0.0 snapshot. Work on other browser ports is outside this release. The publication adds translated extension metadata, a translated popup, documentation, package checks and a release builder. Live observation files and personal screenshots are not included.

## General filtering

`filters/network.json` contains Chrome declarative network rules generated from EasyList and YousList. Rules exclude YouTube initiators so the dedicated player logic handles YouTube. General block rules exclude top-level document navigation. `general/cosmetic.js` selects applicable native CSS filters, respects cosmetic exceptions and applies them with user-origin CSS through the worker. Unsupported selectors are counted instead of invalidating the entire stylesheet.

`general/popup-guard.js` checks known ad-host destinations in `window.open` and modified/new-window anchor clicks. `general/background.js` handles newly created popup tabs and stops following a tab after a legitimate destination commits. General preferences and site exceptions live in `chrome.storage.local`; they do not disable the separate YouTube path.

The MAIN and ISOLATED content-script entries use distinct policy asset paths. In the publication browser check, listing `general/policy.js` in both entries left the isolated cosmetic script without its policy and caused initialization to fail. `general/policy-isolated.js` is an identical copy with a separate path; package checks enforce both identical contents and distinct world assignments. This packaging correction is confined to the public snapshot.

Filters are static snapshots. The converter caps rule counts and does not implement all source syntax. Its recorded conversion errors and limitations are visible in `filters/provenance.json`; a successful build is not proof of full source-list coverage. Brazilian and Indonesian supplemental lists are not included in this release.

## YouTube protection

At `document_start`, MAIN-world scripts install an anti-adblock guard, remove `adPlacements`, `adSlots` and `playerAds` from recognized player responses, set up bounded empty-buffer recovery, and watch player ad events. Response paths include known initial assignments, fetch/XHR responses and a narrowly recognized streaming player-response frame.

`early.js` tries supported player skip/end commands and the page's enabled skip button. `content.js` can request a trusted input fallback if needed. `background.js` validates the sender, refreshes button coordinates after attaching the debugger, dispatches press/release and detaches before replying. A disappeared tab or document is handled as cancellation.

The empty-buffer recovery is limited to supported initial desktop watch-page conditions. It can request one `eafg` reload at the same starting position and restore the original request on a supported error. The requested reload and an observed `playing` event are separate measurements. Live, Shorts, playlist, seeking and already-playing states are excluded from this recovery path.

The cosmetic interruption filter matches the specific Korean message, not arbitrary errors. Extension/popup translations do not translate the YouTube matcher. Other playback errors remain visible. Server-stitched ads, changed player formats and server-imposed waits are not guaranteed to be handled.

## What the checks establish

`npm test` runs the inherited Node fixtures and publication-specific regression checks. `npm run check:package` verifies manifest assets and imports, locale completeness and placeholders, filter counts and source hashes. `npm run build:release` creates a runtime ZIP and SHA-256 checksum.

Browser fixtures in `tests/*.html` exercise actual DOM behavior with simulated player data. Serve the repository with a local HTTP server and open those fixtures in a disposable Chromium profile. They do not use the real YouTube server or establish account-, country- or ad-format-specific effectiveness.

The public preview should remain labeled as a preview until the complete installed package is tested on real sites and real YouTube sessions, including a fresh load, internal video transitions, back/forward navigation, ad fallback, startup recovery and per-site exceptions. Report failures and actual observed outcomes rather than treating API attempts as successes.

## Development dependency advisories

The pinned AdGuard converter currently brings npm advisories through `js-yaml` and `sprintf-js`, including a high-severity advisory on the `js-yaml` 3.x branch. `npm audit fix` does not resolve the pinned tree. The converter's scriptlet dependency calls `safeLoad`, so overriding it to a different major version would require a compatibility change rather than an automatic upgrade. These packages are development tooling and are not bundled as executable code in the extension ZIP. The release uses included filter snapshots; dependency upgrades and their compatibility review remain open work.
