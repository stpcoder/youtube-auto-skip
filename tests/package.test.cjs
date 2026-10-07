const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm, mkdir, writeFile, utimes } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

async function temporary(t) {
  const root = await mkdtemp(join(tmpdir(), 'yas-package-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
test('package dependency traversal cannot copy a parent file', async t => {
  const root = await temporary(t);
  const { manifestAssets } = await import('../scripts/lib/package-utils.mjs');
  await writeFile(join(root, 'manifest.json'), '{}');
  await assert.rejects(manifestAssets(root, { background: { service_worker: '../private.js' } }), /outside package/);
});
test('missing worker imports fail before ZIP publication', async t => {
  const root = await temporary(t);
  const { manifestAssets } = await import('../scripts/lib/package-utils.mjs');
  await writeFile(join(root, 'manifest.json'), '{}');
  await writeFile(join(root, 'worker.js'), "importScripts('missing-runtime.js');");
  await assert.rejects(manifestAssets(root, { background: { service_worker: 'worker.js' } }), /ENOENT/);
});
test('runtime dependency graph includes popup, worker data, icons and locale catalogs', async t => {
  const root = await temporary(t);
  const { manifestAssets } = await import('../scripts/lib/package-utils.mjs');
  const files = {
    'manifest.json': '{}', 'worker.js': "importScripts('bundle.js');",
    'bundle.js': "chrome.runtime.getURL('data.json');", 'data.json': '{}',
    'ui/popup.html': '<link href="popup.css"><script src="popup.js"></script>',
    'ui/popup.js': '', 'ui/popup.css': '', 'icon.png': '', '_locales/en/messages.json': '{}'
  };
  for (const [name, bytes] of Object.entries(files)) {
    await mkdir(join(root, name, '..'), { recursive: true });
    await writeFile(join(root, name), bytes);
  }
  const assets = await manifestAssets(root, { default_locale: 'en', background: { service_worker: 'worker.js' }, action: { default_popup: 'ui/popup.html', default_icon: 'icon.png' } });
  assert.deepEqual(assets, Object.keys(files).sort());
});
test('ZIPs preserve UTF-8 paths/content and remain identical after source mtime changes', async t => {
  const root = await temporary(t);
  const { zipDirectory } = await import('../scripts/lib/package-utils.mjs');
  const { unzipSync, strFromU8 } = await import('fflate');
  await mkdir(join(root, '_locales/ko'), { recursive: true });
  const file = join(root, '_locales/ko/messages.json');
  await writeFile(file, '{"message":"광고 차단 · anúncios"}');
  const first = await zipDirectory(root, 'extension');
  await utimes(file, new Date(2024, 1, 2), new Date(2026, 8, 10));
  const second = await zipDirectory(root, 'extension');
  assert.deepEqual(first, second);
  const extracted = unzipSync(first);
  assert.deepEqual(Object.keys(extracted), ['extension/_locales/ko/messages.json']);
  assert.equal(strFromU8(extracted['extension/_locales/ko/messages.json']), '{"message":"광고 차단 · anúncios"}');
});
test('loading an unpacked extension does not add Chrome generated caches to the next ZIP', async t => {
  const root = await temporary(t);
  const { zipDirectory, sha256 } = await import('../scripts/lib/package-utils.mjs');
  await writeFile(join(root, 'manifest.json'), '{}');
  const first = await zipDirectory(root, 'extension');
  await mkdir(join(root, '_metadata/generated_indexed_rulesets'), { recursive: true });
  await writeFile(join(root, '_metadata/generated_indexed_rulesets/_ruleset1'), 'browser-specific compiled data');
  assert.equal(sha256(await zipDirectory(root, 'extension')), sha256(first));
});
