import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, relative, dirname, sep, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';

export const repositoryRoot = resolve(import.meta.dirname, '../..');
export const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function inside(root, path) {
  const file = resolve(root, path);
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw Error(`Asset outside package: ${path}`);
  return file;
}
export async function walk(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = resolve(root, entry.name);
    if (entry.isDirectory()) result.push(...await walk(file));
    else if (entry.isFile()) result.push(file);
  }
  return result.sort();
}
export async function manifestAssets(root, manifest) {
  manifest ??= await readJSON(resolve(root, 'manifest.json'));
  const files = new Set(['manifest.json']);
  const add = path => { if (path) files.add(path); };
  add(manifest.background?.service_worker);
  for (const path of manifest.background?.scripts || []) add(path);
  add(manifest.action?.default_popup);
  for (const path of Object.values(manifest.icons || {})) add(path);
  const actionIcon = manifest.action?.default_icon;
  if (typeof actionIcon === 'string') add(actionIcon);
  else for (const path of Object.values(actionIcon || {})) add(path);
  for (const entry of manifest.content_scripts || []) for (const path of [...entry.js || [], ...entry.css || []]) add(path);
  for (const entry of manifest.declarative_net_request?.rule_resources || []) add(entry.path);
  for (const entry of manifest.web_accessible_resources || []) for (const path of entry.resources) add(path);
  const pending = [...files], checked = new Set();
  while (pending.length) {
    const path = pending.shift();
    if (checked.has(path)) continue;
    checked.add(path);
    const file = inside(root, path);
    await access(file);
    if (!/\.(?:js|html)$/.test(path)) continue;
    const text = await readFile(file, 'utf8');
    const refs = [];
    for (const match of text.matchAll(/importScripts\(([^)]+)\)/g)) for (const argument of match[1].matchAll(/['"]([^'"]+)['"]/g)) refs.push(argument[1]);
    for (const match of text.matchAll(/(?:chrome\.)?runtime\.getURL\(['"]([^'"]+)['"]\)/g)) refs.push(match[1]);
    if (path.endsWith('.html')) for (const match of text.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      if (!/^(?:https?:|mailto:)/.test(match[1])) refs.push(relative(root, resolve(dirname(file), match[1])).split(sep).join('/'));
    }
    for (const reference of refs) if (!files.has(reference)) { files.add(reference); pending.push(reference); }
  }
  if (manifest.default_locale) {
    for (const file of await walk(resolve(root, '_locales'))) files.add(relative(root, file).split(sep).join('/'));
  }
  return [...files].sort();
}
export async function zipDirectory(root, prefix) {
  const entries = {};
  for (const path of await walk(root)) {
    const relativePath = relative(root, path).split(sep).join('/');
    // Chrome creates a machine-specific compiled DNR cache after loading an
    // unpacked folder. Never include it when repackaging a validated folder.
    if (relativePath.startsWith('_metadata/')) continue;
    const name = `${prefix}/${relativePath}`;
    entries[name] = [new Uint8Array(await readFile(path)), { mtime: new Date(2000, 0, 1), attrs: 0o100644 << 16 }];
  }
  return zipSync(entries, { level: 6 });
}
