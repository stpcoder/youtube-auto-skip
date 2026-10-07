import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { repositoryRoot as root, inside, readJSON } from './lib/package-utils.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/installed-fixture') {
      response.setHeader('Content-Type', types['.html']);
      return response.end('<!doctype html><title>Installed local fixture</title><div id="ad" class="floating-mtop-banner"><div id="floating_mtop"><a href="https://www.pandalive.co.kr/evt/test">Advertisement</a></div></div><article id="content">Normal content</article><div id="generic" class="ad_banner">Local generic-hide exception</div>');
    }
    const file = inside(root, decodeURIComponent(path).slice(1));
    if (!(await stat(file)).isFile()) throw Error('Missing file');
    response.setHeader('Content-Type', types[extname(file)] || 'text/plain');
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'yas-browser-'));
const launch = process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chromium' };
const extensionRoot = resolve(process.env.EXTENSION_DIRECTORY || root);
const report = { browser: '', fixtures: [], extension: {}, locales: [] };
let browser, context;
const wait = (page, predicate) => page.waitForFunction(predicate, null, { timeout: 15000 });
const stats = page => page.evaluate(() => JSON.parse(document.documentElement.dataset.yasGeneralStatus || '{}'));
try {
  browser = await chromium.launch({ headless: true, ...launch });
  report.browser = browser.version();
  for (const fixture of ['prevention', 'early', 'content', 'buffering-recovery', 'interruption-notice']) {
    const page = await browser.newPage();
    await page.goto(`${base}/tests/${fixture}.html`);
    await wait(page, () => Array.isArray(window.fixtureResults) || Array.isArray(window.earlyFixtureResults) || /모든 검사 통과|검사 실패|실패한 검사 있음/.test(document.querySelector('#status')?.textContent || ''));
    const result = await page.evaluate(() => {
      const list = window.fixtureResults || window.earlyFixtureResults;
      return list ? { total: list.length, passed: list.filter(r => r.passed ?? r.ok).length, failures: list.filter(r => !(r.passed ?? r.ok)) }
        : { total: document.querySelectorAll('#results li').length, passed: document.querySelectorAll('#results li.pass').length, failures: [...document.querySelectorAll('.fail')].map(e => e.textContent) };
    });
    assert(result.total > 0);
    assert.equal(result.passed, result.total, JSON.stringify({ fixture, ...result }));
    report.fixtures.push({ fixture, ...result });
    await page.close();
  }
  for (const fixture of ['general', 'ad-slots']) {
    const page = await browser.newPage();
    await page.goto(`${base}/tests/${fixture}.html`);
    if (fixture === 'general') await wait(page, () => JSON.parse(document.documentElement.dataset.yasGeneralStatus || '{}').ready === true);
    await page.locator('#run').click();
    const result = await page.locator('#results').evaluate(e => JSON.parse(e.dataset.validation || e.textContent));
    assert.equal(result.passed, result.total, JSON.stringify({ fixture, ...result }));
    report.fixtures.push({ fixture, ...result });
    await page.close();
  }
  const safari = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await safari.goto(`${base}/tests/safari-media.html`);
  const media = () => safari.evaluate(() => JSON.parse(document.documentElement.dataset.yasSafariMediaStatus || '{}'));
  const mediaWait = predicate => wait(safari, predicate);
  await safari.locator('#yas-safari-tools #pip').click();
  assert.equal((await media()).mode, 'pip');
  await safari.locator('#reject-pip').click();
  await safari.locator('#yas-safari-tools #pip').click();
  await mediaWait(() => JSON.parse(document.documentElement.dataset.yasSafariMediaStatus).pipRejected > 0);
  await safari.locator('#yas-safari-tools #audio').click();
  assert.equal((await media()).audioStarted, 0);
  await safari.locator('#supply-audio').click();
  await safari.locator('#yas-safari-tools #audio').click();
  await mediaWait(() => JSON.parse(document.documentElement.dataset.yasSafariMediaStatus).mode === 'audio');
  await safari.locator('#resume-video').click();
  await mediaWait(() => JSON.parse(document.documentElement.dataset.yasSafariMediaStatus).mode === 'video');
  await safari.locator('#reject-audio').click();
  await safari.locator('#yas-safari-tools #audio').click();
  await mediaWait(() => JSON.parse(document.documentElement.dataset.yasSafariMediaStatus).audioErrors > 0);
  assert.equal((await media()).mode, 'video');
  assert.equal(await safari.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  report.fixtures.push({ fixture: 'safari-media', total: 7, passed: 7, simulated: true });
  await safari.close();
  await browser.close(); browser = null;

  context = await chromium.launchPersistentContext(profile, { headless: true, ...launch, args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`], ignoreDefaultArgs: ['--disable-extensions'] });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
  const id = new URL(worker.url()).host;
  const manifest = await readJSON(resolve(extensionRoot, 'manifest.json'));
  await worker.evaluate(async () => { await chrome.storage.local.set({ globalEnabled: true, disabledSites: [] }); });
  report.extension = await worker.evaluate(async () => ({ version: chrome.runtime.getManifest().version, settings: await chrome.storage.local.get(['generalError']), enabled: await chrome.declarativeNetRequest.getEnabledRulesets() }));
  assert.equal(report.extension.version, manifest.version);
  assert(!report.extension.settings.generalError);
  assert.deepEqual(report.extension.enabled, ['general_ads']);
  const target = await context.newPage();
  await target.goto(`${base}/installed-fixture`);
  await wait(target, () => JSON.parse(document.documentElement.dataset.yasGeneralStatus || '{}').ready === true && getComputedStyle(document.getElementById('ad')).display === 'none');
  assert.equal((await stats(target)).error, null);
  assert.equal((await stats(target)).genericAllowed, false);
  assert.notEqual(await target.locator('#generic').evaluate(e => getComputedStyle(e).display), 'none');
  assert.notEqual(await target.locator('#content').evaluate(e => getComputedStyle(e).display), 'none');
  report.extension.cosmetic = await stats(target);
  const blockedEvent = target.waitForEvent('requestfailed', { predicate: r => r.url().includes('/-ad-manager/probe.js'), timeout: 5000 });
  await target.evaluate(url => fetch(url).catch(() => null), `${base}/-ad-manager/probe.js`);
  assert.equal((await blockedEvent).failure().errorText, 'net::ERR_BLOCKED_BY_CLIENT');
  report.extension.networkBlocked = true;
  assert.equal(await target.evaluate(() => window.open('https://ad.ad4989.co.kr/ad') === null), true);
  report.extension.popupBlocked = true;
  await worker.evaluate(async () => { await chrome.storage.local.set({ globalEnabled: false }); });
  await wait(target, () => JSON.parse(document.documentElement.dataset.yasGeneralStatus).enabled === false && getComputedStyle(document.getElementById('ad')).display !== 'none');
  report.extension.disableRestoresContent = true;
  await worker.evaluate(async () => { await chrome.storage.local.set({ globalEnabled: true, disabledSites: ['127.0.0.1'] }); });
  await wait(target, () => JSON.parse(document.documentElement.dataset.yasGeneralStatus).enabled === false);
  // DNR updates run asynchronously after storage changes; poll their observable state.
  for (let i = 0; i < 50; i++) {
    if (await worker.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).some(r => r.action.type === 'allowAllRequests' && r.condition.requestDomains?.includes('127.0.0.1')))) break;
    if (i === 49) throw Error('Site exception did not produce a network allow rule');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  report.extension.siteException = true;
  await worker.evaluate(async () => { await chrome.storage.local.set({ globalEnabled: true, disabledSites: [] }); });
  await wait(target, () => getComputedStyle(document.getElementById('ad')).display === 'none');
  const [targetTab] = await worker.evaluate(async url => chrome.tabs.query({ url: `${url}/*` }), base);
  assert(targetTab?.id);
  for (const locale of ['en', 'pt_BR', 'id', 'ko']) {
    const catalog = await readJSON(resolve(extensionRoot, '_locales', locale, 'messages.json'));
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 400, height: 700 });
    await popup.addInitScript(({ catalog, locale, tab }) => {
      chrome.i18n.getMessage = (key, values = []) => catalog[key]?.message.replace(/\$(\d)/g, (_, n) => values[Number(n) - 1] ?? '') || '';
      chrome.i18n.getUILanguage = () => locale.replace('_', '-');
      // Redirect active-tab lookup to the real local page. Storage/messages/reload remain native APIs.
      chrome.tabs.query = async () => [tab];
    }, { catalog, locale, tab: targetTab });
    await popup.goto(`chrome-extension://${id}/general/popup.html`);
    await wait(popup, () => /\d/.test(document.getElementById('rules').textContent));
    assert.equal(await popup.title(), catalog.actionTitle.message);
    assert.equal(await popup.locator('h1').textContent(), catalog.popupTitle.message);
    assert.equal(await popup.locator('section').getAttribute('aria-label'), catalog.siteSection.message);
    assert.equal(await popup.locator('#version').textContent(), manifest.version);
    assert.equal(await popup.locator('#status').textContent(), catalog.refreshHint.message);
    assert.equal(await popup.locator('#page-state').textContent(), catalog.exceptionsApplied.message.replace('$1', (await stats(target)).selectors.toLocaleString(locale.replace('_', '-'))));
    for (const scheme of ['light', 'dark']) {
      await popup.emulateMedia({ colorScheme: scheme });
      const layout = await popup.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, height: document.querySelector('main').getBoundingClientRect().height }));
      assert.equal(layout.overflow, false, `${locale}/${scheme} horizontal overflow`);
      assert(layout.height < 600, `${locale}/${scheme} exceeds Chrome popup height`);
      if (locale === 'pt_BR' && process.env.UPDATE_SCREENSHOTS === '1') {
        await mkdir(resolve(root, 'docs/assets'), { recursive: true });
        await popup.locator('main').screenshot({ path: resolve(root, `docs/assets/popup.pt-BR${scheme === 'dark' ? '.dark' : ''}.png`) });
      }
    }
    await popup.locator('#enabled').uncheck();
    await popup.waitForFunction(expected => document.getElementById('page-state').textContent === expected, catalog.siteOff.message);
    await wait(target, () => getComputedStyle(document.getElementById('ad')).display !== 'none');
    await popup.locator('#enabled').check();
    await wait(target, () => getComputedStyle(document.getElementById('ad')).display === 'none');
    await popup.locator('#reload-page').click();
    await popup.waitForFunction(expected => document.getElementById('page-state').textContent === expected, catalog.pageReloaded.message);
    await wait(target, () => JSON.parse(document.documentElement.dataset.yasGeneralStatus || '{}').ready === true);
    for (const [key, response] of [
      ['siteOnly', { ready: true, mode: 'site-only' }],
      ['noPageRules', { ready: true, applied: false }],
      ['filtersPreparing', { ready: false }],
      ['pageFilterError', { error: 'fixture error' }],
      ['pageNeedsReload', null]
    ]) {
      await popup.evaluate(result => {
        chrome.tabs.sendMessage = async () => result;
        document.getElementById('enabled').dispatchEvent(new Event('change'));
      }, response);
      await popup.waitForFunction(expected => document.getElementById('page-state').textContent === expected, catalog[key].message.replace('$1', 'fixture error'));
    }
    report.locales.push({ locale, title: catalog.actionTitle.message, themes: ['light', 'dark'], nativeStorageAndReload: true, simulatedDiagnosticStates: 5 });
    await popup.close();
  }
  await mkdir(resolve(root, 'build'), { recursive: true });
  await writeFile(resolve(root, 'build/browser-validation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Chromium ${report.browser}: ${report.fixtures.reduce((sum, item) => sum + item.passed, 0)} fixture checks, installed blocking/exceptions, four locales in two themes passed.`);
} finally {
  if (browser) await browser.close();
  if (context) await context.close();
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
