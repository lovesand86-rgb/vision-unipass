// Serialized into UNI-PASS. No arbitrary selectors or scripts from workbooks.
export async function intakeDOM(q){
 try{
  const fail=m=>{throw Error(m);},norm=s=>String(s??'').replace(/[\s*·]/g,''),shown=e=>e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  if(location.origin!=='https://unipass.customs.go.kr'||!location.pathname.startsWith('/csp/'))fail('UNI-PASS 화면이 아닙니다.');
  if(q.action==='diagnostics')return {path:location.pathname,fields:[...document.querySelectorAll('input,select,textarea')].filter(e=>e.type!=='password'&&e.type!=='hidden'&&!/token|secret|cert|csrf/i.test(e.id)).map(e=>({id:e.id,type:e.type,readonly:e.readOnly,disabled:e.disabled,label:(e.closest('td')?.previousElementSibling?.textContent||'').trim().slice(0,100)})),tables:[...document.querySelectorAll('table[id]')].map(t=>({id:t.id,headers:[...t.querySelectorAll('th')].map(e=>e.textContent.trim().slice(0,100))})),buttons:[...document.querySelectorAll('button,a,input[type=button]')].filter(shown).map(e=>({id:e.id,text:(e.textContent||e.value||'').trim().slice(0,100)}))};
  const text=e=>String(e.innerText||e.textContent||e.value||'').trim();
  const one=(xs,label)=>{const a=[...new Set(xs)].filter(shown);if(a.length!==1)fail(label+'을 하나로 찾지 못했습니다.');return a[0];};
  const button=(label,root=document)=>one([...root.querySelectorAll('button,a,input[type=button],input[type=submit]')].filter(e=>norm(text(e)||e.value)===norm(label)&&!e.disabled),label);
  const p='CSW0101001S_',id=k=>document.getElementById(p+k);
  const ctx=()=>['reqRqstNo1','reqRqstNo2','reqRqstNo3'].map(k=>id(k)?.value??null);
  const guard=()=>{if(!id('reqRqstNo3')||JSON.stringify(ctx())!==JSON.stringify(q.application))fail('대상 신청서가 바뀌었습니다.');if(document.documentElement.dataset.visionNewSession!==q.session)fail('신청서 연결이 바뀌었습니다.');};
  const control=(label,root=document)=>{
   const labels=[...root.querySelectorAll('label,th,td')].filter(e=>shown(e)&&norm(text(e))===norm(label));
   const found=labels.flatMap(e=>e.tagName==='LABEL'&&e.htmlFor?[document.getElementById(e.htmlFor)]:[...(e.nextElementSibling?.querySelectorAll('input:not([type=hidden]),select,textarea')||[])]).filter(Boolean);
   return one(found,label);
  };
  const set=(e,value)=>{
   if(!shown(e)||e.disabled||e.readOnly)fail('입력할 수 없는 칸입니다: '+e.id);
   if(e instanceof HTMLSelectElement){const options=[...e.options].filter(o=>!o.disabled&&(o.value===value||norm(o.text)===norm(value)));if(options.length!==1)fail('선택지 불일치: '+value);value=options[0].value;}
   if(e.maxLength>=0&&String(value).length>e.maxLength)fail('입력 길이 초과');
   const proto=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
   Object.getOwnPropertyDescriptor(proto,'value').set.call(e,String(value));e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
   if(e.value!==String(value))fail('입력값이 유지되지 않습니다.');
  };
  const section=label=>{const head=one([...document.querySelectorAll('h2,h3,h4,legend,strong')].filter(e=>norm(text(e))===norm(label)),label);let n=head.nextElementSibling;while(n&&!n.querySelector('input,select'))n=n.nextElementSibling;if(!n)fail(label+' 입력 영역이 없습니다.');return n;};
  const scope=table=>{let e=table.parentElement;while(e&&e!==document.body){const a=[...e.querySelectorAll('button,a')].filter(n=>shown(n)&&norm(text(n))==='추가');if(a.length===1)return e;e=e.parentElement;}fail('추가 버튼 영역을 찾지 못했습니다.');};
  if(q.action==='open_new'){if(id('reqRqstNo3'))return {status:'form'};button('수입식품 등의 수입신고서').click();return {status:'opening'};}
  if(q.action==='bind'){
   if(!id('reqRqstNo3')||id('reqRqstNo3').value||id('impOwrBrno')?.value||id('prlstTbl')?.querySelector('input[type=radio]'))fail('새로 연 빈 신청서가 필요합니다.');
   document.documentElement.dataset.visionNewSession=q.session;return {application:ctx()};
  }
  if(q.action==='popup_query'){
   if(!q.popupPath||location.pathname!==q.popupPath)fail('예상한 조회창이 아닙니다.');
   for(const [label,value]of Object.entries(q.fields))set(control(label),value);
   document.documentElement.dataset.visionPopupSession=q.session;
   const table=one([...document.querySelectorAll('table')].filter(t=>t.querySelector('thead')&&t.querySelector('tbody')), '조회 결과');
   window.__visionIntakeChanged=false;window.__visionIntakeObserver?.disconnect();window.__visionIntakeObserver=new MutationObserver(()=>{window.__visionIntakeChanged=true;});window.__visionIntakeObserver.observe(table.parentElement,{subtree:true,childList:true,characterData:true});
   button('조회').click();return {status:'query'};
  }
  if(q.action==='popup_select'){
   if(location.pathname!==q.popupPath||document.documentElement.dataset.visionPopupSession!==q.session||!window.__visionIntakeChanged)return {status:'waiting'};
   const links=[...document.querySelectorAll('tbody a')].filter(e=>shown(e)&&norm(text(e))===norm(q.code));if(!links.length)return {status:'waiting'};
   const link=one(links,'조회 코드');if(q.name&&!norm(text(link.closest('tr'))).includes(norm(q.name)))fail('조회 코드의 명칭이 다릅니다.');
   if(window.__visionIntakeSelected===q.session)fail('이미 선택한 조회입니다.');window.__visionIntakeSelected=q.session;link.click();return {status:'selected'};
  }
  if(q.action==='process_select'){
   if(!location.pathname.endsWith('/openCSW0302013Q.do'))fail('제조공정 조회창이 아닙니다.');
   for(const code of q.codes)button(code).click();button('확인').click();return {status:'selected'};
  }
  guard();
  if(q.action==='process_open'){button('일괄검색').click();return {status:'opened'};}
  if(q.action==='notice'){
   const title=q.kind==='label'?'한글표시사항 작성 안내':'첨부파일 안내';
   const heads=[...document.querySelectorAll('span,strong,h2,h3,div')].filter(e=>shown(e)&&norm(text(e))===norm(title));if(!heads.length)return {status:'absent'};
   const roots=new Set();for(const head of heads){let n=head.parentElement;while(n&&n!==document.body){const bs=[...n.querySelectorAll('button,a')].filter(e=>shown(e)&&norm(text(e))==='확인');if(bs.length===1&&text(n).includes('오늘 하루 그만보기')){roots.add(n);break;}n=n.parentElement;}}
   const root=one([...roots],title),body=text(root)+' '+[...root.querySelectorAll('textarea')].map(e=>e.value).join(' ');
   if(q.kind==='label'&&!body.includes('현품 포장지'))fail('표시사항 안내 문구가 다릅니다.');
   if(q.kind==='attachment'&&(!body.includes('10번 항목')||!body.includes('자동 반려')))fail('첨부 안내 문구가 다릅니다.');
   button('확인',root).click();return {status:'closed'};
  }
  if(q.action.startsWith('file_')){
   if(!(q.slot===0||q.slot>=9&&q.slot<=18))fail('첨부 위치가 다릅니다.');
   const table=id('attachTbl'),row=table?.rows[q.slot],input=row?.querySelector('input[type=file]');if(!input||!shown(table))fail('첨부파일 칸을 확인하지 못했습니다.');
   window.__visionNewFiles??={};
   if(q.action==='file_begin'){
    if(!/\.(png|jpe?g|bmp|gif|tiff?|pdf)$/i.test(q.name)||q.size<1||q.size>5000000||input.files.length)fail('파일 형식·크기 또는 기존 첨부를 확인하세요.');
    const method=row.querySelector('select')||table.rows[9]?.querySelector('select');if(!method)fail('제출방법이 없습니다.');set(method,'파일첨부');
    window.__visionNewFiles[q.slot]={input,parts:[],length:0,...q};return {status:'ready'};
   }
   const f=window.__visionNewFiles[q.slot];if(!f||f.input!==input)fail('첨부 연결이 바뀌었습니다.');
   if(q.action==='file_chunk'){
    if(q.offset!==f.length||q.data.length>180000)fail('파일 전달 순서가 다릅니다.');const bytes=Uint8Array.from(atob(q.data),c=>c.charCodeAt(0));if(f.length+bytes.length>f.size)fail('파일 크기가 다릅니다.');f.parts.push(bytes);f.length+=bytes.length;return {status:'received'};
   }
   if(f.length!==f.size||input.files.length)fail('첨부 상태가 바뀌었습니다.');
   const file=new File(f.parts,f.name,{type:f.type}),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
   if(hash!==f.sha256)fail('원본 파일과 다릅니다.');guard();if(!input.isConnected||input.disabled)fail('첨부 칸이 변경됐습니다.');const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));delete window.__visionNewFiles[q.slot];
   if(input.files.length!==1||input.files[0].size!==f.size)fail('첨부 결과를 확인하지 못했습니다.');return {status:'attached'};
  }
  if(q.action==='validate'){button('오류검증').click();return {status:'requested'};}
  if(q.action==='read')return {application:ctx(),importer:id('impOwrBrno')?.value,manufacturer:id('mnfcCoPermDclrNo')?.value};
  if(q.action==='tab'){button(q.label).click();return {status:'opened'};}
  if(q.action==='fields'){
   // Resolve every field before writes; workbook keys never become CSS selectors.
   const known={제품명:'mdlStszEnglNmPrlst',한글명:'mdlStszKoreNmPrlst',수량:'dclrQtyPrlst',순중량kg:'mdlStszNtwgPrlst',금액USD:'mdlStszAmtPrlst',소비기한:'circPridEndDtPrlst',신청인전화:'aplcTelno',신청인휴대폰:'aplcCralTelno',수입화주사업자번호:'impOwrBrno',선적일:'shpmDt',반입일:'inscBrngDt'};
   const root=q.section?section(q.section):document;const fields=Object.entries(q.fields).map(([label,value])=>[known[label]?id(known[label]):control(label,root),value,label]);
   for(const [e,,label]of fields)if(!e||!shown(e)||e.readOnly||e.disabled)fail(label+' 입력칸을 확인하지 못했습니다.');
   for(const [e,value]of fields){guard();set(e,value);}return {status:'filled'};
  }
  if(q.action==='lookup'){
   const root=q.section?section(q.section):document;const e=q.suffix?id(q.suffix):control(q.label,root);if(!e)fail('조회 대상 입력칸이 없습니다.');
   const cell=e.closest('td')||e.parentElement;const b=one([...cell.querySelectorAll('button,a,input[type=button]')].filter(e=>!e.disabled),'조회 버튼');b.click();return {status:'opened'};
  }
  if(q.action==='cargo_check'){
   const cargo=['cargMtNoPrlst1','cargMtNoPrlst2','cargMtNoPrlst3'].map(k=>id(k)?.value||'').join('');return {status:cargo===q.cargo&&id('blNoCn')?.value===q.hbl?'connected':'waiting'};
  }
  if(q.action==='item_add'){
   const table=id('prlstTbl');if(!table)fail('품목 목록이 없습니다.');
   const n=table.querySelectorAll('input[type=radio]').length;if(n!==q.expectedCount)fail('품목 수가 변경됐습니다.');
   const marker='item:'+q.index;if(window.__visionIntakeAdds?.includes(marker))fail('품목 추가 결과 확인이 필요합니다.');
   window.__visionIntakeAdds??=[];window.__visionIntakeAdds.push(marker);button('추가',scope(table)).click();return {status:'requested'};
  }
  if(q.action==='item_verify'){
   const table=id('prlstTbl');if(table?.querySelectorAll('input[type=radio]').length!==q.expectedCount)return {status:'waiting'};
   const cells=[...table.querySelectorAll('td')].map(e=>norm(e.querySelector('input[readonly]')?.value||text(e))).join('|');
   if(!q.values.every(v=>cells.includes(norm(v))))return {status:'waiting'};return {status:'verified'};
  }
  if(q.action==='grid_add'){
   const table=id(q.table);if(!table)fail('입력 목록이 없습니다.');
   const expected=q.expectedRows,rows=[...table.querySelectorAll('tbody tr')].filter(r=>r.querySelector('input:not([type=hidden]),select,textarea'));
   if(rows.length!==expected)fail('목록 행 수가 달라졌습니다.');
   const b=button(q.button||'행추가');b.click();return {status:'added'};
  }
  if(q.action==='grid_fields'){
   const table=id(q.table),rows=[...table?.querySelectorAll('tbody tr')||[]].filter(r=>r.querySelector('input:not([type=hidden]),select,textarea')),row=rows[q.index];if(!row)fail('추가한 행이 없습니다.');
   const fields=[...row.querySelectorAll('select,input[type=text],input:not([type]),textarea')].filter(e=>shown(e)&&!e.readOnly&&!e.disabled);
   if(fields.length!==q.values.length)fail('행의 입력칸 구성이 다릅니다.');q.values.forEach((v,i)=>set(fields[i],v));return {status:'filled'};
  }
  if(q.action==='process_add'){const table=id('mnfcProgTbl');if(!table)fail('공정 목록이 없습니다.');button('추가',scope(table)).click();return {status:'requested'};}
  if(q.action==='grid_lookup'){
   const table=id(q.table),rows=[...table?.querySelectorAll('tbody tr')||[]].filter(r=>r.querySelector('input[type=text],input:not([type]),select,textarea')),row=rows[q.index];if(!row)fail('조회할 행이 없습니다.');
   const candidate=[...row.querySelectorAll('button,a')].filter(e=>shown(e)&&!norm(text(e)));one(candidate,'행 조회 버튼').click();return {status:'opened'};
  }
  if(q.action==='ingredient_add'){
   const table=id('mnigTbl');if(!table)fail('성분 목록이 없습니다.');
   if(q.parentIndex!==null){const rows=[...table.querySelectorAll('tbody tr')].filter(r=>r.querySelector('input[type=text]'));const row=rows[q.parentIndex];if(!row)fail('상위 성분을 찾지 못했습니다.');button(q.kind==='부혼합'?'부혼합성분추가':'부성분추가',row).click();}
   else button(q.kind==='혼합'?'혼합성분등록':'주성분등록').click();return {status:'added'};
  }
  if(q.action==='ingredient_ratio'){
   const table=id('mnigTbl'),row=[...table?.querySelectorAll('tbody tr')||[]].find(r=>norm(text(r)).includes(norm(q.code)));
   if(!row)fail('등록 성분코드를 찾지 못했습니다.');const headers=[...table.querySelectorAll('thead th')].map(e=>norm(text(e))),col=headers.indexOf('배합비율');if(col<0)fail('배합비율 열이 없습니다.');set(one(row.cells[col].querySelectorAll('input'),'배합비율'),q.value);return {status:'filled'};
  }
  if(q.action==='grid_verify'){
   const table=id(q.table);if(!table)fail('대조할 목록이 없습니다.');const value=norm([...table.querySelectorAll('td')].map(e=>text(e)+' '+[...e.querySelectorAll('input,textarea')].map(n=>n.value).join(' ')).join(' '));
   return {status:q.values.every(v=>value.includes(norm(v)))?'verified':'waiting'};
  }
  fail('지원하지 않는 동작입니다.');
 }catch(e){return {status:'blocked',reason:e.message};}
}
