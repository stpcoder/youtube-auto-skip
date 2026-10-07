# Architecture and release boundaries

## General blocking

The MV3 manifest loads static DNR rules from `filters/network.json`. Sources, licenses, hashes, counts and conversion limits are preserved in `filters/provenance.json` and `filters/sources/`. Visual rules and official generic/element/specific-hide exceptions are in `cosmetic.json` and `cosmetic-policy.json`. Compatibility rules are authored in `general/site-rules.json`; selected sites use compatibility-only visual rules and network exemptions to preserve content.

`build-general.mjs` produces independent `main-bundle.js`, `content-bundle.js` and `worker-bundle.js`. Policy/data dependencies are lexical bindings inside each bundle. MAIN and ISOLATED do not depend on one another's globals or duplicate asset-path initialization. Root `background.js` imports the worker bundle. Edit component sources, then rebuild; generated runtime files are committed for installation without Node.js.

Cosmetics use `chrome.scripting.insertCSS`, observe page changes, and report readiness/errors through `YAS_GENERAL_STATUS`. Popup handling checks `window.open`, new-window anchor clicks and popup-tab navigation. Preferences remain in `chrome.storage.local`; parent-domain pause covers subdomains. These switches do not disable YouTube protection.

## YouTube and Safari

Chrome MAIN scripts process supported response ad fields, install an anti-adblock guard, set up bounded initial empty-buffer recovery and monitor ad events. Responses include recognized initial assignments, fetch/XHR and a narrowly recognized streaming frame. `early.js` tries player commands and enabled skip controls. `content.js` can request input assistance; the worker validates senders, refreshes coordinates, attaches/detaches the debugger and cancels for vanished documents.

Recovery excludes live, Shorts, playlists, seeking and already-playing states. Reload attempts and observed `playing` events are separate outcomes. Hiding the Korean interruption notice does not cure buffering; other errors remain visible. Changed formats, server-stitched ads and server-imposed waits are not guaranteed to be handled.

Safari has its own version (1.0.0) and YouTube-only permissions. Its development build copies selected shared YouTube sources and Safari-specific bootstrap, mobile skipping and playback tools. It omits general blocking and Chrome debugger input. PiP requires a user action/native confirmation; audio-only mode requires a playable URL. Device suspension, signing and real playback need separate iPhone validation. [Safari guide](SAFARI.en.md)

## Packaging and repository structure

The root remains directly installable. Moving runtime files into another source directory would disrupt existing unpacked installations. Refactoring therefore concentrates on shared package utilities and generated bundles. `scripts/lib/package-utils.mjs` resolves manifest dependencies, rejects paths outside the package and writes ZIPs with stable timestamps/order. `build:release` rebuilds both targets, checks assets/locales/provenance and produces separate Chrome runtime and Safari development ZIPs with SHA-256 checksums, license notices and a tagged-source link.

Node.js 22+ is the prerequisite for ZIP generation on macOS/Linux/Windows; no external ZIP executable, Python or Xcode is used. Native Safari project generation requires Mac/Xcode. `build:filters` downloads lists; `--offline` rebuilds recorded sources. Neither is required to install a Chrome ZIP.

`verify` runs bundle generation, Node tests and package checks. `test:browser` uses disposable Chromium profiles, extension APIs and local fixtures. It does not establish real YouTube or country/account-specific ad coverage. [Validation](VALIDATION.md)

## Permissions and privacy

General blocking needs HTTP/HTTPS access, DNR and scripting. Local storage holds settings; tabs/webNavigation support site controls and popup handling. Chrome `debugger` enables skip-button input assistance and may trigger a browser control notification. No external browsing-history analytics endpoint is present in the source. Filter snapshots do not refresh automatically.

## Development dependency advisories

The pinned AdGuard converter brings advisories through `js-yaml` and `sprintf-js`, including a high-severity advisory on `js-yaml` 3.x. `npm audit fix` does not resolve this tree. Its scriptlet dependency calls `safeLoad`, so overriding the major version needs compatibility work. These libraries are build tooling, not executable runtime dependencies in either ZIP. `fflate` creates ZIPs and Playwright supplies optional browser checks; neither is included in the extension. Converter upgrades and compatibility review remain open.
