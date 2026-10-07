const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..');
const parser=import(pathToFileURL(path.join(root,'scripts/cosmetic-filter-parser.mjs')).href);
function policy() {
  const c=vm.createContext({URL});
  vm.runInContext(fs.readFileSync(path.join(root,'general/policy.js'),'utf8'),c);
  return c.__YAS_GENERAL_POLICY_V3__;
}
test('all current cosmetic modifier exceptions are compiled, not sent to the network engine',async()=>{
  const {parseCosmeticException}=await parser;
  const expected=[];
  for(const source of ['easylist','youslist']) {
    for(const line of fs.readFileSync(path.join(root,'filters/sources',source+'.txt'),'utf8').split(/\r?\n/)) {
      const parsed=parseCosmeticException(line);
      if(parsed) {assert.equal(parsed.unsupported,undefined,line);expected.push(parsed)}
    }
  }
  const compiled=JSON.parse(fs.readFileSync(path.join(root,'filters/cosmetic-policy.json'),'utf8'));
  const provenance=JSON.parse(fs.readFileSync(path.join(root,'filters/provenance.json'),'utf8'));
  assert.equal(expected.length,169);assert.deepEqual(compiled,expected);
  assert.equal(provenance.cosmeticPolicyRules,169);assert.deepEqual(provenance.unsupportedCosmeticPolicies,[]);
});
test('hostname anchors include subdomains, not path mentions or deceptive suffixes',async()=>{
  const {parseCosmeticException:parse}=await parser;
  const rules=[parse('@@||example.org^$generichide')],p=policy();
  for(const href of ['https://example.org/','http://sub.example.org:8080/a','https://name:pass@sub.example.org/a'])assert.equal(p.cosmeticPolicy(href,rules).generic,false);
  for(const href of ['https://notexample.org/','https://example.org.evil.test/','https://safe.test/example.org/','https://safe.test/?x=example.org','not a URL','about:blank'])assert.equal(p.cosmeticPolicy(href,rules).generic,true);
});
test('path, wildcard and query punctuation keep their original exception scope',async()=>{
  const {parseCosmeticException:parse}=await parser;
  const p=policy(),r=[parse('@@||www.google.*/search?$generichide')];
  assert.equal(p.cosmeticPolicy('https://www.google.co.kr/search?q=x',r).generic,false);
  assert.equal(p.cosmeticPolicy('https://www.google.com/about?q=x',r).generic,true);
  assert.equal(p.cosmeticPolicy('https://www.google.com/search-other?q=x',r).generic,true);
  const t=[parse('@@||taboolanews.com/summary-page/*_samsung-carnival-$generichide')];
  assert.equal(p.cosmeticPolicy('https://taboolanews.com/summary-page/123_samsung-carnival-us',t).generic,false);
  assert.equal(p.cosmeticPolicy('https://taboolanews.com/news/123_samsung-carnival-us',t).generic,true);
});
test('domain-only exceptions respect positive and negative domain boundaries',async()=>{
  const {parseCosmeticException:parse}=await parser;
  const rules=[parse('@@$generichide,domain=example.org|~excluded.example.org')],p=policy();
  assert.equal(p.cosmeticPolicy('https://sub.example.org/',rules).generic,false);
  assert.equal(p.cosmeticPolicy('https://excluded.example.org/',rules).generic,true);
  assert.equal(p.cosmeticPolicy('https://example.org.other/',rules).generic,true);
});
test('private/local source exceptions and specific/all aliases remain cosmetic-only',async()=>{
  const {parseCosmeticException:parse}=await parser;
  const p=policy();
  for(const s of ['@@://192.168.$generichide','@@://localhost:$generichide','@@://127.0.0.1$generichide']) {
    const r=parse(s),url=s.includes('192.')?'http://192.168.1.20/':s.includes('localhost')?'http://localhost:8767/':'http://127.0.0.1:8767/';
    assert.equal(p.cosmeticPolicy(url,[r]).generic,false);assert.equal(p.cosmeticPolicy(url,[r]).specific,true);
  }
  assert.equal(p.cosmeticPolicy('https://example.org/',[parse('@@||example.org^$shide')]).specific,false);
  const all=p.cosmeticPolicy('https://example.org/',[parse('@@||example.org^$ehide')]);
  assert.equal(all.generic,false);assert.equal(all.specific,false);
});
test('end anchors and match-case do not broaden to additional paths or mixed-case paths',async()=>{
  const {parseCosmeticException:parse}=await parser;
  const p=policy(),r=[parse('@@|https://example.org/Path|$generichide,match-case')];
  assert.equal(p.cosmeticPolicy('https://example.org/Path',r).generic,false);
  assert.equal(p.cosmeticPolicy('https://example.org/path',r).generic,true);
  assert.equal(p.cosmeticPolicy('https://example.org/Path/more',r).generic,true);
});
test('unsupported options or patterns are reported, never silently broadened',async()=>{
  const {parseCosmeticException:parse}=await parser;
  for(const line of ['@@||example.org^$generichide,third-party','@@||example.org^$generichide,domain=*.example.org','@@/example\\.org/$generichide','@@$generichide,domain=','@@$generichide,domain=a.org,domain=b.org'])assert.ok(parse(line).unsupported,line);
  assert.equal(parse('||ads.example.org^'),null);assert.equal(parse('@@||example.org^$script'),null);assert.equal(parse('example.org#@#.ad'),null);
});
