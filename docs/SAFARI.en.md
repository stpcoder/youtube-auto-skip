# Safari / iPhone development port

Safari **1.0.0** targets iOS 26+. It works on YouTube in Safari with YouTube-only permissions. General-site filtering and Chrome debugger input are excluded. **Real iPhone ad skipping, PiP, home-screen and locked-screen playback have not been validated.**

`youtube-auto-skip-safari-1.0.0-dev.zip` contains assembled extension sources and license notices. It is not an iOS app or IPA. For project-generation tools and host-app resources, download or clone the corresponding [repository tag](https://github.com/stpcoder/youtube-auto-skip/tree/v3.0.4-preview.1).

## Prepare installation

A Mac with compatible Xcode and your own iPhone/signing team are required. From the repository root:

```sh
npm ci
npm run build:safari -- --xcode
```

Open `safari/xcode-v1/YouTubeSafari/YouTubeSafari.xcodeproj`. Select your team in Signing & Capabilities for both app and extension targets, and use your own bundle identifiers if necessary. Select your iPhone and install the signed app. Enable the extension in Safari settings, permit YouTube access, and reload the Safari page. Personal-team signing may expire. No App Store/TestFlight release or signed IPA is provided.

## Playback tools and limits

- Ad processing uses supported player responses, skip controls and mobile skip buttons. Injection timing and server-side ads can prevent success.
- Tap **화면 속 화면** (picture in picture) to request native Safari PiP. Success requires native mode/event confirmation; rejection remains an error.
- **소리만 재생** (audio only) requires a directly playable HTTPS Googlevideo audio URL. Ciphered/SABR-only responses may not supply one. Video pauses after audio starts; returning to video, failure or navigation cleans up audio mode.
- Home-screen PiP and audio after screen lock need separate device tests. JavaScript timers do not establish background support. Shorts, live video and automatic next-video audio transitions are outside scope.

Playback-tool labels are currently Korean; Chrome popup localization does not apply to them. No external media proxy is used.

## Real-device validation

Record iOS versions and test first/next videos, navigation, ad skipping, PiP → home screen → another app → return, and audio → lock screen → pause/resume → return. Test unavailable audio URLs, rejected playback, switching to video and denied extension access. Check for double playback and lost position. Record failures as failures.

Mock pages and Node tests cover state transitions; they do not exercise native PiP, device suspension or real Googlevideo playback. See the [Korean guide](../safari/README.md) in the full repository and [validation](VALIDATION.md). Source/filter licenses are in `THIRD_PARTY_NOTICES.md` in the download and repository root.
