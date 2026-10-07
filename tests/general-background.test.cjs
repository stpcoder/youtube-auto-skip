const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function harness(prefs={},getSource=async()=>({url:'https://news.example.org/article'})) {
  const listeners={}, removed=[], css=[], updates=[], toggles=[], errors=[];
  const event=n=>({addListener:f=>listeners[n]=f});
  const c=vm.createContext({URL,console,setTimeout:()=>0});
  c.chrome={runtime:{id:'extension',onInstalled:event('installed'),onStartup:event('startup'),onMessage:event('message')},
    storage:{local:{get:async defaults=>({...defaults,...prefs}),remove:async()=>{},set:async e=>errors.push(e)},onChanged:event('changed')},
    declarativeNetRequest:{getDynamicRules:async()=>[{id:1000000},{id:12}],updateDynamicRules:async d=>updates.push(d),updateEnabledRulesets:async d=>toggles.push(d)},
    scripting:{insertCSS:async d=>css.push(['insert',d]),removeCSS:async d=>css.push(['remove',d])},
    tabs:{get:getSource,remove:async id=>removed.push(id),onRemoved:event('removed')},
    webNavigation:{onCreatedNavigationTarget:event('created'),onBeforeNavigate:event('before'),onCommitted:event('committed')}};
  c.importScripts=(...files)=>{for(const f of files) vm.runInContext(read(f),c);};
  vm.runInContext(read('general/background.js'),c);
  return {listeners,removed,css,updates,toggles,errors,prefs};
}
test('paused sites add allow rules without removing unrelated dynamic rules',async()=>{
  const h=harness({disabledSites:['example.org']});await tick();
  assert.deepEqual([...h.updates[0].removeRuleIds],[1000000]);
  assert.equal(h.updates[0].addRules[0].action.type,'allowAllRequests');
  assert.equal(h.updates[0].addRules[0].condition.requestDomains[0],'example.org');
  assert.equal(h.errors.length,0);
});
test('global pause disables the general ruleset and known-ad popup closing',async()=>{
  const h=harness({globalEnabled:false});await tick();
  assert.equal(h.toggles[0].disableRulesetIds[0],'general_ads');
  await h.listeners.created({sourceTabId:1,tabId:2,url:'https://ad.ad4989.co.kr/a'});
  assert.equal(h.removed.length,0);
});
test('source site pause prevents popup closing even for a listed ad server',async()=>{
  const h=harness({disabledSites:['example.org']});await tick();
  await h.listeners.created({sourceTabId:1,tabId:2,url:'https://ad.ad4989.co.kr/a'});
  assert.equal(h.removed.length,0);
});
test('only a newly-created known advertising tab is closed',async()=>{
  const h=harness();await tick();
  h.listeners.before({tabId:42,frameId:0,url:'https://ad.ad4989.co.kr/a'});await tick();
  assert.equal(h.removed.length,0);
  await h.listeners.created({sourceTabId:1,tabId:2,url:'https://ad.ad4989.co.kr/a'});
  assert.deepEqual(h.removed,[2]);
});
test('a blank popup is inspected on navigation; a legitimate committed tab is never closed later',async()=>{
  const h=harness();await tick();
  await h.listeners.created({sourceTabId:1,tabId:3,url:'about:blank'});
  h.listeners.before({tabId:3,frameId:0,url:'https://ad.ad4989.co.kr/a'});await tick();
  assert.deepEqual(h.removed,[3]);
  await h.listeners.created({sourceTabId:1,tabId:4,url:'https://accounts.example.org/login'});
  h.listeners.committed({tabId:4,frameId:0,url:'https://accounts.example.org/login'});
  h.listeners.before({tabId:4,frameId:0,url:'https://ad.ad4989.co.kr/a'});await tick();
  assert.deepEqual(h.removed,[3]);
});
test('CSS injection accepts only extension content-script senders and the sender frame',async()=>{
  const h=harness();await tick();const replies=[],msg={type:'YAS_GENERAL_CSS',css:'.ad{display:none}',remove:false};
  const sender={id:'extension',tab:{id:1,url:'https://safe.org/'},url:'https://safe.org/frame',frameId:2};
  for(const s of [{...sender,id:'foreign'},{...sender,url:'file:///secret'},{...sender,tab:{}}])assert.equal(h.listeners.message(msg,s,r=>replies.push(r)),false);
  assert.equal(h.listeners.message(msg,sender,r=>replies.push(r)),true);await tick();
  assert.equal(h.css.length,1);assert.equal(h.css[0][1].target.tabId,1);assert.equal(h.css[0][1].target.frameIds[0],2);assert.equal(replies[0].ok,true);
});
test('a legitimate commit during delayed source lookup cancels popup tracking',async()=>{
  let resolveSource;const source=new Promise(r=>resolveSource=r),h=harness({},()=>source);await tick();
  const created=h.listeners.created({sourceTabId:1,tabId:5,url:'about:blank'});
  h.listeners.committed({tabId:5,frameId:0,url:'https://accounts.example.org/login'});
  resolveSource({url:'https://news.example.org/article'});await created;
  h.listeners.before({tabId:5,frameId:0,url:'https://ad.ad4989.co.kr/a'});await tick();
  assert.equal(h.removed.length,0);
});
