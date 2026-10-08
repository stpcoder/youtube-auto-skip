# Focus — Safari / iPhone development port

Current source is Focus **1.3.3 development**, targeting iOS 26+. It shares Chrome's EasyList/YousList data and adds independently verified provider/creative signatures. Some general-site banners and reversible site-specific banner settings were checked on a physical iPhone with iOS 26.6.2; this does not establish all-ad coverage. Chrome debugger input is excluded. Broad YouTube ad coverage and continuous home/locked-screen playback require separate device validation; the user reports working PiP/background playback after 1.3.2. Previously published 1.0.0 downloads do not contain these changes.

`youtube-auto-skip-safari-1.0.0-dev.zip` contains assembled extension sources and license notices. It is not an iOS app or IPA. For project-generation tools and host-app resources, download or clone the corresponding [repository tag](https://github.com/stpcoder/youtube-auto-skip/tree/v3.0.4-preview.1).

## Prepare installation

A Mac with compatible Xcode and your own iPhone/signing team are required. From the repository root:

```sh
npm ci
npm run build:safari -- --xcode
```

Open `safari/xcode-v1/YouTubeSafari/YouTubeSafari.xcodeproj`. Select your team in Signing & Capabilities for both app and extension targets, and use your own bundle identifiers if necessary. Select your iPhone and install the signed app. Enable the extension in Safari settings, permit YouTube access, and reload the Safari page. Personal-team signing may expire. No App Store/TestFlight release or signed IPA is provided.

## Playback tools and limits

- Ad processing installs directly in MAIN at `document_start`, supported since Safari 18 and within the iOS 26+ target. It processes supported player responses, skip controls and mobile skip buttons without waiting for a background-message round trip. Server-side ads can still prevent success.
- Tap **화면 속 화면** (picture in picture) to request native Safari PiP. Success requires native mode/event confirmation; rejection remains an error.
- **백그라운드 재생** (background playback helper) keeps the existing video, source, buffer and time; it no longer extracts or switches to a separate audio stream. Unmuting/play occur in the explicit tap. Where available, the Audio Session API selects the OS playback category, without requesting a microphone. Reversible window/document visibility handling and Media Session play/pause/seek, metadata and position updates assist background playback. Disabling/navigation restores the session. PiP can coexist. This cannot force iOS to keep a suspended page playing.
- A compact three-icon toolbar appears automatically at the bottom right on video pages: PiP, background playback and fullscreen. Its buttons have 44px touch targets; the background button shows whether the helper is enabled. Video navigation remounts the toolbar, and returning to Safari reconciles the actual PiP mode. The native host only provides optional setup instructions. Its reusable setup screen and the Safari extension are separate; see the [integration guide](../safari/integration/README.md).
- Mobile startup applies `eAFgAQ` and the related internal request markers to the first playback request. Actual player/get_watch POST-body hooks cover cached serialization, missing optional fields, native Request bodies and SPA requests made before the address changes. Targeted Request bodies are cloned/read asynchronously without a fixed wait, retaining native headers, options and abort signals. MWEB's gzip JSON bodies are decoded and re-encoded as gzip only if changed; unrelated watch-next fields are retained. If HTML already contains the initial response, an unpaused empty player requests once as soon as its API is ready; a tagged first request or decoded/paused video avoids the extra load. One original-request restoration bounds failure recovery. Chrome retains its existing conditional retry behavior. This does not guarantee that a server-imposed delay disappears, accelerate timers, or reload a whole page in a loop.
- General filtering requires site access. The popup provides global and site-specific switches plus independent provider, additional-banner and popup checkboxes, all on by default. Site preferences persist, inherit to subdomains and are overridden by more-specific hosts; master-off takes precedence without deleting preferences. Reload after changing request blocking. Plain unconditional host blocks are grouped without quota truncation; conditional/path rules, exceptions and badfilter overrides remain separately handled. Known popup-only URL paths are compiled as local data. Verified creative and banner-template signatures hide advertising without blocking shared CDNs or normal content. Safari rules retain YouTube exclusions, omit main-frame blocks and adapt frame allow actions. Advanced procedural filters/scriptlets and all pop-under routes are not covered.
- The collapsed filter/tools section distinguishes active EasyList, YousList and local Focus data, the AdGuard build-time converter, and design references. It does not claim to embed a complete uBlock/AdGuard/uAssets engine.
- Home-screen PiP and audio after screen lock need separate device tests. JavaScript timers do not establish background support. Shorts, live video and automatic next-video audio transitions are outside scope.

Playback-tool labels are currently Korean; Chrome popup localization does not apply to them. No external media proxy is used.

## Real-device validation

Record iOS versions and test first/next videos, navigation, ad skipping, PiP → home screen → another app → return, and original-video background → lock screen → pause/resume → return. Test rejected playback, background toggling/PiP coexistence and denied extension access. Check for reloading and lost position. Record failures as failures.

Mock pages and Node tests cover state transitions; they do not exercise native PiP, device suspension or real Googlevideo playback. See the [Korean guide](../safari/README.md) in the full repository and [validation](VALIDATION.md). Source/filter licenses are in `THIRD_PARTY_NOTICES.md` in the download and repository root.
