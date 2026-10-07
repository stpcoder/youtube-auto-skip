# 테스트

## 자동 검사

저장소 루트에서 실행합니다.

```sh
npm test
```

YouTube 응답 처리·광고 스킵·버퍼 복구·안내 숨김, 일반 네트워크 규칙·화면 필터·예외·광고 팝업, Safari 재생 도구를 검사합니다. 실제 계정이나 광고 서버에 접속하지 않는 회귀 검사입니다.

## 브라우저 재현 페이지

```sh
npm run preview
```

아래 경로를 `http://127.0.0.1:8766/` 뒤에 붙여 브라우저에서 엽니다.

- `tests/general.html`: 일반·동적 배너, 광고 새 창, 정상 링크와 필터 예외.
- `tests/ad-slots.html`: 광고 영역 숨김과 정상 헤더·메뉴·본문 보존.
- `tests/popup-preview.html`: 모의 Chrome API를 사용하는 설정창 미리보기.
- `tests/prevention.html`, `tests/early.html`, `tests/content.html`: YouTube 응답 처리·JS 스킵·버튼 보조 경로.
- `tests/buffering-recovery.html`, `tests/interruption-notice.html`: 초기 복구와 안내 숨김.
- `tests/safari-media.html`: Safari 재생 도구의 상태 전환.

재현 페이지는 실제 CSS와 로컬 소스를 사용하지만 확장 API·영상 응답 일부를 모의합니다. 통과 결과는 실제 설치본의 광고 제거율이나 iPhone의 PiP·잠금 화면 재생 성공을 의미하지 않습니다.

수동 실행의 캡처와 관측 로그는 소스와 분리해 보관합니다. 필터의 원본·해시·변환 제한은 `filters/`에 계속 보존합니다.

설치본 브라우저 자동 검사는 `npx playwright install chromium` 후 `npm run test:browser`로 실행합니다. 별도 임시 프로필과 로컬 페이지만 사용합니다. `BROWSER_EXECUTABLE`로 이미 설치한 Chromium 실행 파일을 지정할 수 있습니다. 팝업 미리보기는 `?lang=pt-BR`, `en`, `id`, `ko`를 지원합니다.
