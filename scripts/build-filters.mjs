import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Filter, FilterConverter } from '@adguard/dnr-converter';

// Maintained filter data only. Never download or execute remote scriptlets.
const root = new URL('../', import.meta.url);
const sources = [
  { name: 'YousList', url: 'https://raw.githubusercontent.com/yous/YousList/master/youslist.txt', license: 'CC-BY-4.0', attribution: 'YousList contributors', homepage: 'https://github.com/yous/YousList' },
  { name: 'EasyList', url: 'https://easylist.to/easylist/easylist.txt', license: 'CC-BY-SA-3.0', attribution: 'EasyList authors', homepage: 'https://github.com/easylist/easylist' },
];
const offline = process.argv.includes('--offline');
const filters = [], cosmetic = [], popupHosts = new Set(['ad.ad4989.co.kr', 'adexpert.ad4989.co.kr']);
let ignoredCosmetic = 0;
await mkdir(new URL('filters/sources/', root), { recursive: true });
for (const [index, source] of sources.entries()) {
  const file = new URL(`filters/sources/${source.name.toLowerCase()}.txt`, root);
  let text;
  if (offline) text = await readFile(file, 'utf8');
  else {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
    text = await response.text();
    if (!text.startsWith('[Adblock') || text.length < 1000) throw new Error(`Invalid ${source.name} list`);
    await writeFile(file, text);
  }
  source.sha256 = createHash('sha256').update(text).digest('hex');
  const network = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('!') || line.startsWith('[')) continue;
    const c = line.match(/^([^#]*)(#@#|##)(.+)$/);
    if (c) {
      const [, domains, kind, selector] = c;
      // Extended CSS/scriptlets cannot be safely treated as native selectors.
      if (selector.includes(':has-text(') || selector.includes(':upward(') || selector.includes(':matches-') || selector.includes(':style(') || selector.startsWith('+js') || selector.includes('{')) { ignoredCosmetic++; continue; }
      cosmetic.push({ domains: domains ? domains.split(',') : [], selector, exception: kind === '#@#' });
      continue;
    }
    if (line.includes('#')) continue;
    network.push(line);
    // Only unconditional ad-server host rules may suppress popup destinations.
    // Conditional/exception/$popup rules are not broadened to all websites.
    const host = line.match(/^\|\|([a-z0-9.-]+)\^$/i)?.[1];
    if (host && host.includes('.')) popupHosts.add(host.toLowerCase());
  }
  filters.push(new Filter(index + 1, network.join('\n')));
}
const [{ ruleset, errors, limitations }] = await new FilterConverter().convert(filters, {
  combine: true, maxNumberOfRules: 29900, maxNumberOfRegexpRules: 900, maxNumberOfUnsafeRules: 0,
});
const youtube = ['youtube.com', 'youtube-nocookie.com'];
const rules = ruleset.getDeclarativeRules().filter(r => ['block', 'allow', 'allowAllRequests'].includes(r.action.type));
for (const r of rules) {
  // Leave YouTube requests to the existing purpose-built prevention/skip logic.
  r.condition.excludedInitiatorDomains = [...new Set([...(r.condition.excludedInitiatorDomains || []), ...youtube])];
  // General network rules do not replace or break direct user navigation.
  if (r.action.type === 'block') {
    r.condition.excludedResourceTypes = [...new Set([...(r.condition.excludedResourceTypes || []), 'main_frame'])];
    if (r.condition.resourceTypes) {
      r.condition.resourceTypes = r.condition.resourceTypes.filter(t => t !== 'main_frame');
      delete r.condition.excludedResourceTypes;
    }
  }
}
const usable = rules.filter(r => !r.condition.resourceTypes || r.condition.resourceTypes.length);
// Keep the supplied ad iframe covered even if the general conversion is capped.
usable.push({ id: 900001, priority: 100, action: { type: 'block' }, condition: {
  requestDomains: ['ad.ad4989.co.kr','adexpert.ad4989.co.kr'],
  excludedInitiatorDomains: youtube, resourceTypes: ['sub_frame','script','image','xmlhttprequest'],
} });
const data = { popupHosts: [...popupHosts].sort(), cosmetic };
await writeFile(new URL('filters/network.json', root), JSON.stringify(usable));
await writeFile(new URL('filters/cosmetic.json', root), JSON.stringify(cosmetic));
await writeFile(new URL('general/rule-data.js', root), `// Generated from attributed filter snapshots; no remote executable code.\n(() => { globalThis[Symbol.for("yas.general.data")] = ${JSON.stringify({ popupHosts: data.popupHosts })}; })();\n`);
const provenance = { builtAt: new Date().toISOString(), sources, networkRules: usable.length,
  cosmeticRules: cosmetic.length, popupHosts: popupHosts.size, conversionErrors: errors.length,
  limitations: limitations.map(e => String(e.message || e)), ignoredCosmetic,
  note: 'Not a full uBlock/AdGuard engine. Unsupported scriptlets, redirects, modifier rules and extended CSS are omitted. No tracking or cookie-consent filters are included.' };
await writeFile(new URL('filters/provenance.json', root), JSON.stringify(provenance, null, 2) + '\n');
console.log(JSON.stringify(provenance, null, 2));
