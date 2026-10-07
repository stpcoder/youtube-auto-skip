# AdBlock + YouTube

[Português (Brasil)](../README.md) · [Bahasa Indonesia](README.id.md) · [한국어](README.ko.md)

Chrome MV3 general ad blocking, supported YouTube ad processing and automatic skipping. **Chrome 3.0.4 · desktop Chrome 111+ · preview release.**

## Install

1. Download `youtube-auto-skip-chrome-3.0.4.zip` from the [release](https://github.com/stpcoder/youtube-auto-skip/releases/tag/v3.0.4-preview.1) and extract it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted `youtube-auto-skip` folder containing `manifest.json`.
4. Open the extension button to check its version and settings.

No build or Node.js installation is needed. You can also use Code → Download ZIP or clone the repository and load its root. Keep the installed folder; after updating files, reload the extension and open pages. [Installation options](INSTALL.md)

## Features

- EasyList/YousList network and visual filter snapshots, plus known advertising-popup protection.
- Per-site pause, parent-domain exceptions and compatibility rules that preserve ordinary content.
- Supported YouTube response processing, player skip attempts and skip-button assistance, independent of general-blocking switches.
- Bounded initial empty-buffer recovery and hiding of a specific Korean interruption notice. Other playback errors remain visible.
- Popup page-filter diagnostics and reload button. Chrome metadata/settings support Portuguese, English, Indonesian and Korean.

Includes 29,894 network rules, 30,236 visual rules and 169 cosmetic-policy rules. Chrome limits and unsupported syntax reduce coverage. Advanced procedural filters/scriptlets and Brazilian/Indonesian regional lists are not included. Lists do not update automatically. Complete removal of every ad, changed YouTube responses, server-stitched ads or server-imposed waits is not guaranteed.

## Safari and privacy

Safari 1.0.0 is a separate YouTube-only development port with PiP and conditional audio-only tools. Installing its source on iPhone requires Mac/Xcode and personal signing. Real-device PiP and locked-screen playback remain unverified. [Safari guide](SAFARI.en.md)

HTTP/HTTPS access supports general blocking. Chrome `debugger` permission enables skip-button input assistance and may display a browser control notification. Settings stay in local extension storage; the source contains no external browsing-history analytics endpoint. [Architecture and permissions](TECHNICAL.md)

## Development

```sh
npm ci
npm run verify
npm run build:release
npm run preview
```

Use Node.js 22+. Rebuild general bundles after editing sources. `build:filters` refreshes lists; `build:filters -- --offline` uses recorded sources. ZIP generation requires no system ZIP tools or Xcode. [Validation](VALIDATION.md) · [Contributing](../CONTRIBUTING.md) · [Notices](../THIRD_PARTY_NOTICES.md)

Project code: GPL-3.0-only. Included filters retain their licenses and attribution.
