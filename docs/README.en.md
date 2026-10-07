# YouTube Auto Skip + Adblock

**Chrome ad blocking with dedicated YouTube protection.**

An open-source Manifest V3 extension combining bundled ad and popup filters with YouTube player-response ad prevention, automatic skipping and bounded startup recovery.

[Português (Brasil)](../README.md) · [Bahasa Indonesia](README.id.md) · [한국어](README.ko.md)

## Install the preview

1. Download the ZIP from the [preview release](https://github.com/stpcoder/youtube-auto-skip/releases/tag/v3.0.0-preview.1) and extract `youtube-auto-skip`.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked**, then select the extracted folder containing `manifest.json`.
4. Check version **3.0.0** and reload existing pages, including YouTube.
5. Use the extension popup to toggle general filtering or allow the current site.

Requires desktop Chrome 111+. This package has no validated support for Firefox, Safari, iPhone or the YouTube app. It is not published in the Chrome Web Store. To update, replace the extracted files, reload the extension, then reload pages.

The general toggle and site exceptions apply to general filtering. YouTube protection remains separate. Disable the extension in `chrome://extensions` to stop every feature.

## Features and limits

- Bundled network filtering and cosmetic ad hiding based on EasyList and YousList.
- Blocking of popup destinations on known ad-server hosts; general and per-site controls.
- Ad-field removal on known YouTube player-response paths, followed by automatic skip and button fallbacks when needed.
- One bounded attempt to recover an initial empty-buffer wait while preserving the starting position, with a possible restoration of the original request.

**This is a preview.** Coverage depends on the site, ad format and YouTube changes. It does not guarantee complete ad removal or immediate playback, and it does not implement the full uBlock Origin or AdGuard engine. The specific interruption-notice filter currently matches the Korean YouTube message; translating the extension does not extend that matcher to other YouTube interface languages.

The snapshot includes 29,893 network rules and 30,236 cosmetic filter entries. Unsupported rules and conversion limits are recorded in [`filters/provenance.json`](../filters/provenance.json). YousList is a Korean supplement; EasyList Portuguese and ABPindo are not bundled. Brazilian and Indonesian site coverage has not been validated separately.

## Permissions and privacy

HTTP/HTTPS host access supports site filtering. `storage` keeps preferences locally, `scripting` inserts CSS, `declarativeNetRequest` filters requests and `webNavigation` handles ad popup tabs. `debugger` is reserved for the YouTube skip-button fallback and may cause Chrome to display a control notice.

This release contains no telemetry to the maintainer. Filters are bundled and updated with a new extension release. Only the developer filter-build command downloads filter sources. See [third-party notices](../THIRD_PARTY_NOTICES.md).

## Develop and contribute

```sh
git clone https://github.com/stpcoder/youtube-auto-skip.git
cd youtube-auto-skip
npm ci
npm test
npm run check:package
npm run build:release
```

Requires Node.js 22+. Existing bundled filters are sufficient to install. Rebuild the saved snapshots with `npm run build:filters -- --offline`; an online rebuild may change coverage.

Tests check simulated scenarios and package integrity, not universal live YouTube effectiveness. See [technical notes](TECHNICAL.md) and [contributing](../CONTRIBUTING.md). Submit a [reproducible bug report](https://github.com/stpcoder/youtube-auto-skip/issues/new/choose); Portuguese, English, Indonesian and Korean reports are welcome.

Project code: [GPL-3.0-only](../LICENSE). Filter data has separate [attribution and licensing](../THIRD_PARTY_NOTICES.md). Independent project, not affiliated with YouTube or Google.
