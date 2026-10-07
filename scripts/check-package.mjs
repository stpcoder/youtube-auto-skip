import { readFile, access, readdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';

export async function checkPackage(root = resolve(import.meta.dirname, '..')) {
  const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
  const manifest = await json('manifest.json');
  const pkg = await json('package.json');
  if (manifest.manifest_version !== 3 || manifest.version !== pkg.version) throw Error('Manifest/package version mismatch');
  const paths = new Set([manifest.background.service_worker, manifest.action.default_popup]);
  const scriptWorlds = new Map();
  for (const entry of manifest.content_scripts) {
    for (const file of entry.js || []) {
      const world = entry.world || 'ISOLATED';
      if (scriptWorlds.has(file) && scriptWorlds.get(file) !== world) throw Error(`Content-script file reused across execution worlds: ${file}`);
      scriptWorlds.set(file, world);
    }
  }
  const mainPolicy = await readFile(resolve(root, 'general/policy.js'), 'utf8');
  const isolatedPolicy = await readFile(resolve(root, 'general/policy-isolated.js'), 'utf8');
  if (mainPolicy !== isolatedPolicy) throw Error('MAIN and isolated policy assets must stay in sync');
  for (const script of manifest.content_scripts) for (const path of [...(script.js || []), ...(script.css || [])]) paths.add(path);
  for (const entry of manifest.declarative_net_request.rule_resources) paths.add(entry.path);
  for (const entry of manifest.web_accessible_resources) for (const path of entry.resources) paths.add(path);
  for (const path of ['general/popup.js', 'general/popup.css', 'filters/provenance.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) paths.add(path);
  for (const path of paths) await access(resolve(root, path));
  for (const file of [manifest.background.service_worker, 'general/background.js']) {
    const source = await readFile(resolve(root, file), 'utf8');
    for (const match of source.matchAll(/importScripts\(([^)]+)\)/g)) {
      for (const argument of match[1].matchAll(/['"]([^'"]+)['"]/g)) await access(resolve(root, argument[1]));
    }
  }
  const html = await readFile(resolve(root, manifest.action.default_popup), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) {
    if (!/^https?:/.test(match[1])) await access(resolve(root, dirname(manifest.action.default_popup), match[1]));
  }
  const locales = await readdir(resolve(root, '_locales'));
  const base = await json(`_locales/${manifest.default_locale}/messages.json`);
  const keys = Object.keys(base).sort();
  for (const locale of locales) {
    const messages = await json(`_locales/${locale}/messages.json`);
    if (JSON.stringify(Object.keys(messages).sort()) !== JSON.stringify(keys)) throw Error(`Incomplete locale: ${locale}`);
    for (const key of keys) {
      if (!messages[key].message) throw Error(`Empty translation: ${locale}/${key}`);
      const placeholders = s => JSON.stringify([...s.matchAll(/\$\d/g)].map(m => m[0]).sort());
      if (placeholders(base[key].message) !== placeholders(messages[key].message)) throw Error(`Placeholder mismatch: ${locale}/${key}`);
    }
    if (messages.extensionName.message.length > 75 || messages.extensionDescription.message.length > 132) throw Error(`Chrome metadata too long: ${locale}`);
    for (const match of html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)) if (!messages[match[1]]) throw Error(`Unknown UI message: ${match[1]}`);
  }
  const rules = await json('filters/network.json');
  const cosmetics = await json('filters/cosmetic.json');
  const provenance = await json('filters/provenance.json');
  if (rules.length !== provenance.networkRules || cosmetics.length !== provenance.cosmeticRules) throw Error('Filter counts do not match provenance');
  if (new Set(rules.map(r => r.id)).size !== rules.length) throw Error('Duplicate DNR rule IDs');
  for (const source of provenance.sources) {
    const bytes = await readFile(resolve(root, `filters/sources/${source.name.toLowerCase()}.txt`));
    if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw Error(`Source hash mismatch: ${source.name}`);
  }
  return { version: manifest.version, locales, networkRules: rules.length, cosmeticRules: cosmetics.length, manifestFiles: paths.size };
}
if (process.argv[1] && relative(resolve(import.meta.dirname, '..'), resolve(process.argv[1])) === 'scripts/check-package.mjs') {
  console.log(JSON.stringify(await checkPackage(), null, 2));
}
