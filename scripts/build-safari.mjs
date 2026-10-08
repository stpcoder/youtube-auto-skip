import { mkdir, copyFile, cp, readFile, writeFile, access, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { safariNetworkRules } from './lib/safari-rules.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url), output = new URL('build/safari-extension/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const own = ['manifest.json','background.js','bootstrap.js','media-core.js','controls.js','mobile-skip.js','general-bootstrap.js','popup.html','popup.js','popup.css'];
const shared = ['anti-adblock.js','prevention.js','buffering-recovery.js','early.js','interruption-notice.js','interruption-notice.css'];
for (const file of own) await copyFile(new URL(`safari/extension/${file}`, root), new URL(file, output));
await copyFile(new URL('filters/popup.json', root), new URL('popup-rules.json', output));
await copyFile(new URL('filters/popup-hosts.json', root), new URL('popup-hosts.json', output));
await copyFile(new URL('general/policy.js', root), new URL('popup-policy.js', output));
await cp(new URL('safari/extension/icons/', root), new URL('icons/', output), { recursive: true });
for (const file of shared) await copyFile(new URL(file, root), new URL(file, output));
const m = JSON.parse(await readFile(new URL('manifest.json', output), 'utf8'));
// Safari 18+ supports declarative MAIN-world document_start. Install request
// hooks before the optional playback UI, without a background-message roundtrip.
const youtubeFiles = ['anti-adblock.js','prevention.js','buffering-recovery.js','early.js','media-core.js','controls.js'];
const startup = `(() => {const key=Symbol.for('youtube-auto-skip.safari-startup');if(!window[key]){const stringify=JSON.stringify;const stats={version:${JSON.stringify(m.version)},initializedAtMs:Math.round(performance.now()),readyState:document.readyState,initialPlayerResponsePresent:!!window.ytInitialPlayerResponse};window[key]=Object.freeze(stats);const publish=()=>{if(!document.documentElement)return false;document.documentElement.dataset.yasSafariStartupStatus=stringify(stats);return true;};if(!publish()){const observer=new MutationObserver(()=>{if(publish())observer.disconnect();});observer.observe(document,{childList:true});}}window[Symbol.for('youtube-auto-skip.recovery-options')]=Object.freeze({mobile:true,immediate:true});})();\n`;
await writeFile(new URL('youtube-main.js', output), startup + (await Promise.all(youtubeFiles.map(file => readFile(new URL(file, output), 'utf8')))).join('\n;\n'));
if (m.permissions?.includes('debugger') || m.content_scripts.some(s => s.world && !(s.world === 'MAIN' && s.run_at === 'document_start' && s.js.length === 1 && s.js[0] === 'youtube-main.js'))) throw Error('Safari MAIN startup must remain scoped to the fixed YouTube entry');
const read = file => readFile(new URL(file, root), 'utf8');
const policy = (await read('general/policy.js')).replace('globalThis.__YAS_GENERAL_POLICY_V3__ = ', 'return ');
const siteRules = await read('general/site-rules.json'), cosmeticPolicies = await read('filters/cosmetic-policy.json');
let cosmetic = await read('general/cosmetic.js');
cosmetic = cosmetic.replace('  const policy = globalThis.__YAS_GENERAL_POLICY_V3__;\n', '').replace('  const cosmeticPolicies = globalThis.__YAS_COSMETIC_POLICY_V3__ || [];\n', '').replace('(globalThis.__YAS_GENERAL_SITE_RULES_V3__ || [])', 'siteRules').replace("'filters/cosmetic.json'", "'cosmetic.json'");
cosmetic = cosmetic.replace('  chrome.storage.onChanged.addListener', "  window.addEventListener('yas-settings-refresh', schedule);\n  chrome.runtime.onMessage.addListener(message => { if (message?.type === 'YAS_SETTINGS_CHANGED') schedule(); });\n  chrome.storage.onChanged.addListener");
await writeFile(new URL('general-content.js', output), `// Generated from the shared Chrome cosmetic engine.\n(() => {const chrome = browser; const policy = ${policy}\nconst siteRules = ${siteRules};const cosmeticPolicies = ${cosmeticPolicies};\n${cosmetic}\n})();\n`);
await copyFile(new URL('general/main-bundle.js', root), new URL('general-main.js', output));
await copyFile(new URL('filters/cosmetic.json', root), new URL('cosmetic.json', output));
const network = safariNetworkRules(JSON.parse(await read('filters/network.json')));
await writeFile(new URL('network.json', output), JSON.stringify(network));
console.log(`Safari: ${network.length} network rules, shared cosmetic filters and popup guard.`);
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
  let text = (await readFile(pbx, 'utf8')).replace(/IPHONEOS_DEPLOYMENT_TARGET = [\d.]+;/g, 'IPHONEOS_DEPLOYMENT_TARGET = 26.0;').replace(/MARKETING_VERSION = [\d.]+;/g, `MARKETING_VERSION = ${m.version};`).replace(/INFOPLIST_KEY_CFBundleDisplayName = [^;]+;/g, 'INFOPLIST_KEY_CFBundleDisplayName = Focus;');
  const resourcePhase = text.match(/([A-F0-9]{24}) \/\* Resources \*\/ = \{\s*isa = PBXResourcesBuildPhase;\s*files = \(\s*[^)]*\/\* manifest\.json in Resources \*\//)?.[1];
  if (!resourcePhase) throw Error('Cannot locate generated extension resources');
  for (const file of await readdir(output)) {
    if (text.includes(`build/safari-extension/${file}\";`)) continue;
    const id = kind => createHash('sha256').update(`yas-safari-${kind}-${file}`).digest('hex').slice(0,24).toUpperCase();
    const ref = id('ref'), build = id('build');
    text = text.replace('/* End PBXFileReference section */', `\t\t${ref} /* ${file} */ = {isa = PBXFileReference; lastKnownFileType = ${file === 'icons' ? 'folder' : 'file'}; path = \"../../../build/safari-extension/${file}\"; sourceTree = SOURCE_ROOT; };\n/* End PBXFileReference section */`);
    text = text.replace('/* End PBXBuildFile section */', `\t\t${build} /* ${file} in Resources */ = {isa = PBXBuildFile; fileRef = ${ref}; };\n/* End PBXBuildFile section */`);
    text = text.replace(new RegExp(`(${resourcePhase} /\\* Resources \\*/ = \\{\\s*isa = PBXResourcesBuildPhase;\\s*files = \\()`), `$1\n\t\t\t\t${build} /* ${file} in Resources */,`);
  }
  const hostResources = text.match(/([A-F0-9]{24}) \/\* Resources \*\/ = \{\s*isa = PBXResourcesBuildPhase;\s*files = \([^)]*\/\* Main\.storyboard in Resources \*\//)?.[1];
  const hostSources = text.match(/([A-F0-9]{24}) \/\* Sources \*\/ = \{\s*isa = PBXSourcesBuildPhase;\s*files = \([^)]*\/\* ViewController\.swift in Sources \*\//)?.[1];
  if (!hostResources || !hostSources) throw Error('Cannot locate generated host phases');
  // Old converter HTML is no longer packaged: onboarding is a native, reusable controller.
  text = text.replace(/^.*\/\* (?:Main\.html|Style\.css|Icon\.png) in Resources \*\/.*\n/gm, '');
  for (const [file, type, phase, phaseName] of [
    ['safari/host/FocusSetupViewController.swift', 'sourcecode.swift', hostSources, 'Sources'],
    ['safari/host/Resources/focus-icon.png', 'image.png', hostResources, 'Resources'],
  ]) {
    const name = file.split('/').at(-1), ref = createHash('sha256').update(`focus-ref-${file}`).digest('hex').slice(0,24).toUpperCase(), build = createHash('sha256').update(`focus-build-${file}`).digest('hex').slice(0,24).toUpperCase();
    if (text.includes(`${ref} /* ${name} */`)) continue;
    text = text.replace('/* End PBXFileReference section */', `\t\t${ref} /* ${name} */ = {isa = PBXFileReference; lastKnownFileType = ${type}; path = "../../../${file}"; sourceTree = SOURCE_ROOT; };\n/* End PBXFileReference section */`);
    text = text.replace('/* End PBXBuildFile section */', `\t\t${build} /* ${name} in ${phaseName} */ = {isa = PBXBuildFile; fileRef = ${ref}; };\n/* End PBXBuildFile section */`);
    text = text.replace(new RegExp(`(${phase} /\\* ${phaseName} \\*/ = \\{\\s*isa = PBX${phaseName === 'Sources' ? 'Sources' : 'Resources'}BuildPhase;\\s*files = \\()`), `$1\n\t\t\t\t${build} /* ${name} in ${phaseName} */,`);
  }
  await writeFile(pbx, text);
  const iconSet = new URL('safari/xcode-v1/YouTubeSafari/YouTubeSafari/Assets.xcassets/AppIcon.appiconset/', root);
  await copyFile(new URL('safari/host/Resources/focus-icon.png', root), new URL('focus.png', iconSet));
  await writeFile(new URL('Contents.json', iconSet), JSON.stringify({ images: [{ idiom: 'universal', platform: 'ios', size: '1024x1024', filename: 'focus.png' }], info: { author: 'xcode', version: 1 } }, null, 2));
  const controller = new URL('safari/xcode-v1/YouTubeSafari/YouTubeSafari/ViewController.swift',root);
  await copyFile(new URL('safari/host/ViewController.swift', root), controller);
  console.log(fileURLToPath(project));
}
if (process.argv.includes('--integration')) {
  const kit = new URL('build/focus-integration/', root);
  await rm(kit, { recursive: true, force: true });
  await mkdir(new URL('FocusSetup/', kit), { recursive: true });
  await cp(output, new URL('Extension/', kit), { recursive: true });
  await writeFile(new URL('FocusSetup/Package.swift', kit), (await readFile(new URL('safari/Package.swift', root), 'utf8')).replace('exclude: ["ViewController.swift"], ', ''));
  await cp(new URL('safari/host/', root), new URL('FocusSetup/host/', kit), { recursive: true, filter: source => !String(source).endsWith('ViewController.swift') || String(source).endsWith('FocusSetupViewController.swift') });
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await copyFile(new URL(file, root), new URL(file, kit));
  await copyFile(new URL('safari/integration/README.md', root), new URL('README.md', kit));
  await copyFile(new URL('safari/integration/SafariWebExtensionHandler.swift', root), new URL('SafariWebExtensionHandler.swift', kit));
  console.log(`Focus integration kit: ${fileURLToPath(kit)}`);
}
