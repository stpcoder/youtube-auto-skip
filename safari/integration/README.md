# Focus를 기존 iOS 앱에 넣기

Focus는 **Safari Web Extension 대상**과 선택적인 **설정 안내 화면**으로 분리돼 있습니다. 독립 앱 화면이나 실행 중인 앱의 서버가 없어도 확장 기능은 Safari에서 동작합니다. 확장은 앱에 포함해서 서명해야 하며, 사용자가 Safari 접근 권한을 직접 승인합니다.

## 가져올 파일

저장소에서 `npm run export:focus`를 실행하면 `build/focus-integration/`에 다음 파일이 생성됩니다.

- `Extension/`: 자체 팝업과 YouTube·일반 사이트 기능을 포함한 완성된 확장 리소스입니다. 복사 후 별도 저장소 경로에 의존하지 않습니다.
- `FocusSetup/`: 로컬 Swift Package입니다. Safari 설정 안내만 제공합니다. 설치·권한 변경·원격 코드 다운로드를 수행하지 않습니다.
- `SafariWebExtensionHandler.swift`: 새 확장 대상에 넣을 최소 네이티브 진입점입니다.
- `LICENSE`, `THIRD_PARTY_NOTICES.md`: 코드·필터 재사용 라이선스와 출처입니다.

## Xcode에서 연결

1. 기존 앱에 Safari Web Extension 대상을 추가하고 `Extension/`의 파일·하위 폴더를 확장 번들 리소스에 포함합니다. `icons/`는 폴더 구조를 유지합니다.
2. 확장 대상에 `SafariWebExtensionHandler.swift`를 추가합니다. 확장 Info.plist의 `NSExtensionPointIdentifier`는 `com.apple.Safari.web-extension`, `NSExtensionPrincipalClass`는 `$(PRODUCT_MODULE_NAME).SafariWebExtensionHandler`입니다.
3. 앱 대상의 Embed App Extensions에 확장을 넣고 앱·확장을 같은 팀으로 서명합니다. 기존 앱의 번들 ID 하위에 고유한 확장 ID를 지정합니다. 이 구조의 최소 iOS 버전은 26입니다.
4. 안내 화면이 필요하면 `FocusSetup/`를 로컬 Package로 추가하고 앱 대상에 `FocusSetup` 제품을 연결합니다. 필요 없으면 생략합니다.

```swift
import FocusSetup

// 기존 앱의 설정 버튼에서만 표시합니다.
present(FocusSetupViewController(), animated: true)
```

사용자는 설정 → 앱 → Safari → 확장 프로그램에서 Focus를 켜고, Safari 페이지 메뉴에서 접근을 허용합니다. 팝업 설정은 확장의 `browser.storage.local`에 저장되며 기존 앱의 설정 저장소를 건드리지 않습니다. 다른 앱에서 이 스위치를 직접 조작하는 App Group 연결은 포함하지 않습니다.

## 업데이트·재사용 조건

동작 코드와 앱 아이콘은 앱에 포함해 배포합니다. 서버에서 실행 코드를 내려받아 설치하는 통로는 제공하지 않습니다. 기존 앱과의 실제 결합 빌드·App Store 심사는 별도 작업입니다. 안내 화면 Package만 추가해도 확장이 자동 설치되지는 않습니다.

이 프로젝트 코드는 GPL-3.0-only이며 필터에도 개별 라이선스가 있습니다. 비공개 기존 앱에 그대로 포함해도 된다고 가정하지 마세요. 배포 전에 결합 방식·소스 공개 의무를 검토하거나 호환 가능한 라이선스의 구현으로 대체해야 합니다.

PiP·백그라운드 연속 재생의 기존 실기 검증 제한은 그대로입니다. 이름과 화면을 바꿨다고 해당 기능의 성공을 보장하지 않습니다.
