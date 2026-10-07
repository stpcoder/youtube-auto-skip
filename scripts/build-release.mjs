import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { repositoryRoot, readJSON, manifestAssets, zipDirectory, sha256 } from './lib/package-utils.mjs';
import { checkPackage } from './check-package.mjs';

const root = repositoryRoot;
for (const script of ['build-general.mjs', 'build-safari.mjs']) {
  const result = spawnSync(process.execPath, [resolve(root, 'scripts', script)], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw Error(`${script} failed`);
}
const summary = await checkPackage(root);
const manifest = await readJSON(resolve(root, 'manifest.json'));
const stage = resolve(root, 'build/chrome-extension');
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
for (const file of [...await manifestAssets(root, manifest), 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  const target = resolve(stage, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, file), target);
}
const tag = `v${manifest.version}-preview.1`;
const source = `Source and installation guide: https://github.com/stpcoder/youtube-auto-skip/tree/${tag}\n`;
await writeFile(resolve(stage, 'SOURCE.txt'), source);
const safariStage = resolve(root, 'build/safari-extension');
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await copyFile(resolve(root, file), resolve(safariStage, file));
const safariGuide = (await readFile(resolve(root, 'docs/SAFARI.en.md'), 'utf8'))
  .replace('(../safari/README.md)', `(https://github.com/stpcoder/youtube-auto-skip/blob/${tag}/safari/README.md)`)
  .replace('(VALIDATION.md)', `(https://github.com/stpcoder/youtube-auto-skip/blob/${tag}/docs/VALIDATION.md)`);
await writeFile(resolve(safariStage, 'README.md'), safariGuide);
await writeFile(resolve(safariStage, 'SOURCE.txt'), `${source}Development source only. This ZIP is not a signed iPhone app or an IPA.\n`);
await manifestAssets(safariStage);
const chromeName = `youtube-auto-skip-chrome-${manifest.version}.zip`;
const safariName = `youtube-auto-skip-safari-${summary.safariVersion}-dev.zip`;
const checksums = [];
for (const [directory, prefix, name] of [[stage, 'youtube-auto-skip', chromeName], [safariStage, 'youtube-safari-development', safariName]]) {
  const archive = await zipDirectory(directory, prefix);
  await writeFile(resolve(root, 'build', name), archive);
  checksums.push(`${sha256(archive)}  ${name}`);
}
await writeFile(resolve(root, 'build/SHA256SUMS'), `${checksums.join('\n')}\n`);
await writeFile(resolve(root, 'build/release-manifest.json'), JSON.stringify({ tag, chromeVersion: manifest.version, safariVersion: summary.safariVersion, artifacts: [chromeName, safariName], checksums }, null, 2) + '\n');
console.log(JSON.stringify({ ...summary, tag, artifacts: [chromeName, safariName] }, null, 2));
