const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
function harness() {
  const context = vm.createContext({ URL, console });
  vm.runInContext(read('general/policy.js'), context);
  return { context, run: s => vm.runInContext(s, context), policy: vm.runInContext("globalThis.__YAS_GENERAL_POLICY_V3__", context) };
}
test('hostname matching respects boundaries and paused parent sites', () => {
  const { policy: p } = harness();
  assert.equal(p.hostMatches('sub.example.org','example.org'), true);
  assert.equal(p.hostMatches('notexample.org','example.org'), false);
  assert.equal(p.enabled('sub.example.org',{ disabledSites:['example.org'] }), false);
  assert.equal(p.enabled('other.org',{ disabledSites:['example.org'] }), true);
  assert.equal(p.enabled('other.org',{ globalEnabled:false }), false);
});
test('ad URL matching does not match path strings, spoofed suffixes or protocols', () => {
  const p = harness().policy, hosts = new Set(['ads.example.org']);
  for (const u of ['https://ads.example.org/a','https://a.ads.example.org/a','//ads.example.org/a']) assert.equal(p.adUrl(u,'https://safe.org/',hosts),true);
  for (const u of ['https://ads.example.org.safe.org/','https://safe.org/ads.example.org','javascript:alert(1)','about:blank',null,{}]) assert.equal(p.adUrl(u,'https://safe.org/',hosts),false);
});
test('cosmetic rules respect domain inclusions and exclusions', () => {
  const p = harness().policy;
  assert.equal(p.domainRule('a.example.org',['example.org','~excluded.org']),true);
  assert.equal(p.domainRule('a.excluded.org',['~excluded.org']),false);
  assert.equal(p.domainRule('other.org',['example.org']),false);
  assert.equal(p.domainRule('other.org',[]),true);
});
function guard(enabled = true) {
  const h = harness();
  h.run(`window=globalThis; location={href:'https://safe.org/page'}; events={}; calls=[];
    addEventListener=(n,f)=>events[n]=f;
    document={documentElement:{dataset:{}},addEventListener:(n,f)=>events[n]=f};
    open=function(...args){calls.push({self:this,args});return 'native-window'};
    globalThis.__YAS_GENERAL_DATA_V3__={popupHosts:['ads.example.org']};`);
  h.run(read('general/popup-guard.js'));
  if(enabled) h.run(`events.message({source:window,data:{type:'YAS_GENERAL_STATE',enabled:true}})`);
  return h;
}
test('popup guard starts inactive until site preferences arrive', () => {
  const h=guard(false);
  assert.equal(h.run(`open('https://ads.example.org/')`),'native-window');
  assert.equal(h.run(`window[Symbol.for('yas.general.popup')].blockedOpen`),0);
});
test('known advertising window.open is blocked; normal opens preserve features and result', () => {
  const h=guard();
  assert.equal(h.run(`open('https://ads.example.org/a','_blank','width=600')`),null);
  assert.equal(h.run(`open('https://accounts.example.org/login','auth','width=600')`),'native-window');
  assert.deepEqual(JSON.parse(h.run('JSON.stringify(calls[0].args)')),['https://accounts.example.org/login','auth','width=600']);
  assert.equal(h.run(`window[Symbol.for('yas.general.popup')].blockedOpen`),1);
});
test('object arguments are passed to native open without coercion; duplicate injection is inert', () => {
  const h=guard();
  h.run(`coercions=0; argument={toString(){coercions++;return 'https://safe.org/'}}; open(argument); wrapped=open;`);
  assert.equal(h.run('coercions'),0);
  assert.equal(h.run('calls[0].args[0]===argument'),true);
  h.run(read('general/popup-guard.js'));
  assert.equal(h.run('open===wrapped'),true);
});
test('site pause restores normal opening; foreign-source messages cannot toggle', () => {
  const h=guard();
  h.run(`events.message({source:{},data:{type:'YAS_GENERAL_STATE',enabled:false}})`);
  assert.equal(h.run(`open('https://ads.example.org/')`),null);
  h.run(`events.message({source:window,data:{type:'YAS_GENERAL_STATE',enabled:false}})`);
  assert.equal(h.run(`open('https://ads.example.org/')`),'native-window');
});
test('only ad links opening a new window are intercepted', () => {
  const h=guard();
  h.run(`prevented=0; stopped=0; anchor={href:'https://ads.example.org/',target:'_blank'};
    event={target:{closest:()=>anchor},preventDefault(){prevented++},stopImmediatePropagation(){stopped++}};
    events.click(event); anchor.target=''; events.click(event); anchor.target='_blank';anchor.href='https://safe.org/';events.click(event);`);
  assert.equal(h.run('prevented'),1); assert.equal(h.run('stopped'),1);
});
test('compiled DNR rules are bounded, uniquely identified, valid and YouTube-excluded', () => {
  const rules=json('filters/network.json');
  assert.ok(rules.length>20000 && rules.length<=30000);
  assert.equal(new Set(rules.map(r=>r.id)).size,rules.length);
  assert.ok(rules.filter(r=>r.condition.regexFilter).length<=1000);
  for (const r of rules) {
    assert.ok(Number.isInteger(r.id) && r.id>0);
    assert.ok(['block','allow','allowAllRequests'].includes(r.action.type));
    assert.ok(r.condition.excludedInitiatorDomains.includes('youtube.com'));
    assert.ok(!(r.condition.resourceTypes && r.condition.excludedResourceTypes));
    if (r.action.type==='block') assert.ok(r.condition.resourceTypes ? !r.condition.resourceTypes.includes('main_frame') : r.condition.excludedResourceTypes.includes('main_frame'));
  }
});
test('the supplied ad4989 iframe is explicitly covered without blocking image hosting', () => {
  const rule=json('filters/network.json').find(r=>r.id===900001);
  assert.ok(rule.condition.requestDomains.includes('ad.ad4989.co.kr'));
  assert.ok(rule.condition.resourceTypes.includes('sub_frame'));
  const h=harness();h.run(read('general/rule-data.js'));
  const hosts=new Set(h.run("globalThis.__YAS_GENERAL_DATA_V3__.popupHosts"));
  assert.ok(hosts.has('ad.ad4989.co.kr'));
  assert.equal(hosts.has('i.ibb.co'),false);
  assert.equal(hosts.has('pandalive.co.kr'),false);
});
test('source snapshots and attribution metadata match their recorded hashes', () => {
  const crypto=require('node:crypto'), p=json('filters/provenance.json');
  for (const s of p.sources) {
    const file=s.name==='EasyList'?'easylist.txt':'youslist.txt';
    assert.equal(crypto.createHash('sha256').update(read('filters/sources/'+file)).digest('hex'),s.sha256);
    assert.match(s.license,/^CC-BY/);
  }
  assert.equal(p.networkRules,json('filters/network.json').length);
  assert.ok(p.limitations.length>0, 'report the converter cap rather than implying full parity');
});
test('Chrome general adblock and YouTube scripts are kept separate', () => {
  const m=json('manifest.json');
  assert.equal(m.version,'3.0.4');
  assert.ok(m.permissions.includes('declarativeNetRequest'));
  for(const c of m.content_scripts.filter(c=>c.js.some(f=>f.startsWith('general/')))) assert.ok(c.exclude_matches.some(p=>p.includes('youtube.com')));
});
test('network-exempt compatibility domains use a high-priority frame allow rule',()=>{
  const rules=json('filters/network.json'),allow=rules.find(r=>r.id===900002);
  assert.equal(allow.action.type,'allowAllRequests');assert.equal(allow.priority,100000);
  assert.deepEqual(allow.condition.requestDomains,['heye.kr']);assert.ok(allow.condition.resourceTypes.includes('main_frame'));
  for(const r of rules.filter(r=>r.action.type==='block'))assert.ok(r.condition.excludedInitiatorDomains.includes('heye.kr'));
  const site=json('general/site-rules.json')[0];assert.equal(site.networkExempt,true);assert.equal(site.cosmeticOnly,true);
});
test('each production Chrome world is a single self-contained bundle',()=>{
  const groups=json('manifest.json').content_scripts.filter(c=>c.js.some(f=>f.startsWith('general/')));
  assert.equal(groups.length,2);
  for(const g of groups) {
    assert.equal(g.js.length,1);assert.match(g.js[0],/-bundle\.js$/);
    assert.doesNotMatch(read(g.js[0]),/globalThis\.__YAS_GENERAL_(?:POLICY|DATA|SITE_RULES)_V3__/);
  }
  assert.match(read('background.js'),/importScripts\("general\/worker-bundle\.js"\)/);
});
test('production MAIN popup bundle needs no policy or rule-data file loaded beforehand',()=>{
  const c=vm.createContext({URL,console});
  vm.runInContext(`window=globalThis;location={href:'https://heye.kr/'};events={};calls=[];
    addEventListener=(n,f)=>events[n]=f;document={documentElement:{dataset:{}},addEventListener:(n,f)=>events[n]=f};
    open=(...args)=>{calls.push(args);return 'normal-window'};`,c);
  Object.defineProperty(c,'__YAS_GENERAL_POLICY_V3__',{get(){throw Error('old policy export accessed')}});
  Object.defineProperty(c,'__YAS_GENERAL_DATA_V3__',{get(){throw Error('old data export accessed')}});
  vm.runInContext(read('general/main-bundle.js'),c);
  vm.runInContext(`events.message({source:window,data:{type:'YAS_GENERAL_STATE',enabled:true}})`,c);
  assert.equal(vm.runInContext(`open('https://ad.ad4989.co.kr/a')`,c),null);
  assert.equal(vm.runInContext(`open('https://heye.kr/board/index.html')`,c),'normal-window');
});
test('known campaign popups are blocked without blocking provider pages or logins',()=>{
  const p=harness().policy,hosts=new Set();
  for(const url of ['https://www.pandalive.co.kr/evt/heye01&5&iframe','https://pandalive.co.kr/evt/heye06&5&iframe'])assert.equal(p.adUrl(url,'https://heye.kr/',hosts),true);
  for(const url of ['https://www.pandalive.co.kr/play/pandacp','https://www.pandalive.co.kr/login','https://www.pandalive.co.kr/evt/heye01-news','https://www.pandalive.co.kr.example.org/evt/heye01&5'])assert.equal(p.adUrl(url,'https://heye.kr/',hosts),false);
});
