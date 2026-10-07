# Install and update

Chrome 3.0.4 requires **desktop Chrome 111+**. Choose one path; no build or Node.js installation is needed.

| Path | Folder to select in Chrome |
| --- | --- |
| [Release ZIP](https://github.com/stpcoder/youtube-auto-skip/releases/tag/v3.0.4-preview.1) | Extract `youtube-auto-skip-chrome-3.0.4.zip`, then select `youtube-auto-skip`. |
| GitHub → Code → Download ZIP | Extract and select the repository folder containing the root `manifest.json`. |
| `git clone https://github.com/stpcoder/youtube-auto-skip.git` | Select the cloned repository root. Runtime bundles and filters are committed. |

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the folder containing `manifest.json`. Keep that folder on disk. Open the extension button to check the version, settings and page-filter status. This preview is outside the Chrome Web Store. Other Chromium browsers and mobile browsers have not been validated for this release.

## Updating

Replace files in the **same installed folder**, or run `git pull` there. Reload the extension in `chrome://extensions`, then reload open web pages. The popup's **Reload this page** button reloads the current web page. Pages opened before an extension update may report that a reload is needed.

Keeping the folder and existing installation preserves its local settings. Loading another folder can create another extension ID and separate settings. Avoid installing both the release ZIP and repository simultaneously; choose the folder you want to keep using.

## Controls and troubleshooting

- General ad blocking controls network rules, visual filters and known advertising popups.
- Block on this site pauses general blocking for the current host; a paused parent also pauses its subdomains.
- YouTube protection runs independently of these general-blocking switches.
- The popup distinguishes visual-filter readiness, errors, reload requirements and compatibility-only sites. A page without matching visual rules can still have network blocking active.
- If a site breaks, pause its blocking and reload it. Report extension/browser versions, reproducible steps and the visible popup status.

Lists are snapshots. Brazilian/Indonesian supplemental filters are not included. YouTube changes, server-stitched ads and unsupported filter syntax can reduce coverage; complete removal is not guaranteed.

## Safari / iPhone

The separate Safari ZIP is **development source**, version 1.0.0. It is not a signed app or IPA. Installation requires Mac, Xcode and your own signing. Read the [Safari guide](SAFARI.en.md). Real-device PiP and locked-screen playback remain unverified.

## Development and preview

Use Node.js 22+:

```sh
npm ci
npm run verify
npm run build:release
npm run preview
```

`build:release` produces both ZIPs, `SHA256SUMS` and `release-manifest.json` in `build/`. ZIP generation needs no system ZIP utility or Xcode. Native Safari project generation is separate. Preview runs at `http://127.0.0.1:8766`; try `tests/popup-preview.html?lang=pt-BR` (also `en`, `id`, `ko`).

For installed-browser checks, run `npx playwright install chromium`, then `npm run test:browser`. Set `BROWSER_EXECUTABLE` to an existing compatible Chromium executable if needed, or `EXTENSION_DIRECTORY` to an extracted Chrome release folder to check that package. Tests use disposable profiles and local pages. See [validation](VALIDATION.md), [architecture](TECHNICAL.md) and [fixtures](../tests/README.md).
