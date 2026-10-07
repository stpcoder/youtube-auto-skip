# Third-party sources and licenses

The project's own code is distributed under GPL-3.0-only. Filter data is separately licensed; the code license does not replace these terms.

| Source | Attribution | License | Included files |
| --- | --- | --- | --- |
| [EasyList](https://github.com/easylist/easylist) | EasyList authors and contributors | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), selected from EasyList's [dual-license options](https://easylist.to/pages/licence.html) | `filters/sources/easylist.txt` and derived filter data |
| [YousList](https://github.com/yous/YousList) | YousList contributors | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `filters/sources/youslist.txt` and derived filter data |

The generated filter datasets in `filters/network.json`, `filters/cosmetic.json` and the data payload in `general/rule-data.js` are adaptations distributed under CC BY-SA 3.0, with attribution to both source projects. The original source snapshots retain their respective licenses. Project-owned wrapper code remains GPL-3.0-only.

Modifications include conversion into Chrome declarative rules, a bounded rule selection, exclusion of YouTube requests from general filtering, extraction of native cosmetic selectors, and extraction of unconditional ad-server host rules for popup checks. Some unsupported filters are omitted. `filters/provenance.json` records source URLs, SHA-256 hashes, conversion limits and counts. Original headers are preserved in the source snapshots.

The filter-build tool uses [`@adguard/dnr-converter`](https://github.com/AdguardTeam/tsurlfilter) and `@adguard/re2-wasm` as development dependencies. Their licenses and transitive dependency licenses are supplied by their npm packages. No downloaded third-party executable scriptlets are included in the extension package.

The YouTube prevention and bounded startup-recovery work references [uBlock Origin uAssets](https://github.com/uBlockOrigin/uAssets), including its `eafg` request condition. The anti-adblock guard references the `google_ad_status` approach discussed by [RemoveAdblockThing](https://github.com/TheRealJoelmatic/RemoveAdblockThing). These sources describe related approaches; this project is independent and is not endorsed by their maintainers.
