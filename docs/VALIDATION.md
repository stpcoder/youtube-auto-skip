# Validation — Chrome 3.0.4 / Safari 1.0.0

Publication check: 2026-10-08. Tested in disposable profiles with Chromium / Chrome for Testing **153.0.8010.12**. No existing user browser profile was used.

| Check | Result |
| --- | --- |
| `npm run verify` | 177 Node tests passed; generated bundles, versions, assets, locale placeholders, filter counts/source hashes and documentation links checked. |
| `npm run test:browser` | 87 local fixture checks passed across eight pages. |
| Installed Chrome runtime | Static DNR request blocking, explicit ad-area hiding, normal-content preservation, local generic-hide exception and ad-popup blocking passed. |
| Settings and exceptions | General disable restored hidden content; site pause produced a dynamic network allow rule. |
| Popup | Four locales in light/dark themes; version/title/ARIA, real tab diagnostics, native storage toggles and page reload passed. Five simulated diagnostic responses were checked per locale. No horizontal overflow; content remained within Chrome popup height. |
| Release package | Chrome runtime folder loaded independently of development files and passed the installed-browser checks. Both manifest asset graphs checked. |

Fixture totals: prevention 12, early skip 10, content fallback 10, buffer recovery 12, interruption notice 12, general filters 12, ad slots 12, Safari media tools 7. Safari checks use mocked media/PiP APIs; they are not device validation. The popup screenshot in the main README is an actual local extension render, not proof of live-site results.

`npm run build:release` creates separate Chrome 3.0.4 runtime and Safari 1.0.0 development ZIPs with license notices, tagged-source links and SHA-256 checksums. Repackaging the same files produces identical ZIP hashes even after Chrome creates its compiled `_metadata` cache; that cache is excluded. The GitHub workflow repeats verification, packaging and installed-browser checks on Linux. ZIP creation uses Node.js without a system ZIP utility or Xcode.

No live YouTube account or Brazilian/Indonesian website effectiveness test was performed in this publication work. These checks do not establish all-ad coverage, server-wait removal, native Safari PiP or locked-screen playback. The Safari download is development source, not a signed IPA. Chromium browsers other than Chrome and mobile Chrome are not validated here.

The existing converter dependency tree reports six npm advisories (five moderate, one high). It is development tooling and is excluded as executable code from the extension packages; see [technical details](TECHNICAL.md). Review converter upgrades separately from this publication change.
