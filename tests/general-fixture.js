// Native APIs are test doubles; no requests or actual new tabs reach ad servers.
const prefs={globalEnabled:true,disabledSites:[]}, changes=[];
let nativeCalls=0, appliedStyle;
window.open=()=>{nativeCalls++;return {testWindow:true}};
window.chrome={storage:{local:{get:async defaults=>({...defaults,...prefs})},onChanged:{addListener:f=>changes.push(f)}},runtime:{
  getURL:p=>'/'+p,
  sendMessage:async m=>{
    if(m.type==='YAS_FRAME_CONTEXT')return {host:location.hostname};
    if(m.type==='YAS_GENERAL_CSS'){
      if(m.remove)appliedStyle?.remove();else{appliedStyle=document.createElement('style');appliedStyle.textContent=m.css;document.head.append(appliedStyle)}
      return {ok:true};
    }
  }
}};
// The fixture's frame-src 'none' CSP blocks all outbound iframe fetches.
document.querySelector('iframe').setAttribute('sandbox','');
document.querySelector('iframe').setAttribute('src',document.querySelector('iframe').dataset.adSrc);
async function setEnabled(enabled){prefs.globalEnabled=enabled;for(const f of changes)f({globalEnabled:{}},'local');}
document.querySelector('#pause').onclick=()=>setEnabled(false);
document.querySelector('#resume').onclick=()=>setEnabled(true);
document.querySelector('#run').onclick=()=>{
  const checks=[],expect=(name,value)=>checks.push({name,passed:!!value});
  const visible=id=>getComputedStyle(document.getElementById(id)).display!=='none';
  expect('제공된 고정 광고 숨김',!visible('exact-banner'));
  expect('제공된 광고 iframe 껍데기 숨김',!visible('enter_0Gm0'));
  expect('정상 본문 보존',visible('normal'));expect('정상 공지 배너 보존',visible('normal-banner'));
  expect('광고 window.open 차단',window.open('https://ad.ad4989.co.kr/a')===null);
  expect('정상 새 창 반환 보존',window.open('https://accounts.example.org/login')?.testWindow===true);
  let prevented=false;const a=document.createElement('a');a.href='https://ad.ad4989.co.kr/a';a.target='_blank';document.body.append(a);
  prevented=!a.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));a.remove();expect('광고 새 창 링크 차단',prevented);
  expect('정상 로그인 링크 보존',document.getElementById('legit').getAttribute('target')==='_blank');
  document.getElementById('results').textContent=JSON.stringify({passed:checks.filter(c=>c.passed).length,total:checks.length,checks},null,2);
};
document.getElementById('results').textContent='필터 로딩 후 검사 실행을 눌러 주세요.';
