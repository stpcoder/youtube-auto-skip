# iPhone YouTube 전용 Safari 확장

v1.0.0 개발판입니다. iOS 26 이상을 최소 대상으로 하며 iOS 27 SDK에서 빌드됩니다. **실제 iPhone 26.6/27의 PiP·광고·잠금 화면 재생은 아직 확인하지 않았습니다.** YouTube 앱이 아니라 Safari 웹사이트에만 적용됩니다.

## 구현 범위와 남은 제한

- 광고: 기존 응답 광고 필드 처리·플레이어 스킵 시도와 모바일 스킵 버튼 처리를 포함합니다. Chrome debugger 방식은 사용하지 않습니다. 사이트 코드가 먼저 실행되면 초기 응답 처리 시점을 놓칠 수 있으며 서버 삽입 광고 전체를 보장하지 않습니다.
- PiP: 실제 사용자 탭에서 Safari 네이티브 영상 PiP API를 호출합니다. YouTube 전용 버튼이 없어도 진입을 시도할 수 있습니다. 실제 모드/이벤트가 확인돼야 성공으로 표시하며 Safari·OS 거부는 오류로 표시합니다.
- 오디오 전용: 현재 영상 응답에 재생 가능한 직접 HTTPS Googlevideo 오디오 주소가 있을 때만 사용합니다. 주소가 없거나 cipher/SABR 전용이면 사용할 수 없다고 표시합니다. 실제 오디오 재생 시작 후에만 영상을 멈추며 영상 재개·실패·페이지 이동에서 정리합니다. 외부 서버로 영상을 보내지 않습니다.
- 홈 화면의 PiP와 화면 잠금 뒤 소리 재생은 서로 다른 검사입니다. JavaScript 타이머로 iOS의 탭 정지를 막았다고 가정하지 않습니다. 직접 오디오 URL 확보 범위와 실기 검증이 남았으므로 **범용 백그라운드 지원 완료판은 아닙니다.**

페이지 내부의 재생 도구에서 `화면 속 화면` 또는 `소리만 재생`을 직접 누르세요. 개인정보 최소화를 위해 일반 사이트 차단이나 전체 사이트 권한은 포함하지 않습니다. 모바일 `/watch` 중심 개발판이며 Shorts·라이브·자동 다음 영상 오디오 전환은 지원 범위 밖입니다.

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
4. iPhone 설정 → 앱 → Safari → 확장 프로그램에서 YouTubeSafari를 켭니다. Safari YouTube 페이지에서 확장이 YouTube에 접근하도록 허용하고 페이지를 다시 엽니다.
5. 앱 대신 Safari에서 영상을 재생하고 재생 도구를 사용합니다.

이 작업에서 Apple 계정 로그인, 실제 기기 서명·설치, Safari 권한 승인은 수행하지 않았습니다. App Store/TestFlight 등록판이나 바로 설치 가능한 서명된 IPA는 아닙니다. 앱 아이콘 등 배포용 마감 작업도 남아 있습니다.

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
3. 오디오 전용 모드 → 홈 화면 → 화면 잠금 후 몇 분 재생 → 잠금 화면 일시정지/재개 → 복귀. 오디오 주소 없음도 따로 기록합니다.
4. 오디오 실패·영상으로 복귀·다음 영상 이동에서 이중 재생이나 시간 위치 손실이 없는지 확인.
5. 확장 접근 권한 거부 시 기존 YouTube 재생이 유지되는지 확인.

디버깅 상태는 `document.documentElement.dataset.yasSafariBootstrapStatus`, `yasSafariMediaStatus`입니다. 소스 검사와 로컬 모의 페이지는 `tests/safari.test.cjs`, `tests/safari-media.html`에 있습니다. 모의 페이지는 실제 네이티브 PiP나 Googlevideo 재생을 검증하지 않습니다.

참고: [Apple Safari 확장 포장](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari), [PiPifier](https://github.com/arnoappenzeller/PiPifier), [Vinegar](https://apps.apple.com/us/app/vinegar-tube-cleaner/id1591303229). 코드/필터 출처와 라이선스는 상위 `THIRD_PARTY_NOTICES.md`를 참고하세요.
