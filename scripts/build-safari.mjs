import { mkdir, copyFile, readFile, writeFile, access, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url), output = new URL('build/safari-extension/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const own = ['manifest.json','background.js','bootstrap.js','media-core.js','controls.js','mobile-skip.js'];
const shared = ['anti-adblock.js','prevention.js','buffering-recovery.js','early.js','interruption-notice.js','interruption-notice.css'];
for (const file of own) await copyFile(new URL(`safari/extension/${file}`, root), new URL(file, output));
for (const file of shared) await copyFile(new URL(file, root), new URL(file, output));
const m = JSON.parse(await readFile(new URL('manifest.json', output), 'utf8'));
if (m.permissions?.includes('debugger') || m.content_scripts.some(s => s.matches.some(x => x.includes('*://*')))) throw Error('Safari must remain YouTube-only, without Chrome debugger');
console.log(output.pathname);
if (process.argv.includes('--xcode')) {
  const project = new URL('safari/xcode-v1/YouTubeSafari/YouTubeSafari.xcodeproj/', root);
  const pbx = new URL('project.pbxproj', project);
  let exists = false;
  try { await access(pbx); exists = true; } catch {}
  if (!exists) {
    const result = spawnSync('xcrun', ['safari-web-extension-packager', fileURLToPath(output),
      '--project-location', fileURLToPath(new URL('safari/xcode-v1/', root)),
      '--app-name', 'YouTubeSafari', '--bundle-identifier', 'com.taehoje.YouTubeSafari',
      '--swift', '--ios-only', '--no-open', '--no-prompt'], { stdio: 'inherit' });
    if (result.status !== 0) throw Error('Safari Xcode project generation failed');
  }
  // Mechanical changes to our generated project only; no signing credentials.
  const text = await readFile(pbx, 'utf8');
  await writeFile(pbx, text.replace(/IPHONEOS_DEPLOYMENT_TARGET = [\d.]+;/g, 'IPHONEOS_DEPLOYMENT_TARGET = 26.0;'));
  const host = new URL('safari/xcode-v1/YouTubeSafari/YouTubeSafari/Resources/', root);
  await copyFile(new URL('safari/host/Main.html',root),new URL('Base.lproj/Main.html',host));
  await copyFile(new URL('safari/host/Style.css',root),new URL('Style.css',host));
  const controller = new URL('safari/xcode-v1/YouTubeSafari/YouTubeSafari/ViewController.swift',root);
  await writeFile(controller, (await readFile(controller,'utf8')).replace('self.webView.scrollView.isScrollEnabled = false','self.webView.scrollView.isScrollEnabled = true'));
  console.log(fileURLToPath(project));
}
