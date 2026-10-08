import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Filter, FilterConverter } from '@adguard/dnr-converter';
import { parseCosmeticException } from './cosmetic-filter-parser.mjs';
import { unconditionalHost, disabledUnconditionalHost, groupedHostRules } from './lib/network-host-rules.mjs';

// Maintained filter data only. Never download or execute remote scriptlets.
const root = new URL('../', import.meta.url);
const sources = [
  { name: 'YousList', url: 'https://raw.githubusercontent.com/yous/YousList/master/youslist.txt', license: 'CC-BY-4.0', attribution: 'YousList contributors', homepage: 'https://github.com/yous/YousList' },
  { name: 'EasyList', url: 'https://easylist.to/easylist/easylist.txt', license: 'CC-BY-SA-3.0', attribution: 'EasyList authors', homepage: 'https://github.com/easylist/easylist' },
  { name: 'Focus', local: true, license: 'GPL-3.0-only', attribution: 'Focus contributors', note: 'Locally authored, verified provider/creative signatures; not an upstream filter list.' },
];
const offline = process.argv.includes('--offline');
const filters = [], cosmetic = [], cosmeticPolicies = [], unsupportedCosmeticPolicies = [], popupHosts = new Set(['ad.ad4989.co.kr', 'adexpert.ad4989.co.kr']);
const networkHosts = new Set();
const disabledHostBlocks = new Set();
let ignoredCosmetic = 0;
await mkdir(new URL('filters/sources/', root), { recursive: true });
for (const [index, source] of sources.entries()) {
  const file = new URL(`filters/sources/${source.name.toLowerCase()}.txt`, root);
  let text;
  if (offline || source.local) text = await readFile(file, 'utf8');
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
    const hidePolicy = parseCosmeticException(line);
    if (hidePolicy) {
      if (hidePolicy.unsupported) unsupportedCosmeticPolicies.push({ source: source.name, ...hidePolicy });
      else cosmeticPolicies.push(hidePolicy);
      continue; // Cosmetic policy is not a network allow rule.
    }
    const c = line.match(/^([^#]*)(#@#|##)(.+)$/);
    if (c) {
      const [, domains, kind, selector] = c;
      // Extended CSS/scriptlets cannot be safely treated as native selectors.
      if (selector.includes(':has-text(') || selector.includes(':upward(') || selector.includes(':matches-') || selector.includes(':style(') || selector.startsWith('+js') || selector.includes('{')) { ignoredCosmetic++; continue; }
      cosmetic.push({ domains: domains ? domains.split(',') : [], selector, exception: kind === '#@#', ...(source.local ? { verifiedProvider: true } : {}) });
      continue;
    }
    if (line.includes('#')) continue;
    // Only unconditional ad-server host rules may suppress popup destinations.
    // Conditional/exception/$popup rules are not broadened to all websites.
    const host = unconditionalHost(line);
    const disabledHost = disabledUnconditionalHost(line);
    if (disabledHost) disabledHostBlocks.add(disabledHost);
    if (host) { networkHosts.add(host); popupHosts.add(host); }
    else network.push(line);
  }
  filters.push(new Filter(index + 1, network.join('\n')));
}
// A $badfilter in either source disables the corresponding plain host block.
for (const host of disabledHostBlocks) { networkHosts.delete(host); popupHosts.delete(host); }
const [{ ruleset, errors, limitations }] = await new FilterConverter().convert(filters, {
  combine: true, maxNumberOfRules: 29900 - Math.ceil(networkHosts.size / 500) - 2,
  maxNumberOfRegexpRules: 900, maxNumberOfUnsafeRules: 0,
});
// A bounded package must never silently discard host coverage again.
if (limitations.some(e => /too many declarative rules/i.test(String(e.message || e)))) {
  throw Error('Network rule budget exceeded; refusing to publish a truncated filter package');
}
const youtube = ['youtube.com', 'youtube-nocookie.com'];
const siteRules = JSON.parse(await readFile(new URL('general/site-rules.json', root), 'utf8'));
const cosmeticOnlyDomains = siteRules.filter(r => r.networkExempt).flatMap(r => r.domains);
const rules = ruleset.getDeclarativeRules().filter(r => ['block', 'allow', 'allowAllRequests'].includes(r.action.type));
rules.push(...groupedHostRules(networkHosts, new Set([...rules.map(r => r.id), 900001, 900002])));
for (const r of rules) {
  // Leave YouTube requests to the existing purpose-built prevention/skip logic.
  r.condition.excludedInitiatorDomains = [...new Set([...(r.condition.excludedInitiatorDomains || []), ...youtube, ...cosmeticOnlyDomains])];
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
  excludedInitiatorDomains: [...youtube, ...cosmeticOnlyDomains], resourceTypes: ['sub_frame','script','image','xmlhttprequest'],
} });
// This frame-level exception also permits nested third-party frame resources.
// The site stays reachable; its known ad slots are handled cosmetically only.
if (cosmeticOnlyDomains.length) usable.push({ id: 900002, priority: 100000,
  action: { type: 'allowAllRequests' }, condition: {
    requestDomains: cosmeticOnlyDomains, resourceTypes: ['main_frame', 'sub_frame'],
    excludedInitiatorDomains: youtube,
  }
});
const data = { popupHosts: [...popupHosts].sort(), cosmetic };
await writeFile(new URL('filters/network.json', root), JSON.stringify(usable));
await writeFile(new URL('filters/cosmetic.json', root), JSON.stringify(cosmetic));
await writeFile(new URL('filters/cosmetic-policy.json', root), JSON.stringify(cosmeticPolicies));
await writeFile(new URL('general/rule-data.js', root), `// Generated from attributed filter snapshots; no remote executable code.\n(() => { globalThis.__YAS_GENERAL_DATA_V3__ = ${JSON.stringify({ popupHosts: data.popupHosts })}; })();\n`);
const provenance = { builtAt: new Date().toISOString(), sources, networkRules: usable.length,
  unconditionalHosts: networkHosts.size, unconditionalHostRules: Math.ceil(networkHosts.size / 500),
  cosmeticRules: cosmetic.length, popupHosts: popupHosts.size, conversionErrors: errors.length,
  cosmeticPolicyRules: cosmeticPolicies.length, unsupportedCosmeticPolicies,
  limitations: limitations.map(e => String(e.message || e)), ignoredCosmetic,
  note: 'Not a full uBlock/AdGuard engine. Cosmetic generichide/elemhide/specifichide exceptions are compiled separately. Unsupported scriptlets, redirects, other modifier rules and extended CSS are omitted. No tracking or cookie-consent filters are included.' };
await writeFile(new URL('filters/provenance.json', root), JSON.stringify(provenance, null, 2) + '\n');
console.log(JSON.stringify(provenance, null, 2));
await import('./build-general.mjs');
