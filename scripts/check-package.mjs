import { readFile, access } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { repositoryRoot, readJSON, manifestAssets, walk, sha256 } from './lib/package-utils.mjs';

export async function checkPackage(root = repositoryRoot) {
  const manifest = await readJSON(resolve(root, 'manifest.json'));
  const pkg = await readJSON(resolve(root, 'package.json'));
  if (manifest.manifest_version !== 3 || manifest.version !== pkg.version) throw Error('Chrome/package version mismatch');
  const assets = await manifestAssets(root, manifest);
  for (const path of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'general/site-rules.json', 'filters/cosmetic-policy.json']) await access(resolve(root, path));
  const groups = manifest.content_scripts.filter(entry => entry.js.some(path => path.startsWith('general/')));
  if (groups.some(entry => entry.js.length !== 1 || !entry.js[0].endsWith('-bundle.js'))) throw Error('General content scripts must use self-contained world bundles');
  const popup = await readFile(resolve(root, manifest.action.default_popup), 'utf8');
  const base = await readJSON(resolve(root, `_locales/${manifest.default_locale}/messages.json`));
  const keys = Object.keys(base).sort();
  const localeFiles = (await walk(resolve(root, '_locales'))).filter(path => path.endsWith('messages.json'));
  const popupScript = await readFile(resolve(root, 'general/popup.js'), 'utf8');
  const used = [...popup.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g), ...popupScript.matchAll(/text\('([^']+)'/g)].map(match => match[1]);
  const placeholders = text => JSON.stringify([...text.matchAll(/\$\d/g)].map(match => match[0]).sort());
  for (const path of localeFiles) {
    const messages = await readJSON(path);
    if (JSON.stringify(Object.keys(messages).sort()) !== JSON.stringify(keys)) throw Error(`Incomplete locale: ${path}`);
    for (const key of keys) if (!messages[key].message || placeholders(messages[key].message) !== placeholders(base[key].message)) throw Error(`Invalid translation: ${path}/${key}`);
    for (const key of used) if (!messages[key]) throw Error(`Missing UI message: ${key}`);
    if (messages.extensionName.message.length > 75 || messages.extensionDescription.message.length > 132) throw Error(`Chrome metadata limit exceeded: ${path}`);
  }
  const rules = await readJSON(resolve(root, 'filters/network.json'));
  const cosmetics = await readJSON(resolve(root, 'filters/cosmetic.json'));
  const policy = await readJSON(resolve(root, 'filters/cosmetic-policy.json'));
  const provenance = await readJSON(resolve(root, 'filters/provenance.json'));
  if (rules.length !== provenance.networkRules || cosmetics.length !== provenance.cosmeticRules || policy.length !== provenance.cosmeticPolicyRules) throw Error('Filter counts do not match provenance');
  if (new Set(rules.map(rule => rule.id)).size !== rules.length) throw Error('Duplicate network rule IDs');
  for (const source of provenance.sources) {
    const bytes = await readFile(resolve(root, `filters/sources/${source.name.toLowerCase()}.txt`));
    if (sha256(bytes) !== source.sha256) throw Error(`Filter source hash mismatch: ${source.name}`);
  }
  const safari = await readJSON(resolve(root, 'safari/extension/manifest.json'));
  const safariOwn = ['manifest.json', 'background.js', 'bootstrap.js', 'media-core.js', 'controls.js', 'mobile-skip.js', 'general-bootstrap.js', 'popup.html', 'popup.js', 'popup.css'];
  const safariShared = ['anti-adblock.js', 'prevention.js', 'buffering-recovery.js', 'early.js', 'interruption-notice.js', 'interruption-notice.css'];
  for (const file of safariOwn) await access(resolve(root, 'safari/extension', file));
  for (const file of ['icons/focus-48.png', 'icons/focus-128.png']) await access(resolve(root, 'safari/extension', file));
  for (const file of ['Package.swift', 'host/FocusSetupViewController.swift', 'host/Resources/focus-icon.png', 'integration/SafariWebExtensionHandler.swift']) await access(resolve(root, 'safari', file));
  for (const file of safariShared) await access(resolve(root, file));
  const startup = safari.content_scripts.filter(entry => entry.world === 'MAIN');
  if (safari.permissions.includes('debugger') || startup.length !== 1 || startup[0].run_at !== 'document_start' || startup[0].js.join(',') !== 'youtube-main.js' || startup[0].matches.some(match => !/^https:\/\/(?:www\.|m\.)?youtube\.com\/\*$/.test(match))) throw Error('Safari requires its scoped declarative MAIN startup without Chrome debugger');
  if (safari.declarative_net_request.rule_resources[0].path !== 'network.json') throw Error('Safari general filters are missing');
  const markdownFiles = [resolve(root, 'README.md'), resolve(root, 'CONTRIBUTING.md'), ...await walk(resolve(root, 'docs')), ...await walk(resolve(root, 'safari'))].filter(path => path.endsWith('.md') && !path.includes('/xcode'));
  for (const path of markdownFiles) {
    const source = await readFile(path, 'utf8');
    for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const link = match[1].split('#')[0];
      if (link && !/^(?:[a-z]+:|#)/i.test(link)) await access(resolve(path, '..', link));
    }
  }
  return { chromeVersion: manifest.version, safariVersion: safari.version, locales: localeFiles.map(path => relative(root, path)), chromeAssets: assets.length, networkRules: rules.length, cosmeticRules: cosmetics.length, cosmeticPolicies: policy.length };
}
if (resolve(process.argv[1] || '') === resolve(import.meta.filename)) console.log(JSON.stringify(await checkPackage(), null, 2));
