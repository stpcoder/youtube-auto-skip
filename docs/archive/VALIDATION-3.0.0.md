# Publication validation — 2026-10-08

Tested the public Chrome 3.0.0 snapshot in a disposable profile using Chromium / Chrome for Testing 153.0.8010.12. No existing user browser profile was used.

- Node fixtures: **130 passed, 0 failed**.
- Browser DOM fixtures: **56 passed, 0 failed** (prevention 12, early skip 10, button fallback 10, buffering recovery 12, interruption notice 12).
- Package checks passed: manifest references and worker imports, separate policy assets per execution world, four complete locale catalogs and substitution parameters, filter counts and original source SHA-256 hashes.
- Installed-extension integration checks passed on a local HTTP fixture: the bundled DNR engine blocked a matching request with `ERR_BLOCKED_BY_CLIENT`; cosmetic filtering hid a known ad element while preserving normal content; a known ad popup was suppressed; turning general filtering off restored content; a site exception created the expected allow rule.
- The popup rendered title, labels, accessibility text and dynamic counts for English, Brazilian Portuguese, Indonesian and Korean. Locale APIs were supplied with each bundled catalog for these renderer checks; this does not establish operating-system language selection behavior for every platform. The extension's native UI language in the test profile was Korean.

The Portuguese screenshot in `docs/assets/popup.pt-BR.png` comes from this local popup renderer test. It is not a live YouTube demonstration.

The installed integration checks found an initial cosmetic-policy initialization failure when the same file path was listed in both MAIN and ISOLATED content-script entries. The public package uses separate, identical policy assets and passed the follow-up installation check.

No live YouTube account or regional website effectiveness test was performed for this public snapshot. Simulated fixtures and local integration checks do not prove all-ad coverage, server-wait removal, or Brazilian/Indonesian site coverage. Remaining development dependency advisories are described in [TECHNICAL.md](../TECHNICAL.md).
