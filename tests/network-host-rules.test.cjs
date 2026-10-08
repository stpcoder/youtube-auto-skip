const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('host grouping accepts only unconditional blocks, not exceptions or modifiers', async () => {
  const {unconditionalHost} = await import('../scripts/lib/network-host-rules.mjs');
  assert.equal(unconditionalHost('||ADS.Example.org^'), 'ads.example.org');
  for (const rule of ['@@||ads.example.org^','||ads.example.org^$popup','||ads.example.org^$domain=news.org',
    '||ads.example.org^$third-party','||ads.example.org/path','||ads.example.org^$important',
    '||ads..example.org^','||-ads.example.org^','||ads.example.org.^','||localhost^']) {
    assert.equal(unconditionalHost(rule), null, rule);
  }
});

test('plain host badfilter overrides are recognized without broadening conditional overrides', async () => {
  const {disabledUnconditionalHost} = await import('../scripts/lib/network-host-rules.mjs');
  assert.equal(disabledUnconditionalHost('||ads.example.org^$badfilter'), 'ads.example.org');
  for (const rule of ['||ads.example.org^$third-party,badfilter','||ads.example.org/path$badfilter','@@||ads.example.org^$badfilter']) assert.equal(disabledUnconditionalHost(rule), null);
});

test('host rules preserve all domains, stable grouping and disjoint IDs', async () => {
  const {groupedHostRules} = await import('../scripts/lib/network-host-rules.mjs');
  const hosts = Array.from({length:1201}, (_, i) => `ads${i}.example.org`);
  const rules = groupedHostRules([...hosts, hosts[0]], new Set([900100]));
  assert.deepEqual(rules.map(r => r.id), [900101,900102,900103]);
  assert.deepEqual(rules.map(r => r.condition.requestDomains.length), [500,500,201]);
  assert.deepEqual(new Set(rules.flatMap(r => r.condition.requestDomains)), new Set(hosts));
  for (const rule of rules) {
    assert.equal(rule.priority, 1); assert.equal(rule.action.type, 'block');
    assert.deepEqual(rule.condition.excludedResourceTypes, ['main_frame']);
    assert.equal(rule.condition.initiatorDomains, undefined);
  }
  assert.throws(() => groupedHostRules(hosts, new Set(), 501), /batch/);
});

test('every unconditional host from both maintained snapshots survives the package budget', async () => {
  const {unconditionalHost,disabledUnconditionalHost} = await import('../scripts/lib/network-host-rules.mjs');
  const lines = ['easylist','youslist','focus'].flatMap(name => read(`filters/sources/${name}.txt`).split(/\r?\n/));
  const hosts = new Set(lines.map(unconditionalHost).filter(Boolean));
  for (const host of lines.map(disabledUnconditionalHost).filter(Boolean)) hosts.delete(host);
  const rules = JSON.parse(read('filters/network.json'));
  const grouped = rules.filter(r => r.id >= 900100 && r.id < 1000000 && r.condition.requestDomains);
  const covered = new Set(grouped.flatMap(r => r.condition.requestDomains));
  assert.deepEqual(covered, hosts);
  for (const host of ['tsyndicate.com','optvz.com','coverdistilltile.com']) assert.ok(covered.has(host));
  assert.ok(!covered.has('cdnhop.com'), 'normal site assets are not classified as advertising');
  const provenance = JSON.parse(read('filters/provenance.json'));
  assert.equal(provenance.unconditionalHosts, hosts.size);
  assert.equal(provenance.unconditionalHostRules, grouped.length);
  assert.ok(!provenance.limitations.some(l => /too many declarative rules/i.test(l)));
});
