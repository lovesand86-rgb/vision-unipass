// Serialized into UNI-PASS. No arbitrary selectors or scripts from workbooks.
export async function intakeDOM(q){
 try{
  const fail=m=>{throw Error(m);},norm=s=>String(s??'').replace(/[\s*·]/g,''),shown=e=>e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  if(location.origin!=='https://unipass.customs.go.kr'||!location.pathname.startsWith('/csp/'))fail('UNI-PASS 화면이 아닙니다.');
  if(q.action==='diagnostics')return {path:location.pathname,fields:[...document.querySelectorAll('input,select,textarea')].filter(e=>e.type!=='password'&&e.type!=='hidden'&&!/token|secret|cert|csrf/i.test(e.id)).map(e=>({id:e.id,type:e.type,readonly:e.readOnly,disabled:e.disabled,label:(e.closest('td')?.previousElementSibling?.textContent||'').trim().slice(0,100)})),tables:[...document.querySelectorAll('table[id]')].map(t=>({id:t.id,headers:[...t.querySelectorAll('th')].map(e=>e.textContent.trim().slice(0,100))})),buttons:[...document.querySelectorAll('button,a,input[type=button]')].filter(shown).map(e=>({id:e.id,text:(e.textContent||e.value||'').trim().slice(0,100)}))};
  fail('진단 전용 기능입니다.');
 }catch(e){return {status:'blocked',reason:e.message};}
}
