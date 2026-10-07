// CSS engine is real; the host is explicitly simulated, not an installed extension.
const compatibilityRules=globalThis.__YAS_GENERAL_SITE_RULES_V3__;
const fixtureHost=compatibilityRules.find(r=>r.cosmeticOnly)?.domains.find(d=>!d.startsWith('~'));
const rules=compatibilityRules.filter(r=>globalThis.__YAS_GENERAL_POLICY_V3__.domainRule(fixtureHost,r.domains));
const style=document.createElement('style');style.textContent=rules.flatMap(r=>r.selectors).map(s=>`${s}{display:none!important}`).join('\n');document.head.append(style);
const visible=e=>getComputedStyle(e).display!=='none';
document.getElementById('pause').onclick=()=>{style.disabled=true};
document.getElementById('resume').onclick=()=>{style.disabled=false};
document.getElementById('run').onclick=()=>{
  const checks=[],check=(name,value)=>checks.push({name,passed:!!value});
  for(const id of ['board_detail_top','board_detail','main_left_top','board_ad'])check(id+' 광고 숨김',!visible(document.querySelector('#'+id+' .banner-wrap')));
  for(const id of ['site_left','site_right_banner_item'])check(id+' 광고 껍데기 숨김',!visible(document.getElementById(id)));
  check('우하단 광고와 닫기 버튼 숨김',!visible(document.querySelector('.toast-banner')));
  check('모바일 상단 광고 숨김',!visible(document.querySelector('.floating-banner')));
  check('헤더 일러스트 보존',visible(document.querySelector('#top_right .banner-wrap')));
  check('정상 메뉴와 로그인 보존',visible(document.getElementById('navigation')));
  check('정상 게시글과 미디어 보존',visible(document.getElementById('post'))&&visible(document.querySelector('.post-media')));
  check('정상 공지 보존',visible(document.getElementById('normal-notice')));
  const result={passed:checks.filter(c=>c.passed).length,total:checks.length,checks};
  const output=document.getElementById('results');output.dataset.validation=JSON.stringify(result);output.textContent=`${result.passed}/${result.total} 통과\n`+checks.map(c=>`${c.passed?'PASS':'FAIL'} ${c.name}`).join('\n');
};
document.getElementById('results').textContent='검사 실행을 눌러 주세요.';
