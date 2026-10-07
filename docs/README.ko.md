# YouTube Auto Skip + Adblock

일반 사이트 광고 차단과 YouTube 전용 광고 사전 처리·자동 건너뛰기를 함께 제공하는 Chrome Manifest V3 확장입니다. **3.0.0 공개 시험판**이며 모든 광고 차단이나 즉시 재생을 보장하지 않습니다.

[Português (Brasil)](../README.md) · [English](README.en.md) · [Bahasa Indonesia](README.id.md)

## 설치

1. [시험판 릴리스](https://github.com/stpcoder/youtube-auto-skip/releases/tag/v3.0.0-preview.1)의 ZIP을 내려받아 `youtube-auto-skip` 폴더를 풉니다.
2. `chrome://extensions`에서 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**에서 `manifest.json`이 있는 폴더를 선택합니다.
4. 버전 **3.0.0**을 확인하고 YouTube를 포함한 기존 탭을 새로고침합니다.
5. 확장 아이콘을 눌러 일반 광고 차단과 현재 사이트 예외를 설정합니다.

데스크톱 Chrome 111 이상이 필요합니다. Chrome 웹 스토어에는 아직 등록하지 않았습니다. 이 공개 패키지는 Firefox·Safari·iPhone·YouTube 앱을 지원한다고 검증되지 않았습니다. 업데이트할 때 파일을 교체하고 확장과 웹페이지를 각각 새로고침합니다.

일반 차단 토글과 사이트 예외는 YouTube 전용 기능과 별개입니다. 모든 기능을 중단하려면 확장 관리 화면에서 확장을 끕니다.

## 동작과 한계

EasyList·YousList를 변환한 네트워크 규칙 29,893개와 화면 필터 항목 30,236개를 포함합니다. 알려진 광고 서버로 향하는 팝업을 막고, YouTube에서는 알려진 플레이어 응답의 광고 필드를 제거한 뒤 필요하면 JS 스킵·버튼 클릭으로 보완합니다. 초기 빈 버퍼에서는 원래 시작 위치를 유지하는 제한적 재생 복구를 시도합니다.

지원하지 않는 필터와 변환 제한은 [`filters/provenance.json`](../filters/provenance.json)에 기록했습니다. 전체 uBlock Origin·AdGuard 엔진과 같은 지원 범위가 아닙니다. 브라질·인도네시아 지역 필터는 아직 추가하지 않았으며, 해당 지역 사이트의 별도 실사용 검증도 완료하지 않았습니다. 끊김 안내 숨김은 현재 한국어 YouTube 문구만 대상으로 합니다.

HTTP/HTTPS 사이트 권한은 일반 필터링에 사용합니다. 설정은 `storage`로 로컬에 보관하고, `scripting`으로 CSS를 적용하며, `declarativeNetRequest`와 `webNavigation`으로 광고 요청과 광고 팝업을 처리합니다. `debugger`는 YouTube 버튼 클릭 보완에만 사용하며 Chrome 제어 안내가 표시될 수 있습니다. 이 릴리스 코드에는 유지관리자에게 보내는 원격 통계 수집이 없습니다. 필터는 설치 패키지에 포함하고 새 릴리스로 갱신합니다.

## 개발과 기여

Node.js 22 이상에서 `npm ci`, `npm test`, `npm run check:package`, `npm run build:release`를 실행합니다. 설치에는 포함된 필터를 그대로 사용합니다. `npm run build:filters -- --offline`은 저장한 필터 소스를 변환하고, 온라인 빌드는 새 소스를 받아 차단 범위가 달라질 수 있습니다.

자동 테스트는 모의 동작과 패키지 무결성을 확인하며 전체 YouTube 실사용 성공률을 뜻하지 않습니다. [기술 문서](TECHNICAL.md)와 [기여 안내](../CONTRIBUTING.md)를 참고하고, [이슈](https://github.com/stpcoder/youtube-auto-skip/issues/new/choose)에 Chrome·확장 버전, 재현 순서와 관측 결과를 남겨 주세요.

코드는 [GPL-3.0-only](../LICENSE), 필터 데이터는 [별도 출처와 라이선스](../THIRD_PARTY_NOTICES.md)를 따릅니다. YouTube·Google과 관계없는 독립 프로젝트입니다.
