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
      return response.end('<!doctype html><title>Installed local fixture</title><div id="ad" class="floating-mtop-banner"><div id="floating_mtop"><a href="https://www.pandalive.co.kr/evt/test">Advertisement</a></div></div><article id="content">Normal content</article><div id="generic" class="ad_banner">Local generic-hide exception</div><a id="rotated-banner" href="https://new-host.example/popunder.php?zone=1" target="_blank"><img alt="Fixture banner" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2230%22%3E%3C/svg%3E"></a><a id="normal-image-link" href="https://accounts.example/login" target="_blank"><img alt="Normal linked image" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2230%22%3E%3C/svg%3E"></a>');
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
const wait = (page, predicate, argument = null) => page.waitForFunction(predicate, argument, { timeout: 15000 });
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
  await safari.locator('#yas-safari-tools').waitFor();
  assert.equal(await safari.locator('#yas-safari-tools').evaluate(e => getComputedStyle(e).position), 'fixed');
  await safari.locator('#yas-safari-tools #pip').click();
  assert.equal((await media()).mode, 'pip');
  await safari.locator('#reject-pip').click();
  await safari.locator('#yas-safari-tools #pip').click();
  await mediaWait(() => JSON.parse(document.documentElement.dataset.yasSafariMediaStatus).pipRejected > 0);
  await safari.locator('#yas-safari-tools #background').click();
  await mediaWait(() => JSON.parse(document.documentElement.dataset.yasSafariMediaStatus).mode === 'background-video');
  await safari.locator('#yas-safari-tools #background').click();
  await safari.locator('#supply-audio').click();
  await safari.locator('#yas-safari-tools #background').click();
  await mediaWait(() => JSON.parse(document.documentElement.dataset.yasSafariMediaStatus).mode === 'background-video');
  assert.equal(await safari.locator('audio').count(), 0);
  assert.equal(await safari.evaluate(() => pauseCalls), 0);
  await safari.locator('#yas-safari-tools #background').click();
  assert.equal((await media()).background, 'off');
  await safari.locator('#yas-safari-tools #background').click();
  assert.equal((await media()).mode, 'background-video');
  assert.equal(await safari.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  report.fixtures.push({ fixture: 'safari-media', total: 9, passed: 9, simulated: true });
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
  await wait(target, () => getComputedStyle(document.getElementById('rotated-banner')).display === 'none');
  assert.notEqual(await target.locator('#normal-image-link').evaluate(e => getComputedStyle(e).display), 'none');
  assert((await stats(target)).detectedSlots >= 1);
  await target.evaluate(() => {
    for (const id of ['ts_ms_fixture', 'normal-empty-frame']) {
      const wrapper = document.createElement('div');
      wrapper.id = id;
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-same-origin');
      wrapper.append(frame); document.body.append(wrapper);
    }
  });
  await wait(target, () => getComputedStyle(document.getElementById('ts_ms_fixture')).display === 'none');
  assert.notEqual(await target.locator('#normal-empty-frame').evaluate(e => getComputedStyle(e).display), 'none');
  report.extension.documentWrittenAdSlot = true;
  await target.route('https://static.wixstatic.com/media/*', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"/>' }));
  await target.evaluate(() => {
    for (const [id, file] of [['verified-creative', '965249_0c31528e8d4b4d43883ee8ab88d8870d~mv2.gif'], ['normal-cdn-image', 'normal-photo.gif']]) {
      const link = document.createElement('a'); link.id = id; link.href = 'https://normal.example/';
      const img = document.createElement('img'); img.src = 'https://static.wixstatic.com/media/' + file;
      link.append(img); document.body.append(link);
    }
  });
  await wait(target, () => getComputedStyle(document.getElementById('verified-creative')).display === 'none');
  assert.notEqual(await target.locator('#normal-cdn-image').evaluate(e => getComputedStyle(e).display), 'none');
  report.extension.verifiedCreativeHiddenWithoutCdnBlock = true;
  await target.evaluate(base => {
    const fixture=document.createElement('div');fixture.id='observed-banner-fixture';
    fixture.innerHTML=`<section class="banner_box"><div id="observed-first-party-ad" class="banner"><a href="https://advertiser.example/"><img src="${base}/storage/banner/fixture.png"></a></div><div id="normal-banner-notice" class="banner"><a href="https://t.me/official_notice"><img src="${base}/storage/banner/notice.png"></a></div></section><div id="observed-popup-ad" class="hd_pops"><div class="hd_pops_con"><a href="https://mdsb-2013.com/"><img src="${base}/notice.png"></a></div><button>Close</button></div><div id="normal-popup-notice" class="hd_pops"><div class="hd_pops_con"><a href="${base}/"><img src="${base}/notice.png"></a></div></div><a id="observed-grid-ad" class="grid-asset" href="https://advertiser.example/"><img src="${base}/theme/movie/img/banners/fixture.png"></a><a id="normal-grid-notice" class="grid-asset" href="https://t.me/official_notice"><img src="${base}/theme/movie/img/banners/notice.png"></a><a id="normal-video-item" class="grid-asset" href="${base}/video"><img src="${base}/videos/thumbnail.webp"></a><div id="observed-shadow-ad" class="mb_ai_div"></div>`;
    document.body.append(fixture);
  },base);
  for(const id of ['observed-first-party-ad','observed-popup-ad','observed-grid-ad','observed-shadow-ad'])await wait(target,id=>getComputedStyle(document.getElementById(id)).display==='none',id);
  for(const id of ['normal-banner-notice','normal-popup-notice','normal-grid-notice','normal-video-item'])assert.notEqual(await target.locator('#'+id).evaluate(e=>getComputedStyle(e).display),'none');
  report.extension.sharedBannerTemplatesPreserveNotices = true;
  await target.evaluate(base=>{
    const shield=document.createElement('div');shield.id='observed-popup-shield';shield.className='popup_container';shield.style.cssText='position:fixed;inset:0;z-index:99999;pointer-events:auto';
    shield.innerHTML=`<div class="popup_wrapper"><div id="shield-ad-notice" class="hd_pops"><div class="hd_pops_con"><a href="https://mdsb-2013.com/"><img src="${base}/advertisement.png"></a></div></div><div id="shield-normal-notice" class="hd_pops"><div class="hd_pops_con"><a href="${base}/official-notice"><img src="${base}/normal-notice.png"></a></div><button>Close normal notice</button></div></div>`;
    document.body.append(shield);
  },base);
  await wait(target,()=>document.querySelector('#shield-ad-notice').getAttribute('data-focus-ad-slot')==='true');
  assert.notEqual(await target.locator('#observed-popup-shield').evaluate(e=>getComputedStyle(e).display),'none');
  assert.notEqual(await target.locator('#shield-normal-notice').evaluate(e=>getComputedStyle(e).display),'none');
  await target.evaluate(()=>document.getElementById('shield-normal-notice').remove());
  await wait(target,()=>getComputedStyle(document.getElementById('observed-popup-shield')).display==='none');
  assert.equal(await target.evaluate(()=>document.elementsFromPoint(innerWidth/2,innerHeight/2).some(n=>n.id==='observed-popup-shield')),false);
  report.extension.emptyAdOverlayDoesNotIntercept = true;
  await target.route('https://nfiolnpavrz.in/av/focus-local-fixture.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  const providerScript = target.waitForEvent('requestfailed', { predicate: r => r.url() === 'https://nfiolnpavrz.in/av/focus-local-fixture.js', timeout: 5000 });
  await target.evaluate(() => { const script = document.createElement('script'); script.src = 'https://nfiolnpavrz.in/av/focus-local-fixture.js'; document.head.append(script); });
  assert.equal((await providerScript).failure().errorText, 'net::ERR_BLOCKED_BY_CLIENT');
  report.extension.observedPopunderScriptBlocked = true;
  report.extension.urlBasedSlots = true;
  report.extension.cosmetic = await stats(target);
  const blockedEvent = target.waitForEvent('requestfailed', { predicate: r => r.url().includes('/-ad-manager/probe.js'), timeout: 5000 });
  await target.evaluate(url => fetch(url).catch(() => null), `${base}/-ad-manager/probe.js`);
  assert.equal((await blockedEvent).failure().errorText, 'net::ERR_BLOCKED_BY_CLIENT');
  report.extension.networkBlocked = true;
  assert.equal(await target.evaluate(() => window.open('https://ad.ad4989.co.kr/ad') === null), true);
  assert.equal(await target.evaluate(() => window.open('https://new-host.example/popunder.php?zone=1') === null), true);
  assert.equal(await target.evaluate(() => window.open('https://ethnicexpressions.org/4/test') === null), true);
  report.extension.popupBlocked = true;
  await worker.evaluate(async()=>{await chrome.storage.local.set({siteFeatures:{'127.0.0.1':{providers:false,banners:true,popups:true}}});});
  for(let i=0;i<50;i++){
    if(await worker.evaluate(async()=>(await chrome.declarativeNetRequest.getDynamicRules()).some(r=>r.condition.requestDomains?.includes('127.0.0.1'))))break;
    if(i===49)throw Error('Provider category did not create a network exception');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  await target.reload();await wait(target,()=>JSON.parse(document.documentElement.dataset.yasGeneralStatus||'{}').features?.providers===false&&getComputedStyle(document.getElementById('ad')).display==='none');
  assert.equal(await target.evaluate(url=>fetch(url).then(()=>true,()=>false),`${base}/-ad-manager/probe.js`),true);
  assert.equal(await target.evaluate(()=>window.open('https://ad.ad4989.co.kr/ad')===null),true);
  await worker.evaluate(async()=>{await chrome.storage.local.set({siteFeatures:{'127.0.0.1':{providers:true,banners:false,popups:true}}});});
  for(let i=0;i<50;i++){
    if(await worker.evaluate(async()=>(await chrome.declarativeNetRequest.getDynamicRules()).every(r=>!r.condition.requestDomains?.includes('127.0.0.1'))))break;
    if(i===49)throw Error('Provider category exception was not removed');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  await target.reload();await wait(target,()=>JSON.parse(document.documentElement.dataset.yasGeneralStatus||'{}').features?.banners===false);
  assert.notEqual(await target.locator('#ad').evaluate(e=>getComputedStyle(e).display),'none');
  assert.equal(await target.evaluate(()=>window.open('https://ad.ad4989.co.kr/ad')===null),true);
  const categoryBlocked=target.waitForEvent('requestfailed',{predicate:r=>r.url().includes('/-ad-manager/probe.js'),timeout:5000});
  await target.evaluate(url=>fetch(url).catch(()=>null),`${base}/-ad-manager/probe.js`);
  assert.equal((await categoryBlocked).failure().errorText,'net::ERR_BLOCKED_BY_CLIENT');
  await worker.evaluate(async()=>{await chrome.storage.local.set({siteFeatures:{'127.0.0.1':{providers:true,banners:true,popups:false}}});});
  await wait(target,()=>JSON.parse(document.documentElement.dataset.yasGeneralStatus).features?.popups===false&&getComputedStyle(document.getElementById('ad')).display==='none');
  assert.equal(await target.evaluate(()=>JSON.parse(document.documentElement.dataset.yasPopupStatus).enabled),false);
  await worker.evaluate(async()=>{await chrome.storage.local.set({siteFeatures:{}});});
  await wait(target,()=>JSON.parse(document.documentElement.dataset.yasPopupStatus).enabled===true);
  // Recreate the provider slot for the master-off restoration assertion below.
  await target.evaluate(()=>{const div=document.createElement('div');div.id='ts_ms_fixture';const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-same-origin');div.append(frame);document.body.append(div);});
  report.extension.siteChecklistIndependent = true;
  await worker.evaluate(async () => { await chrome.storage.local.set({ globalEnabled: false }); });
  await wait(target, () => JSON.parse(document.documentElement.dataset.yasGeneralStatus).enabled === false && getComputedStyle(document.getElementById('ad')).display !== 'none');
  report.extension.disableRestoresContent = true;
  assert.notEqual(await target.locator('#ts_ms_fixture').evaluate(e => getComputedStyle(e).display), 'none');
  assert.notEqual(await target.locator('#rotated-banner').evaluate(e => getComputedStyle(e).display), 'none');
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
