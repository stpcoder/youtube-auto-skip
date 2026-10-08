import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { repositoryRoot as root, inside } from './lib/package-utils.mjs';

const output = resolve(root, 'build/focus-ui');
await mkdir(output, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  try {
    const file = inside(root, new URL(request.url, 'http://localhost').pathname.slice(1));
    if (!(await stat(file)).isFile()) throw Error('Missing file');
    response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const report = { popupChecks: 0, widths: [], mockedSafariAPIs: true };
try {
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chromium' }) });
  report.browser = browser.version();
  for (const width of [280, 320, 390, 768]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.addInitScript(() => {
      window.focusFixture = { settings: JSON.parse(sessionStorage.getItem('focus-settings') || 'null') || { globalEnabled: true, disabledSites: [], siteFeatures: {} }, tab: { id: 4, url: sessionStorage.getItem('focus-tab') || 'https://news.example/article' }, menuRequests: 0,
        result: { youtube: false, networkEnabled: true, general: { applied: true, error: null } } };
      window.browser = {
        tabs: { query: async () => [focusFixture.tab] },
        storage: { local: { get: async defaults => ({ ...defaults, ...focusFixture.settings }), set: async data => { Object.assign(focusFixture.settings, data);sessionStorage.setItem('focus-settings',JSON.stringify(focusFixture.settings)); } } },
        runtime: { sendMessage: async message => {
          if (message.type === 'FOCUS_SITE_FEATURES') {
            const values={providers:true,banners:true,popups:true};
            for(const [domain,override] of Object.entries(focusFixture.settings.siteFeatures||{}).sort((a,b)=>a[0].length-b[0].length))if(message.host===domain||message.host.endsWith('.'+domain))Object.assign(values,override);
            return values;
          }
          if (message.type === 'YAS_DIAGNOSE') return focusFixture.result;
          if (message.type === 'FOCUS_SHOW_PLAYBACK') { focusFixture.menuRequests++; return { ok: true }; }
          return { ok: true };
        } },
      };
    });
    await page.goto(`${base}/safari/extension/popup.html`);
    await page.waitForFunction(() => !document.querySelector('#global').disabled);
    assert.equal(await page.title(), 'Focus');
    assert.equal(await page.locator('#status').isVisible(), false);
    assert.equal(await page.locator('#diagnostics').isVisible(), false);
    assert.equal(await page.locator('#playback').isVisible(), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const layout = await page.locator('main').boundingBox();
    assert.equal(layout.width, width);
    assert((await page.locator('#diagnose').boundingBox()).width >= width - 44);
    assert.equal(await page.locator('img').evaluate(img => img.complete && img.naturalWidth === 48), true);
    assert(!/광고 차단|AdBlock|개발용|지원 범위/.test(await page.locator('body').innerText()));
    await page.emulateMedia({ colorScheme: 'dark' });
    assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
    await page.locator('main').screenshot({ path: resolve(output, `popup-${width}.png`) });
    assert.deepEqual(await page.locator('[data-feature]').evaluateAll(nodes=>nodes.map(n=>n.checked)),[true,true,true]);
    await page.locator('[data-feature="providers"]').uncheck();
    await page.waitForFunction(()=>!document.querySelector('[data-feature="providers"]').disabled);
    assert.deepEqual(await page.evaluate(()=>focusFixture.settings.siteFeatures['news.example']),{providers:false,banners:true,popups:true});
    await page.locator('[data-feature="banners"]').uncheck();
    await page.waitForFunction(()=>!document.querySelector('[data-feature="banners"]').disabled);
    await page.locator('[data-feature="popups"]').uncheck();
    await page.waitForFunction(()=>!document.querySelector('[data-feature="popups"]').disabled);
    await page.reload();await page.waitForFunction(()=>!document.querySelector('[data-feature="providers"]').disabled);
    assert.deepEqual(await page.locator('[data-feature]').evaluateAll(nodes=>nodes.map(n=>n.checked)),[false,false,false]);
    await page.evaluate(()=>sessionStorage.setItem('focus-tab','https://other.example/'));
    await page.reload();await page.waitForFunction(()=>!document.querySelector('[data-feature="providers"]').disabled);
    assert.deepEqual(await page.locator('[data-feature]').evaluateAll(nodes=>nodes.map(n=>n.checked)),[true,true,true]);
    await page.evaluate(()=>sessionStorage.setItem('focus-tab','https://news.example/article'));
    await page.reload();await page.waitForFunction(()=>!document.querySelector('[data-feature="providers"]').disabled);
    for(const feature of ['providers','banners','popups']){await page.locator(`[data-feature="${feature}"]`).check();await page.waitForFunction(()=>!document.querySelector('[data-feature="providers"]').disabled);}
    await page.locator('details.tools > summary').click();
    assert.match(await page.locator('details.tools').innerText(),/EasyList/);assert.match(await page.locator('details.tools').innerText(),/전체 엔진/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:resolve(output,`tools-${width}.png`)});
    await page.locator('details.tools > summary').click();
    await page.locator('#global').uncheck();
    await page.waitForFunction(() => !document.querySelector('#global').disabled);
    assert.equal(await page.evaluate(() => focusFixture.settings.globalEnabled), false);
    await page.locator('#site').uncheck();
    await page.waitForFunction(() => !document.querySelector('#site').disabled);
    assert.deepEqual(await page.evaluate(() => focusFixture.settings.disabledSites), ['news.example']);
    await page.locator('#diagnose').click();
    await page.waitForFunction(() => !document.querySelector('#summary').hidden);
    assert.equal(await page.locator('#summary').textContent(), '이 페이지에 적용됐어요.');
    await page.locator('details:not(.tools) > summary').click();
    assert.equal(await page.locator('#diagnostics').isVisible(), true);
    await page.evaluate(() => { focusFixture.result = { error: '권한을 확인해 주세요.', detail: 'https://example.org/' + 'long-diagnostic/'.repeat(90) }; });
    await page.locator('#diagnose').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('권한'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: resolve(output, `diagnostics-${width}.png`) });
    // Reload only this isolated fixture with a fresh YouTube tab model and listeners.
    await page.evaluate(() => sessionStorage.setItem('focus-tab', 'https://m.youtube.com/watch?v=fixture'));
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#playback').hidden);
    assert.equal(await page.evaluate(() => focusFixture.menuRequests), 0);
    await page.screenshot({ path: resolve(output, `youtube-popup-${width}.png`) });
    await page.locator('#playback').click();
    await page.waitForFunction(() => focusFixture.menuRequests === 1);
    assert.match(await page.locator('#status').textContent(), /오른쪽 아래/);
    await page.evaluate(() => { focusFixture.result = { youtube: true, media: { version: '1.2.0', background: 'off' }, playback: [{ paused: false }] }; });
    await page.locator('#diagnose').click();
    await page.waitForFunction(() => document.querySelector('#summary').textContent.includes('Focus 실행 중'));
    await page.evaluate(() => sessionStorage.setItem('focus-tab', 'chrome://extensions'));
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#global').disabled);
    assert.equal(await page.locator('#site').isEnabled(), false);
    assert.equal(await page.locator('#playback').isVisible(), false);
    assert.match(await page.locator('#status').textContent(), /접근/);
    report.widths.push(width); report.popupChecks += 30;
    await page.close();
  }
  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await player.goto(`${base}/tests/safari-media.html`);
  await player.locator('#yas-safari-tools').waitFor();
  assert.equal(await player.locator('#yas-safari-tools').evaluate(el => getComputedStyle(el).position), 'fixed');
  const toolbar = player.locator('#yas-safari-tools');
  assert.equal(await toolbar.locator('button').count(), 3);
  assert.equal(await toolbar.locator('button > svg').count(), 3);
  assert.equal(await toolbar.locator('button').allTextContents().then(texts=>texts.join('')), '');
  const box = await toolbar.boundingBox();
  assert(box.width <= 150 && box.height <= 54);
  await toolbar.screenshot({ path: resolve(output, 'playback-toolbar.png') });
  await player.locator('#open-focus').click();
  assert.equal(await toolbar.count(), 1);
  await toolbar.locator('#background').click();
  assert.equal(await toolbar.locator('#background').getAttribute('aria-pressed'), 'true');
  assert.equal(await toolbar.locator('#background svg').count(), 1);
  await toolbar.locator('#pip').click();
  await player.waitForFunction(()=>JSON.parse(document.documentElement.dataset.yasSafariMediaStatus).mode==='pip');
  await player.locator('#next').click();
  await player.waitForFunction(()=>JSON.parse(document.documentElement.dataset.yasSafariMediaStatus).background==='off');
  assert.equal(await toolbar.count(), 1);
  assert.equal(await player.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  for (const width of [280, 430, 768, 1280]) {
    await player.setViewportSize({width,height:844});
    await player.emulateMedia({colorScheme:width===430?'dark':'light'});
    const rect=await toolbar.boundingBox();
    assert(rect.x>=0 && rect.x+rect.width<=width && rect.width<=150);
    for(const button of await toolbar.locator('button').all()) {
      const target=await button.boundingBox();assert(target.width>=44 && target.height>=44);
    }
    assert.equal(await player.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await player.screenshot({path:resolve(output,`playback-toolbar-${width}.png`)});
  }
  report.toolbarChecks = 12;
  await writeFile(resolve(output, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
