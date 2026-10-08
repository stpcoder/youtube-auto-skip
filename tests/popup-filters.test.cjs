const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const policy = () => { const c = vm.createContext({ URL }); vm.runInContext(read('general/policy.js'), c); return c.__YAS_GENERAL_POLICY_V3__; };
test('popup compiler keeps URL paths, source domains, exceptions and case scope', async () => {
  const { parsePopupRule: parse } = await import('../scripts/popup-filter-parser.mjs');
  const rules = ['/popunder.$popup', '||promo.example/go^$popup,domain=news.example|~safe.news.example', '@@||promo.example/go/login^$popup'].map(parse);
  const match = policy().popupMatcher(rules, new Set());
  assert.equal(match('https://rotate.example/popunder.php?zone=1', 'https://news.example/'), true);
  assert.equal(match('https://promo.example/go?zone=1', 'https://news.example/'), true);
  assert.equal(match('https://promo.example/go?zone=1', 'https://safe.news.example/'), false);
  assert.equal(match('https://promo.example/go?zone=1', 'https://unrelated.example/'), false);
  assert.equal(match('https://promo.example/go/login?next=x', 'https://news.example/'), false);
  assert.equal(match('https://promo.example/page', 'https://news.example/'), false);
  assert.equal(match('https://promo.example.evil.org/go', 'https://news.example/'), false);
  assert.equal(match('javascript:alert(1)', 'https://news.example/'), false);
  assert.equal(match('https://rotate.example/popunder.php', 'about:blank'), false);
});
test('popup modifiers we do not support are retained as limitations, not broadened', async () => {
  const { parsePopupRule: parse } = await import('../scripts/popup-filter-parser.mjs');
  for (const line of ['||x.example^$popup,third-party', '||x.example^$popup,important', '/complex.+/$popup']) assert.ok(parse(line).unsupported);
  for (const line of ['||x.example^$script', '||x.example^$~popup', 'x.example##.banner']) assert.equal(parse(line), null);
  const match = policy().popupMatcher([parse('/AdClick?$popup,match-case')]);
  assert.equal(match('https://x.example/AdClick?zone=1', 'https://page.example'), true);
  assert.equal(match('https://x.example/adclick?zone=1', 'https://page.example'), false);
});
test('real EasyList popup-only patterns are present and stop rotating host paths', () => {
  const rules = JSON.parse(read('filters/popup.json'));
  assert(rules.length > 100);
  const match = policy().popupMatcher(rules);
  assert.equal(match('https://rotating.example/popunder.php?zone=1', 'https://content.example/'), true);
  assert.equal(match('https://rotating.example/ad/window.php?zone=1', 'https://content.example/'), true);
  assert.equal(match('https://accounts.example/login', 'https://content.example/'), false);
  assert(JSON.parse(read('filters/popup-limitations.json')).unsupported.length > 0);
});
test('verified second-click provider path is blocked across publishers, not all navigation', () => {
  const match = policy().popupMatcher(JSON.parse(read('filters/popup.json')));
  for (const page of ['https://news.example/', 'https://video.example/watch']) {
    assert.equal(match('https://ethnicexpressions.org/4/another-campaign', page), true);
    assert.equal(match('https://ethnicexpressions.org/login', page), false);
    assert.equal(match('https://ethnicexpressions.org.evil.example/4/test', page), false);
  }
});
