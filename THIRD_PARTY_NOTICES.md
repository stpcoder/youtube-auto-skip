# Third-party sources and licenses

Project-owned code is distributed under [GPL-3.0-only](LICENSE). Filter datasets retain their separate licenses and source attribution.

| Source | Attribution | License | Changes and outputs |
| --- | --- | --- | --- |
| [EasyList](https://github.com/easylist/easylist) | EasyList authors and contributors | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | Network conversion, native cosmetics and cosmetic-policy exceptions; `filters/`, `general/rule-data.js` and generated bundle data |
| [YousList](https://github.com/yous/YousList) | YousList contributors | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Same transformations; original snapshot retained in `filters/sources/youslist.txt` |

EasyList-derived data remains CC BY-SA 3.0. Original snapshots preserve upstream headers and hashes. The mixed outputs retain attribution and the applicable share-alike conditions. Development converters and browser-test libraries are not included as executable dependencies in extension ZIPs. `fflate` (MIT) creates release archives in Node.js; it is not extension runtime code.

The bounded YouTube recovery also references the `eafg` request condition in [uBlock Origin uAssets](https://github.com/uBlockOrigin/uAssets); the anti-adblock guard references the `google_ad_status` approach discussed by [RemoveAdblockThing](https://github.com/TheRealJoelmatic/RemoveAdblockThing). This is an independent project.

# 외부 자료와 라이선스

일반 필터는 별도 라이선스가 있는 데이터이며 원본과 변경 내역을 함께 보존합니다.

- **EasyList**: The EasyList authors, https://easylist.to/ 와 https://github.com/easylist/easylist. 이 프로젝트에서는 **CC BY-SA 3.0** 조건으로 이용합니다: https://creativecommons.org/licenses/by-sa/3.0/legalcode . 원본은 `filters/sources/easylist.txt`, 변환물은 `filters/network.json`, `filters/cosmetic.json`, `filters/cosmetic-policy.json`, `general/rule-data.js` 및 이를 포함한 번들의 필터 데이터입니다. AdGuard DNR 변환, YouTube 제외, 직접 탐색 제외, 화면 숨김 예외의 별도 컴파일 및 지원하지 않는 규칙의 생략이라는 변경을 적용했습니다. EasyList에서 파생한 필터 데이터는 같은 라이선스로 제공합니다.
- **YousList**: YousList contributors, https://github.com/yous/YousList. **CC BY 4.0**: https://creativecommons.org/licenses/by/4.0/legalcode . 원본은 `filters/sources/youslist.txt`입니다. 위와 같은 데이터 변환을 적용했습니다. 혼합 필터 출력의 EasyList 파생 부분에는 위의 공유 조건도 적용됩니다.
- **AdGuard DNR Converter 2.0.0 / RE2 WASM 1.2.0**: https://github.com/AdguardTeam/tsurlfilter. 개발 시 사용하는 GPL-3.0-only 도구입니다. npm 잠금 파일로 버전을 고정합니다. 이 엔진의 실행 코드를 Chrome/Safari 확장에 배포하지 않으며 생성한 데이터만 포함합니다. npm 패키지에 각 라이선스가 포함됩니다.
- **AdGuard prevent-window-open**: https://github.com/AdguardTeam/Scriptlets/blob/master/src/scriptlets/prevent-window-open.js. URL 조건으로 `window.open`을 차단하는 설계를 확인했습니다. 이 파일의 구현을 복사하지 않았으며, 이 프로젝트의 좁은 URL 정책은 독립 구현입니다.
- **uBlock Origin Lite**: https://github.com/uBlockOrigin/uBOL-home 및 https://github.com/gorhill/uBlock/tree/01092d95dbc7d91599a5ad017d5b98aba1118659/platform/mv3 . GPL-3.0인 upstream의 일반/사이트별 CSS·예외 분리, 등록 방식, 고급 필터 지원 범위를 설계 비교용으로 읽었습니다. 실행 코드·스크립틀릿을 복사하거나 이 확장에 포함하지 않았습니다. 이 프로젝트의 화면 숨김 예외 파서와 실행 로직은 독립 구현입니다.
- **PiPifier**: https://github.com/arnoappenzeller/PiPifier, MIT. Safari의 `webkitSetPresentationMode` 호출 경로를 참고했습니다. 구현 코드를 복사하지 않았습니다.

필터 수집 시각·SHA-256·규칙 수·변환 제한은 `filters/provenance.json`에 기록합니다. 원격 실행 코드는 받아들이지 않습니다.
