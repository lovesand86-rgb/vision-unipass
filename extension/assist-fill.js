// This function is serialized by Chrome. Keep every dependency inside it.
export async function assistFill(request){
 const stop=m=>{throw Error(m);};
 if(location.protocol!=='https:'||location.hostname!=='unipass.customs.go.kr'||location.pathname!=='/csp/csw/reqrqstmt/apfmmt/foodEtcImpDcshMtCtr/retrieveApfmReg.do'){
  // Match the actual observed CSW0101001S form rather than inventing a new route.
  if(location.protocol!=='https:'||location.hostname!=='unipass.customs.go.kr'||!location.pathname.startsWith('/csp/')||!document.getElementById('CSW0101001S_reqRqstNo1'))stop('UNI-PASS의 입력 가능한 신청서 화면을 열어주세요.');
 }
 const prefix='CSW0101001S_';
 const blocked=/password|passwd|cert|token|secret|reqRqstNo|rqstDttm|csrf/i;
 const shown=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
 const editable=e=>e.id.startsWith(prefix)&&!blocked.test(e.id)&&!e.disabled&&!e.readOnly&&shown(e)&&((e instanceof HTMLInputElement&&['text','tel','number','date','email'].includes(e.type))||e instanceof HTMLTextAreaElement||e instanceof HTMLSelectElement);
 const fields=()=>[...document.querySelectorAll('input[id],textarea[id],select[id]')].filter(editable).filter(e=>document.querySelectorAll('#'+CSS.escape(e.id)).length===1).map(e=>({id:e.id,label:(document.querySelector('label[for="'+CSS.escape(e.id)+'"]')?.textContent||e.getAttribute('aria-label')||e.title||e.closest('td')?.previousElementSibling?.textContent||e.id.slice(prefix.length)).trim().slice(0,120),type:e.tagName.toLowerCase(),value:e.value,maxLength:e.maxLength??-1,options:e instanceof HTMLSelectElement?[...e.options].map(o=>({value:o.value,label:o.text,disabled:o.disabled})):undefined}));
 const context=()=>({path:location.pathname,application:['reqRqstNo1','reqRqstNo2','reqRqstNo3'].map(s=>document.getElementById(prefix+s)?.value||''),identity:['impOwrBrno','mnfcCoPermDclrNo','blNoCn'].map(s=>document.getElementById(prefix+s)?.value||'')});
 const hash=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const current=fields();if(!current.length)stop('현재 탭에 연결할 수 있는 입력칸이 없습니다. 품목사항 또는 공통사항을 열어주세요.');
 const ctx=context();
 if(request.mode==='capture')return {fields:current,context:ctx};
 if(!['preview','apply'].includes(request.mode)||!Array.isArray(request.rows)||!request.rows.length||request.rows.length>200)stop('입력 자료를 확인해주세요.');
 if(JSON.stringify(ctx)!==JSON.stringify(request.context))stop('입력 대상이 바뀌었습니다. 입력칸을 다시 읽어주세요.');
 const used=new Set();
 const changes=request.rows.map(r=>{
  const f=current.find(f=>f.id===r.target);
  if(!f||used.has(r.target)||typeof r.value!=='string'||r.value.length>10000||!r.reviewed||!r.source?.trim())stop('입력칸 연결 또는 자료 확인 상태가 올바르지 않습니다.');
  used.add(r.target);
  if(f.maxLength>=0&&r.value.length>f.maxLength)stop(`${f.label}: 입력 가능한 길이를 넘습니다.`);
  if(f.options&&!f.options.some(o=>!o.disabled&&(o.value===r.value||o.label===r.value)))stop(`${f.label}: 해당 선택지가 없습니다. 실제 코드나 선택지 이름을 확인해주세요.`);
  const after=f.options?(f.options.find(o=>!o.disabled&&o.value===r.value)||f.options.find(o=>!o.disabled&&o.label===r.value)).value:r.value;
  const e=document.getElementById(f.id);
  if(e.type==='number'&&(!Number.isFinite(Number(after))||after.trim()===''))stop(`${f.label}: 숫자를 확인해주세요.`);
  if(e.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(after)||Number.isNaN(Date.parse(after))||new Date(after).toISOString().slice(0,10)!==after))stop(`${f.label}: 날짜를 확인해주세요.`);
  return {target:f.id,label:r.label||f.label,before:f.value,after};
 });
 const digest=await hash({ctx,current,rows:request.rows});
 if(request.mode==='preview')return {digest,changes,context:ctx};
 if(request.digest!==digest)stop('미리보기 이후 화면 또는 자료가 바뀌었습니다. 다시 확인해주세요.');
 const applied=[];
 try{
  for(const c of changes){
   const e=document.getElementById(c.target);
   // Values may trigger page events. Recheck each remaining control; never click a page button.
   if(!e||!editable(e)||e.value!==c.before||context().path!==ctx.path||JSON.stringify(context().application)!==JSON.stringify(ctx.application))stop('입력 도중 화면이 바뀌었습니다. 일부 입력 결과를 확인해주세요.');
   if(c.before===c.after)continue;
   const proto=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
   Object.getOwnPropertyDescriptor(proto,'value').set.call(e,c.after);applied.push(c.target);
   e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
  }
  await new Promise(r=>setTimeout(r,120));
  if(changes.some(c=>document.getElementById(c.target)?.value!==c.after))stop('사이트가 값을 변경했습니다. 입력 결과를 직접 확인해주세요.');
  return {status:'filled',count:changes.length,applied,saved:false,submitted:false};
 }catch(e){return {status:'partial',message:e.message,applied,saved:false,submitted:false};}
}
