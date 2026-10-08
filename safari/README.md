# Focus — iPhone Safari 확장

현재 소스는 Focus v1.3.3 개발판입니다. iOS 26 이상을 대상으로 하며 iOS 27 SDK에서 빌드됩니다. YouTube와 일반 사이트의 집중 보기를 Safari에서 제공합니다. YouTube 앱에는 적용되지 않습니다. iOS 26.6.2 실기에서 일부 일반 사이트 배너를 검증했지만 **PiP·지속적인 백그라운드 재생 및 모든 광고 차단을 보장하지 않습니다.** 기존 공개 1.0.0 ZIP에는 이 변경이 포함되지 않습니다.

## 구현 범위와 남은 제한

- 광고: 문서 시작 시 YouTube 페이지의 MAIN 영역에 직접 실행해 초기 응답 광고 필드 처리·플레이어 스킵 시도와 모바일 스킵 버튼 처리를 연결합니다. Safari 18 이상이 지원하는 주입 방식이며, 대상 iOS 26 이상에서 백그라운드 메시지 왕복을 기다리지 않습니다. Chrome debugger 방식은 사용하지 않습니다. 서버 삽입 광고 전체를 보장하지 않습니다.
- 일반 사이트: Chrome과 같은 EasyList·YousList 네트워크/시각 필터와 도메인별 예외를 사용합니다. Safari DNR에 맞춰 프레임 허용 규칙을 조정하고, 페이지 자체를 차단하는 규칙은 제외합니다. 알려진 광고 주소의 새 창은 공통 팝업 가드로 처리합니다. 우회 새 창·절차형 필터·스크립틀릿 전체를 지원하는 완전한 uBlock 엔진은 아닙니다.
- 초기 로딩: Safari 모바일 영상의 첫 재생 요청부터 `eAFgAQ`와 관련 내부 요청 표식을 적용합니다. JSON 직렬화뿐 아니라 실제 `/youtubei/.../player`·`get_watch` POST도 처리합니다. 본문이 담긴 `Request` 객체와 주소가 바뀌기 전의 다음 영상 요청도 대상입니다. MWEB의 gzip JSON 요청은 압축을 풀어 필요한 플레이어 필드만 수정한 뒤 gzip으로 다시 보내며 추천 요청·헤더·중단 신호를 유지합니다. HTML에 초기 응답이 이미 들어 있으면 재생을 시작하려는 빈 버퍼 상태에서 플레이어가 준비되는 즉시 한 번 요청합니다. 첫 요청에 이미 적용됐거나 영상이 정상 재생·일시정지 상태면 추가 로딩하지 않습니다. 실패 시 원본 요청을 한 번 복원하며, 무한 새로고침·서버 미디어 바이트 변조·전체 타이머 가속은 하지 않습니다. 서버 지연을 항상 없앤다는 보장은 없습니다.
- PiP: 실제 사용자 탭에서 Safari 네이티브 영상 PiP API를 호출합니다. YouTube 전용 버튼이 없어도 진입을 시도할 수 있습니다. 실제 모드/이벤트가 확인돼야 성공으로 표시하며 Safari·OS 거부는 오류로 표시합니다.
- 백그라운드 보조: 별도 오디오로 전환하지 않고 기존 동영상·버퍼·재생 위치를 유지합니다. 음소거 해제와 재생은 명시적인 사용자 탭에서만 시작합니다. Safari가 제공하면 `navigator.audioSession.type = 'playback'`으로 OS의 재생용 오디오 세션을 선택합니다. 이는 소리의 시스템 재생 분류이며 오디오 다운로드나 마이크 요청이 아닙니다. window/document 캡처와 Safari의 가시성 속성을 가역적으로 처리하고 잠금 화면 재생/일시정지/탐색·재생 정보를 연결합니다. 끄기·페이지 이동에서 해제하며 PiP와 함께 켤 수 있습니다. 사용자/OS 일시정지를 강제로 재개하지 않습니다.
- 홈 화면의 PiP와 화면 잠금 뒤 소리 재생은 서로 다른 검사입니다. JavaScript 타이머로 iOS의 탭 정지를 막았다고 가정하지 않습니다. 실제 기기의 유지·중단 조건 검증이 남았으므로 **범용 백그라운드 지원 완료판은 아닙니다.**

영상 페이지 오른쪽 아래에 PiP·백그라운드·전체 화면 SVG 버튼 세 개가 가로로 자동 표시됩니다. 버튼의 터치 영역은 각각 44px이며 백그라운드가 켜지면 해당 버튼이 강조됩니다. 다음 영상에서도 패널을 다시 표시하고 Safari로 돌아오면 실제 PiP 상태를 확인합니다. 패널 표시 자체로 재생이나 백그라운드 보조를 켜지는 않습니다. 직접 PiP가 거부되면 전체 화면 버튼에서 Safari 자체 PiP 버튼을 확인할 수 있습니다. 모바일 `/watch` 중심 개발판이며 Shorts·라이브·자동 다음 영상의 백그라운드 전환은 지원 범위 밖입니다.

일반 사이트 필터에는 해당 사이트 또는 모든 HTTP/HTTPS 사이트 접근 권한이 필요합니다. Safari의 Focus 메뉴에서 전체 적용과 사이트별 적용을 끌 수 있습니다. `이 사이트의 기능` 세 항목은 기본으로 모두 켜져 있으며 사이트별로 따로 저장됩니다.

- `기본 광고 공급자 차단`: 알려진 광고 요청을 차단합니다. 사이트 접속이나 플레이어가 깨지면 이 항목부터 해제하고 새로고침하세요.
- `추가 배너 차단`: 필터의 배너 선택자, 확인한 광고 이미지·링크와 공통 배너 구조를 숨깁니다. 정상 내용이 숨겨지면 이 항목만 해제할 수 있습니다.
- `팝업 차단`: 알려진 광고 주소로 열리는 새 창을 처리합니다. 정상 새 창이 방해받으면 이 항목만 해제할 수 있습니다.

사이트별 항목을 바꿔도 다른 사이트 설정은 바뀌지 않습니다. 부모 도메인 설정은 하위 도메인에 적용되고 더 구체적인 설정이 우선합니다. 전체/사이트 적용을 끄면 세 일반 기능 모두 멈추지만 선택값은 보존됩니다. 요청 차단으로 광고 팝업 스크립트 자체가 로드되지 않을 수도 있으므로 세 항목이 각각 모든 광고 유형을 하나씩만 담당하는 것은 아닙니다. YouTube 전용 기능은 별도이므로 일반 적용 스위치와 무관합니다. 모든 기능을 끄려면 Safari에서 확장 자체를 끄세요.

권한 설정: **설정 → 앱 → Safari → 확장 프로그램 → Focus → 모든 웹사이트 → 허용**. 확장 자체도 켜세요. 모든 사이트 권한이 부담스러우면 Safari 페이지 메뉴에서 필요한 사이트만 항상 허용할 수 있습니다. 허용한 뒤 페이지를 새로고침하고 Focus 메뉴의 `일반 사이트에서 적용하기`와 `이 사이트에서 적용하기`를 켭니다. 권한은 해당 페이지의 내용을 읽고 광고 영역을 처리하기 위해 사용됩니다.

공통 필터는 EasyList·YousList와 실기에서 확인한 광고 공급자/이미지 서명을 사용합니다. 무조건 호스트 차단 규칙은 여러 도메인을 묶어 규칙 수 제한 때문에 누락되지 않도록 컴파일합니다. 일반 이미지 호스팅 전체나 사이트 접속 자체를 차단하지 않습니다. 알려지지 않은 광고 이미지·새 주소·스크립틀릿은 별도 대응이 필요하며, 필터 개수만으로 성공을 판단하지 않습니다. 실기 관측은 [검사 기록](../docs/VALIDATION.md)에 구분해 기록합니다.

`필터와 참고 도구`에서 현재 사용 중인 목록과 설계 참고를 구분해 볼 수 있습니다. 실제 필터 데이터는 [EasyList](https://github.com/easylist/easylist), [YousList](https://github.com/yous/YousList), 자체 작성한 Focus 추가 규칙입니다. 빌드 도구는 [AdGuard DNR Converter](https://github.com/AdguardTeam/tsurlfilter)입니다. [uBlock Origin Lite](https://github.com/gorhill/uBlock), [AdGuard Scriptlets](https://github.com/AdguardTeam/Scriptlets), [RemoveAdblockThing](https://github.com/TheRealJoelmatic/RemoveAdblockThing), [uAssets](https://github.com/uBlockOrigin/uAssets), [PiPifier](https://github.com/arnoappenzeller/PiPifier)는 설계 참고이며 전체 엔진을 가져온 것은 아닙니다. 특히 uAssets의 스크립틀릿이 전부 실행되는 구현은 아닙니다.

이전 1.1.0 검사는 iOS 26.5 시뮬레이터에서 수행했습니다. 재생 버튼 표시와 첫 재생 이벤트, 원본 영상 보조의 짧은 홈 화면 왕복을 관측했습니다. 이 시뮬레이터는 네이티브 PiP 지원을 `false`로 보고했고 실제 진입도 거부했습니다. 이후 1.3.0에서는 iOS 26.6.2 실기에서 일부 일반 사이트 배너와 사이트별 배너 켜기·끄기를 확인했습니다. 이를 네이티브 PiP 또는 모든 클릭 광고 검증으로 해석하지 않습니다. [검사 결과와 한계](../docs/VALIDATION.md)

1.1.1 검사에서는 홈 화면에서 돌아온 뒤 재생 중이어도 숨김 상태의 실제 위치 증가는 거의 없었습니다. 이후 YouTube 자체 음소거 상태를 함께 해제하도록 보강했습니다. 잠금 화면에서는 영상 정보가 나타났으나 제어/복귀 화면 검사를 완료하지 못했습니다. **지속적인 홈 화면·잠금 재생은 아직 성공 판정하지 않았습니다.** [1.1.1 검사 기록](../docs/VALIDATION.md#safari-111-original-video-background-follow-up--2026-10-08)

## 로컬 설치 준비

Mac의 Xcode와 본인 iPhone이 필요합니다. Safari는 Chrome처럼 JavaScript 폴더만 선택해서 iPhone에 확장을 설치하지 않습니다. 확장을 담는 iOS 앱을 서명·설치해야 합니다.

```sh
cd youtube-auto-skip
npm run build:safari -- --xcode
```

`--xcode`로 생성할 프로젝트: `safari/xcode-v1/YouTubeSafari/YouTubeSafari.xcodeproj`.

1. Xcode에서 위 프로젝트를 엽니다.
2. 앱과 `YouTubeSafari Extension` 두 대상의 Signing & Capabilities에서 본인 팀을 선택합니다. 번들 ID가 이미 등록돼 있으면 본인만의 ID로 변경합니다.
3. 연결한 iPhone을 실행 대상으로 선택하고 앱을 설치합니다. 기기가 요구하는 개발자 모드·개발자 신뢰 설정은 본인이 확인합니다. 무료 개인 팀의 설치는 서명 유효기간 제한이 있을 수 있습니다.
4. iPhone 설정 → 앱 → Safari → 확장 프로그램에서 Focus를 켭니다. Safari 페이지에서 사이트 접근을 허용하고 새로고침합니다. 업데이트로 권한이 늘면 다시 확인해야 합니다.
5. 앱 대신 Safari에서 영상을 재생하고 재생 도구를 사용합니다.

2026-10-08에 기존 개발자 인증서와 기기 등록 프로파일로 Focus 1.3.1을 서명하고 연결된 iPhone 14 Pro Max(iOS 26.6.2)에 설치했습니다. Apple 계정 로그인·새 인증서 발급·Safari 권한 변경은 하지 않았습니다. App Store/TestFlight 등록판이나 공개 배포용 서명된 IPA는 아닙니다. 기존 앱에 넣으려면 [결합 안내](integration/README.md)를 참고하세요. 선택적인 설정 안내 화면과 확장 대상은 분리돼 있습니다.

같은 날 Focus 1.3.2를 설치하고 Safari 실기에서 146 × 54px 크기의 SVG 버튼 세 개와 가로 넘침이 없는 것을 확인했습니다. 패널 자동 표시 복원과 PiP 상태 동기화는 검증했으며, 지속적인 홈 화면·잠금 재생 성공을 뜻하지는 않습니다.

이후 Focus 1.3.3을 같은 기기에 설치했습니다. 실기에서 문서 로딩 중 직접 주입, 첫 재생 이벤트 1,433ms, gzip 다음 영상 요청 2건의 `eAFgAQ` 적용과 추가 플레이어 재로딩 없는 재생을 확인했습니다. 기존 PiP·백그라운드 도구는 유지했습니다. 이 관측은 해당 영상에서의 검사이며 모든 영상·서버 광고의 지연 제거를 보장하지 않습니다. [1.3.3 검사 기록](../docs/VALIDATION.md#focus-133-immediate-youtube-startup--2026-10-08)

기술 검사용 서명 없는 빌드:

```sh
xcodebuild -quiet -project safari/xcode-v1/YouTubeSafari/YouTubeSafari.xcodeproj \
  -scheme YouTubeSafari -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build/safari-derived CODE_SIGNING_ALLOWED=NO build
```

## 실제 기기에서 반드시 확인할 항목

각 iOS 26.6/27에서 동일하게 검사합니다.

1. 최초 영상·다음 영상·앞뒤 탐색에서 광고 스킵과 본영상 재생.
2. PiP 진입 → 홈 화면 → 다른 앱 → Safari 복귀. 실패는 성공으로 보고하지 않습니다.
3. 백그라운드 모드 → 홈 화면 → 화면 잠금 후 몇 분 재생 → 잠금 화면 일시정지/재개 → 복귀. 원본 영상의 연속 재생과 OS 중단/사용자 재개를 구분합니다.
4. 보조 켜기·끄기·PiP 병행·다음 영상 이동에서 재로딩이나 시간 위치 손실이 없는지 확인.
5. 확장 접근 권한 거부 시 기존 YouTube 재생이 유지되는지 확인.
6. 여러 일반 사이트의 광고 영역·새 창, 정상 링크·로그인·동영상, 전체/사이트 차단 끄기를 검사합니다. 필터 개수는 성공률이 아닙니다.

확장 팝업의 `현재 페이지 검사`에서 재생 위치·모드·숨김 중 위치 증가·오디오 세션을 볼 수 있습니다. `armed`는 보조를 켰다는 뜻이지 홈/잠금 화면 유지 성공 표시가 아닙니다. 위치 증가는 관측값이며 연속적인 소리 재생의 증거는 아닙니다. 상세 진단의 첫 이벤트는 문서 로딩 시작 기준이며 사용자 클릭·캐시·SPA 탐색의 영향을 받습니다. `startup`은 주입 시점, `bootstrap.source`는 직접 주입 확인 또는 백그라운드 대체 실행 여부를 기록합니다. `recovery.eafgRequests`는 실제 전송 단계에서 표식이 확인된 요청 수이고 `initialReloads`는 HTML 초기 응답에 대한 추가 요청 수입니다. 디버깅 상태는 `document.documentElement.dataset.yasSafariStartupStatus`, `yasSafariBootstrapStatus`, `yasSafariMediaStatus`, `youtubeAutoSkipRecoveryStatus`입니다. 소스 검사는 `tests/safari.test.cjs`, `tests/safari-controls.test.cjs`, `tests/buffering-recovery.test.cjs`이며 로컬 모의 페이지는 `tests/safari-media.html`입니다. 모의 페이지는 실제 네이티브 PiP나 Googlevideo 재생을 검증하지 않습니다.

참고: [Apple Safari 확장 포장](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari), [PiPifier](https://github.com/arnoappenzeller/PiPifier), [Vinegar](https://apps.apple.com/us/app/vinegar-tube-cleaner/id1591303229). 코드/필터 출처와 라이선스는 상위 `THIRD_PARTY_NOTICES.md`를 참고하세요.
