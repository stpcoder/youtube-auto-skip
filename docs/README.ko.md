# AdBlock + YouTube

[Português (Brasil)](../README.md) · [English](README.en.md) · [Bahasa Indonesia](README.id.md)

일반 웹 광고 차단과 YouTube 광고 차단·자동 스킵을 함께 제공하는 Chrome 확장 프로그램입니다.

현재 Chrome 버전: **3.0.4** · Chrome 111 이상

## 주요 기능

- **일반 광고 차단**: EasyList·YousList 기반의 광고 요청 차단과 배너 숨김.
- **광고 팝업 차단**: 알려진 광고 주소를 여는 새 창과 광고 링크 처리.
- **YouTube 광고 차단**: 플레이어 응답의 광고 정보 사전 처리, 광고 종료 시도와 스킵 버튼 자동 클릭.
- **YouTube 재생 보조**: 초기 빈 버퍼 복구 시도와 끊김 안내 문구 숨김. 다른 재생 오류 알림은 유지합니다.
- **사이트별 제어**: 일반 광고 차단 전체 또는 현재 사이트의 차단을 켜고 끌 수 있습니다.

YouTube 특화 기능은 일반 사이트 차단 설정과 별도로 동작합니다.

## Chrome 설치

1. [릴리스](https://github.com/stpcoder/youtube-auto-skip/releases/tag/v3.0.4-preview.1)의 `youtube-auto-skip-chrome-3.0.4.zip`을 받아 압축을 풉니다.
2. Chrome의 `chrome://extensions`에서 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램 로드**를 누르고 `manifest.json`이 있는 `youtube-auto-skip` 폴더를 선택합니다.
4. 확장 버튼을 열어 일반 광고 차단 설정을 확인합니다.

Node.js나 빌드는 설치에 필요하지 않습니다. GitHub의 Code → Download ZIP 또는 git clone으로 받은 저장소 루트도 직접 설치할 수 있습니다. [설치 선택지와 문제 해결](INSTALL.md)

업데이트할 때는 기존에 설치한 폴더의 파일을 갱신하고 확장 관리 화면에서 이 확장을 새로고침한 뒤, 사용 중인 웹 페이지도 새로고침하세요. 기존 설정은 유지됩니다. 사이트 이용에 문제가 생기면 해당 사이트의 차단을 끌 수 있습니다.

## iPhone / Safari

Safari 확장 소스 1.1.1은 별도 **개발판**입니다. Chrome과 공유하는 일반 광고 필터, YouTube 광고 처리·모바일 초기 로딩 복구, PiP·조건부 백그라운드 재생 도구를 포함합니다. 이전 공개 ZIP 1.0.0에는 이 변경이 없습니다. iPhone에는 확장을 담는 iOS 앱을 서명·설치해야 합니다.

실제 iPhone의 PiP·홈 화면·잠금 화면 재생은 아직 검증하지 않았습니다. 백그라운드는 별도 오디오로 전환하지 않고 기존 동영상을 유지하며, iOS가 강제 중단하는 재생을 보장하지 않습니다. 일반 사이트 차단은 사이트 접근 권한이 필요합니다. [설치 방법과 지원 범위](../safari/README.md)

## 개발

```sh
npm ci
npm run verify
npm run build:release
npm run preview
```

개발에는 Node.js 22 이상을 사용합니다. `build:release`는 Chrome 설치 ZIP과 Safari 개발 소스 ZIP, 체크섬을 생성하며 외부 ZIP 도구나 Xcode가 필요하지 않습니다.

일반 광고 차단 소스를 변경하면 `build:general`로 Chrome에 포함되는 번들을 다시 생성합니다.

```sh
# 최신 필터 다운로드 및 변환
npm run build:filters

# 보관된 원본 필터로 재생성
npm run build:filters -- --offline

# Safari 개발판 생성
npm run build:safari
```

필터 빌드에는 일반 번들 생성도 포함됩니다. 변경 사항 적용에는 확장과 웹 페이지의 새로고침이 필요합니다. 브라우저 재현 검사 방법은 [테스트 안내](../tests/README.md)를 참고하세요.

## 저장소 구성

- 루트의 JavaScript: YouTube 광고 처리·스킵·재생 보조와 Chrome 서비스 워커.
- `general/`: 일반 광고 차단, 팝업 보호, 설정창, 호환성 규칙과 배포 번들.
- `filters/`: 필터 원본, 변환 데이터와 출처·해시·지원 제한 기록.
- `scripts/`: 필터 변환 및 Chrome/Safari 빌드 도구.
- `tests/`: 자동 검사와 로컬 브라우저 재현 페이지.
- `safari/`: 일반 광고 차단·YouTube Safari 확장 소스와 iPhone 설치 안내.

## 지원 범위

필터 목록과 지원하는 규칙에 기반해 동작하며 모든 사이트·광고를 완전히 차단하지는 않습니다. Chrome 규칙 한도에 따른 일부 생략이 있고, 고급 절차형 필터·스크립틀릿·일부 주소 조건은 지원하지 않습니다. 필터는 로컬 묶음으로 제공하며 자동 갱신하지 않습니다.

YouTube 구현이나 서버 정책이 바뀌면 광고 처리와 복구가 동작하지 않을 수 있습니다. 끊김 안내 숨김은 버퍼링 해결과 별개이며, 서버의 초기 대기 제거를 보장하지 않습니다.

일반 사이트 처리를 위해 HTTP/HTTPS 페이지 접근 권한을 사용합니다. `debugger` 권한은 YouTube 스킵 버튼의 보조 입력에 사용하며, 이 경로에서는 Chrome의 제어 알림이 표시될 수 있습니다. 방문 기록을 외부 분석 서버로 전송하는 코드는 포함하지 않습니다.

## 출처와 라이선스

[EasyList](https://github.com/easylist/easylist)와 [YousList](https://github.com/yous/YousList) 필터 데이터를 사용합니다. 외부 프로젝트의 전체 실행 엔진을 포함하는 것은 아닙니다. 원본·라이선스·변환 내역은 [외부 자료 고지](../THIRD_PARTY_NOTICES.md)와 `filters/provenance.json`에 보존합니다.
