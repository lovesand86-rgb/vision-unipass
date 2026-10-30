// Serialized by chrome.scripting. Select controls by observed IDs or exact visible labels.
export async function newDOM(q){
 try{
  const stop=m=>{throw Error(m);},p='CSW0101001S_',norm=v=>String(v??'').normalize('NFKC').replace(/[\s*·ㆍ,，().\/：:]/g,'').toUpperCase();
  if(location.origin!=='https://unipass.customs.go.kr'||!location.pathname.startsWith('/csp/'))stop('UNI-PASS 화면이 아닙니다.');
  const visible=e=>!!e&&!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const text=e=>String(e?.innerText||e?.textContent||e?.value||'').trim();
  const label=e=>{const clone=e.cloneNode(true);clone.querySelectorAll('button,a,input,select,textarea,script').forEach(n=>n.remove());return clone.textContent.trim();};
  const single=(arr,name)=>{const a=[...new Set(arr)];if(a.length!==1)stop(name+'을 하나로 확인하지 못했습니다 ('+a.length+').');return a[0];};
  const id=s=>{const nodes=document.querySelectorAll('#'+CSS.escape(p+s));return nodes.length===1?nodes[0]:null;};
  const app=()=>['reqRqstNo1','reqRqstNo2','reqRqstNo3'].map(k=>id(k)?.value?.trim()??null);
  const num=v=>{const s=String(v??'').replace(/,/g,'').trim();return /^\d+(?:\.\d+)?$/.test(s)?Number(s):NaN;};
  const get=e=>{const c=e?.querySelector('input:not([type=radio]):not([type=checkbox]):not([type=hidden]),textarea,select');return c?c.value:text(e);};
  const controls=root=>[...root.querySelectorAll('input:not([type=hidden]),textarea,select')];
  const buttons=(root=document)=>[...root.querySelectorAll('button,a,input[type=button],input[type=submit]')].filter(e=>visible(e)&&!e.disabled);
  const button=(names,root=document)=>single(buttons(root).filter(e=>(Array.isArray(names)?names:[names]).some(n=>norm(n)===norm(text(e)||e.value))),String(names));
  const section=name=>{
   const heads=[...document.querySelectorAll('h2,h3,h4,h5,legend,p,div')].filter(e=>visible(e)&&!e.querySelector('table,input,select,textarea')&&norm(label(e))===norm(name));
   const head=single(heads.filter(e=>!heads.some(o=>o!==e&&e.contains(o))),name);
   let n=head.nextElementSibling;while(n&&!n.querySelector('input,select,textarea'))n=n.nextElementSibling;
   if(!n)stop(name+' 입력 영역이 없습니다.');return n;
  };
  const cell=(names,root=document)=>{
   const wanted=(Array.isArray(names)?names:[names]).map(norm);
   const matches=[...root.querySelectorAll('th,td,label')].filter(e=>visible(e)&&wanted.includes(norm(label(e))));
   const candidates=matches.map(e=>e.tagName==='LABEL'&&e.htmlFor?document.getElementById(e.htmlFor)?.closest('td')||document.getElementById(e.htmlFor)?.parentElement:e.nextElementSibling).filter(e=>e&&controls(e).length);
   return single(candidates,String(names));
  };
  const known={제품명:'mdlStszEnglNmPrlst',한글명:'mdlStszKoreNmPrlst',수량:'dclrQtyPrlst',순중량kg:'mdlStszNtwgPrlst',금액USD:'mdlStszAmtPrlst',제조일자:'circPridStrtDtPrlst',소비기한:'circPridEndDtPrlst',신청인전화:'aplcTelno',신청인휴대폰:'aplcCralTelno',수입화주사업자번호:'impOwrBrno',선적일:'shpmDt',반입일:'inscBrngDt'};
  const field=(name,scope)=>{if(known[name]&&id(known[name]))return id(known[name]);return single(controls(cell(name,scope?section(scope):document)).filter(e=>!['radio','checkbox','button','submit','file'].includes(e.type)),String(name));};
  const set=(e,value)=>{
   if(!e||!visible(e)||e.readOnly||e.disabled)stop('편집 가능한 입력칸이 아닙니다: '+(e?.id||''));
   let v=String(value);if(e instanceof HTMLSelectElement)v=single([...e.options].filter(o=>!o.disabled&&(o.value===v||norm(o.text)===norm(v))),v+' 선택지').value;
   if(e.maxLength>=0&&v.length>e.maxLength)stop('입력 가능한 길이를 넘습니다.');if(e.value===v)return;
   const proto=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
   Object.getOwnPropertyDescriptor(proto,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));if(e.value!==v)stop('입력값을 유지하지 못했습니다.');
  };
  const sameValue=(e,v)=>e instanceof HTMLSelectElement?e.value===String(v)||norm(e.selectedOptions[0]?.text)===norm(v):String(e.value)===String(v);
  const guard=()=>{
   const s=window.__visionNewBound;
   if(!s||s.session!==q.session||s.number!==id('reqRqstNo3')||JSON.stringify(app())!==JSON.stringify(q.application))stop('대상 신청서가 바뀌었습니다.');
   for(const [suffix,expected]of [['impOwrBrno',q.identity?.importer],['mnfcCoPermDclrNo',q.identity?.manufacturer]]){const value=id(suffix)?.value;if(value&&expected&&norm(value).replace(/-/g,'')!==norm(expected).replace(/-/g,''))stop('화주 또는 제조업소가 이번 건과 다릅니다.');}
  };
  const ledger=()=>{window.__visionNewOps??={};return window.__visionNewOps;};
  const clickOnce=(key,e)=>{guard();if(ledger()[key])stop('이미 요청한 동작입니다: '+key);ledger()[key]={at:Date.now()};e.click();};
  const tableDefs={items:{suffix:'prlstTbl',headers:['화물관리번호','총수량','순중량','과세가격']},types:{headers:['품목코드','품목명','이력번호']},labels:{suffix:'koreIndcMatrTbl',headers:['표시사항','표시사항명칭','표시사항내용']},processes:{suffix:'mnfcProgTbl',headers:['분류코드','분류명칭']},ingredients:{suffix:'mnigTbl',headers:['순번','상위순번','성분코드','배합비율']},attachments:{suffix:'attachTbl'}};
  const table=kind=>{
   const d=tableDefs[kind];if(!d)stop('지원하지 않는 표입니다.');if(d.suffix&&id(d.suffix))return id(d.suffix);
   return single([...document.querySelectorAll('table')].filter(t=>d.headers.every(h=>[...t.querySelectorAll('th')].some(e=>norm(label(e))===norm(h)))),kind+' 표');
  };
  const rows=kind=>[...table(kind).querySelectorAll('tbody tr')].filter(r=>r.cells.length>1&&!r.querySelector('th'));
  const columns=kind=>[...table(kind).querySelectorAll('thead tr:last-child th')].map(e=>norm(label(e)));
  const col=(kind,r,name)=>{let heads=columns(kind);if(!heads.length)heads=[...table(kind).querySelectorAll('th')].map(e=>norm(label(e)));const i=heads.indexOf(norm(name));if(i<0||!r.cells[i])stop(kind+'의 '+name+' 열이 없습니다.');return r.cells[i];};
  const gridRows=kind=>rows(kind).filter(r=>controls(r).some(e=>!['checkbox','radio','hidden'].includes(e.type)));
  const around=(kind,names)=>{
   let root=table(kind).parentElement;while(root&&root!==document.body){const a=buttons(root).filter(e=>(Array.isArray(names)?names:[names]).some(n=>norm(n)===norm(text(e)||e.value)));if(a.length===1)return a[0];if(a.length>1)break;root=root.parentElement;}return button(names);
  };
  const searchButton=root=>single(buttons(root).filter(e=>!norm(text(e))||['검색','조회'].includes(norm(text(e)))||/검색|조회/.test(e.title||e.getAttribute('aria-label')||'')),'조회 버튼');
  const itemRows=()=>{
   const t=table('items');return [...t.querySelectorAll('input[type=radio]')].map(radio=>{const a=radio.closest('tr'),b=a.nextElementSibling;if(a.cells.length<5||!b)stop('품목 목록 행 구조가 다릅니다.');return {id:get(a.cells[0]),cargo:get(a.cells[1]).replace(/[\s-]/g,''),quantity:num(get(a.cells[2])),weight:num(get(a.cells[3]).replace(/\s*kg$/i,'')),amount:num(get(a.cells[4]).replace(/\s*\(US\$\)$/i,'')),product:get(b.cells[0]),korean:get(b.cells[1]),manufactured:get(b.cells[2]).split('~')[0].trim(),expiry:get(b.cells[2]).split('~').pop().trim()};});
  };
  const ingredientRows=()=>rows('ingredients').filter(r=>r.cells.length>=8).map(r=>({row:r,sequence:get(col('ingredients',r,'순번')).trim(),parent:get(col('ingredients',r,'상위순번')).trim(),kind:get(col('ingredients',r,'구분')).trim(),code:get(col('ingredients',r,'성분코드')).trim(),name:get(col('ingredients',r,'성분명')).trim(),ratio:get(col('ingredients',r,'배합비율')).trim()}));
  const lookupCell=()=>{
   if(q.grid){const r=q.grid==='ingredients'?ingredientRows().find(r=>r.sequence===q.sequence)?.row:gridRows(q.grid)[q.index];if(!r)stop('조회 대상 행이 없습니다.');const name=q.detail?'품목유형':q.grid==='types'?'품목코드':'성분명';return col(q.grid,r,name);}
   if(q.suffix&&id(q.suffix))return id(q.suffix).closest('td');
   return cell(q.label,q.section?section(q.section):document);
  };
  const openerGuard=()=>{
   const op=window.opener;if(!op||op.closed||op.location.origin!==location.origin)stop('조회창의 원래 신청서를 확인하지 못했습니다.');
   if(op.document.documentElement.dataset.visionNewSession!==q.session||['reqRqstNo1','reqRqstNo2','reqRqstNo3'].some((k,i)=>op.document.getElementById(p+k)?.value.trim()!==q.application[i]))stop('조회 대상 신청서가 바뀌었습니다.');
   const bound=op.__visionNewBound;if(!bound||bound.session!==q.session||bound.number!==op.document.getElementById(p+'reqRqstNo3'))stop('조회 대상 폼이 교체됐습니다.');
   const marker=op.document.documentElement.dataset.visionLookup;if(marker!==q.lookupKey||!q.process&&!op.__visionLookupCell?.isConnected)stop('조회 대상 입력칸이 바뀌었습니다.');
   const binding=op.__visionLookupBinding,c=op.__visionLookupCell;if(!binding||binding.session!==q.session)stop('조회 연결 기록이 없습니다.');
   if(c&&(c.closest('tr')?.sectionRowIndex!==binding.rowIndex||JSON.stringify([...c.querySelectorAll('input,select,textarea')].map(e=>[e.id,e.value]))!==binding.values))stop('조회하는 동안 대상 행이 바뀌었습니다.');
   if(JSON.stringify(['impOwrBrno','mnfcCoPermDclrNo'].map(k=>op.document.getElementById(p+k)?.value||''))!==binding.identity)stop('조회하는 동안 화주·제조업소가 바뀌었습니다.');
  };
  if(q.action==='navigate'){
   if(q.readOnly)return {done:!!id('reqRqstNo3')};
   if(id('reqRqstNo3'))return {done:true};const form=buttons().filter(e=>norm(text(e))===norm('수입식품 등의 수입신고서'));
   if(form.length===1){form[0].click();return {done:false};}button('신청서작성').click();return {done:false};
  }
  if(q.action==='bind'){
   if(!id('reqRqstNo3'))return {waiting:true};
   if(window.__visionNewBound?.session===q.session&&window.__visionNewBound.number===id('reqRqstNo3'))return {application:app()};
   if(id('reqRqstNo3').value||id('impOwrBrno')?.value||table('items').querySelector('input[type=radio]'))stop('새로 연 빈 신청서를 선택해주세요.');
   window.__visionNewBound={session:q.session,number:id('reqRqstNo3')};document.documentElement.dataset.visionNewSession=q.session;return {application:app()};
  }
  if(q.action==='popup_probe'){openerGuard();const title=q.cargo?'화물관리번호조회':q.process?'식약제조가공공정조회':null;if(title&&!norm(document.body.innerText).includes(title))stop('조회창 종류가 다릅니다.');return {ready:document.readyState==='complete',path:location.pathname};}
  if(q.action==='popup_query'){
   openerGuard();
   if(q.cargo){
    if(location.pathname!=='/csp/myc/comn/ComnCdCtr/openMYC0801008Q.do')stop('화물 조회 주소가 다릅니다.');
    const mapping=document.getElementById('MYC0801008Q_reqForm')?.value||'';if(!mapping.includes(p+'cargMtNoPrlst')||!mapping.includes(p+'blNoCn'))stop('품목 화물 조회창이 아닙니다.');
    set(document.getElementById('MYC0801008Q_qryTp'),'M B/L - H B/L');set(document.getElementById('MYC0801008Q_mblNo'),'');set(document.getElementById('MYC0801008Q_hblNo'),q.cargo.HBL);set(document.getElementById('MYC0801008Q_year'),q.cargo.조회연도+'년');
   }else for(const [names,value]of q.fields)set(field(names),value);
   const tables=q.cargo?[document.getElementById('MYC0801008Q_result')]:[...document.querySelectorAll('table')].filter(t=>visible(t)&&t.querySelector('thead')&&t.querySelector('tbody'));
   const t=single(tables,'조회 결과');window.__visionNewQuery={key:q.lookupKey,changed:false,at:0,selected:false,fields:q.fields,cargo:q.cargo};window.__visionNewObserver?.disconnect();window.__visionNewObserver=new MutationObserver(()=>{window.__visionNewQuery.changed=true;window.__visionNewQuery.at=Date.now();});window.__visionNewObserver.observe(t.parentElement,{subtree:true,childList:true,characterData:true});button('조회').click();return {queried:true};
  }
  if(q.action==='popup_choose'){
   openerGuard();const s=window.__visionNewQuery;if(!s||s.key!==q.lookupKey)stop('이 작업의 조회 기록이 없습니다.');if(!s.changed||Date.now()-s.at<400)return {waiting:true};if(s.selected)stop('이미 선택한 조회 결과입니다.');
   let links;if(q.cargo){
    const c=q.cargo;if(document.getElementById('MYC0801008Q_hblNo')?.value!==c.HBL||document.getElementById('MYC0801008Q_year')?.value!==c.조회연도)stop('화물 조회조건이 달라졌습니다.');
    const rs=[...document.querySelectorAll('#MYC0801008Q_result tbody tr')];if(rs.length!==1||rs[0].cells.length!==7)stop('화물 결과가 정확히 한 건이 아닙니다.');
    if(norm(get(rs[0].cells[2]))!==norm(c.MBL+' - '+c.HBL))stop('M B/L·H B/L이 다릅니다.');links=[...rs[0].cells[1].querySelectorAll('a')].filter(e=>norm(text(e)).replace(/-/g,'')===c.화물관리번호);
   }else{
    for(const [names,value]of q.fields)if(!sameValue(field(names),value))stop('조회조건이 변경됐습니다.');
    links=[...document.querySelectorAll('tbody a')].filter(e=>visible(e)&&(q.unit?[...e.closest('tr').cells].some(c=>norm(text(c))===norm(q.code)):norm(text(e))===norm(q.code)));
   }
   if(!links.length)return {waiting:true};const link=single(links,'일치 코드');if(q.name&&!norm(text(link.closest('tr'))).includes(norm(q.name)))stop('코드 명칭이 이번 자료와 다릅니다.');
   s.selected=true;openerGuard();link.click();return {selected:true};
  }
  if(q.action==='process_choose'){
   openerGuard();if(!location.pathname.endsWith('/openCSW0302013Q.do'))stop('제조공정 조회창이 아닙니다.');
   if(window.__visionProcessSelected===q.lookupKey)stop('공정을 이미 선택했습니다.');
   const matches=q.codes.map(code=>button(code));window.__visionProcessSelected=q.lookupKey;for(const e of matches)e.click();button('확인').click();return {selected:true};
  }
  guard();
  if(q.action==='category_guard'){if(app()[2]||id('impOwrBrno')?.value||itemRows().length)stop('입력된 신청서의 제품구분은 변경하지 않습니다.');return {done:true};}
  if(q.action==='guard')return {done:true};
  if(q.action==='process_editor'){const input=id('fdmcProcProgCd');const value=input?.value||get(cell('분류코드'));return {done:value.replace(/-$/,'')===q.codes.join('-')};}
  if(q.action==='snapshot'){
   const values=[...document.querySelectorAll('input,select,textarea')].filter(e=>e.type!=='password'&&e.type!=='file'&&!/token|csrf|cert|secret/i.test(e.id+e.name)).map(e=>[e.id,e.name,e.value,e.checked??null]);
   const grids=['items','types','labels','processes','ingredients'].map(k=>[k,table(k).textContent]);
   const files=[];for(const [slot,row]of [...table('attachments').rows].entries()){const f=row.querySelector('input[type=file]')?.files[0];if(f){const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await f.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');files.push([slot,f.name,f.size,sha]);}}guard();return {snapshot:JSON.stringify({application:app(),values,grids,files})};
  }
  if(q.action==='tab'){
   const names={common:'공통사항',items:'품목사항',types:'복합구성제품',labels:'한글표시사항정보',processes:'제조/가공공정',ingredients:'성분/재질',attachments:'첨부파일'};
   const ready=q.tab==='common'?visible(id('aplcTelno')):visible(table(q.tab));if(!ready&&!q.readOnly)button(names[q.tab]).click();return {done:ready};
  }
  if(q.action==='fields_read'||q.action==='fields_write'){
   const resolved=q.fields.map(f=>({f,e:field(f.label,f.section)}));
   if(q.action==='fields_write')for(const {e,f}of resolved){guard();set(e,f.value);}
   return {done:resolved.every(({e,f})=>sameValue(e,f.value)),proof:resolved.map(({e})=>[e.id,e.value])};
  }
  if(q.action==='choices_read'||q.action==='choices_write'){
   const results=[];for(const [name,expected]of Object.entries(q.values)){
    const c=cell(name,section('신고일반'));const inputs=controls(c).filter(e=>['checkbox','radio'].includes(e.type));if(!inputs.length)stop(name+' 선택칸이 없습니다.');
    const values=Array.isArray(expected)?expected:[expected];const candidates=inputs.map(e=>({e,t:norm(document.querySelector('label[for="'+CSS.escape(e.id)+'"]')?.textContent||e.nextSibling?.textContent||'')}));
    const wanted=values.map(v=>single(candidates.filter(c=>c.t===norm(v)),name+' '+v).e);
    if(q.action==='choices_write')for(const {e}of candidates){const checked=wanted.includes(e);if(e.checked!==checked){if(e.type==='radio'&&!checked)continue;e.click();}}
    results.push(candidates.every(({e})=>e.checked===wanted.includes(e)));
   }return {done:results.every(Boolean)};
  }
  if(q.action==='lookup_read'){
   if(q.grid==='ingredients'&&!q.detail){const r=ingredientRows().find(r=>r.sequence===q.sequence);if(!r)stop('조회 대상 성분이 없습니다.');return {done:r.code===q.code&&(!q.name||norm(r.name)===norm(q.name)),proof:r.code};}
   if(q.cargo){const value=['cargMtNoPrlst1','cargMtNoPrlst2','cargMtNoPrlst3'].map(k=>id(k)?.value||'').join('');return {done:value===q.cargo.화물관리번호&&id('blNoCn')?.value===q.cargo.HBL,proof:value};}
   const c=lookupCell();return {done:controls(c).some(e=>norm(e.value)===norm(q.code)),proof:controls(c).map(e=>[e.id,e.value])};
  }
  if(q.action==='lookup_open'){
   const c=q.process?null:lookupCell();window.__visionLookupCell=c;window.__visionLookupBinding={session:q.session,rowIndex:c?.closest('tr')?.sectionRowIndex,values:c?JSON.stringify([...c.querySelectorAll('input,select,textarea')].map(e=>[e.id,e.value])):null,identity:JSON.stringify(['impOwrBrno','mnfcCoPermDclrNo'].map(k=>id(k)?.value||''))};document.documentElement.dataset.visionLookup=q.lookupKey;
   const b=q.process?button('일괄검색'):searchButton(c);b.click();return {opened:true};
  }
  if(q.action==='items_read'){
   const actual=itemRows(),wanted=q.items;const same=(a,b)=>a.product===b.제품명&&a.korean===b.한글명&&a.cargo===b.화물관리번호&&a.quantity===num(b.수량)&&a.weight===num(b.순중량kg)&&a.amount===num(b.금액USD)&&a.expiry===b.소비기한&&(!b.제조일자||a.manufactured===b.제조일자);
   if(actual.length>wanted.length||actual.some((a,i)=>!same(a,wanted[i])))stop('품목 목록이 이번 건의 순서·값과 다릅니다.');
   return {done:actual.length>=(q.minimum??wanted.length),proof:actual};
  }
  if(q.action==='item_add'){
   if(['cargMtNoPrlst1','cargMtNoPrlst2','cargMtNoPrlst3'].map(k=>id(k)?.value||'').join('')!==q.item.화물관리번호||id('blNoCn')?.value!==q.item.HBL)stop('추가 전 화물번호·H B/L이 다릅니다.');
   if(itemRows().length!==q.count)stop('품목 수가 변경됐습니다.');
   const r=q.item;if(r.제조일자&&!sameValue(field('제조일자'),r.제조일자))stop('추가 전 제조일자가 다릅니다.');for(const [name,value]of Object.entries({제품명:r.제품명,한글명:r.한글명,수량:r.수량,순중량kg:r.순중량kg,금액USD:r.금액USD,소비기한:r.소비기한}))if(!sameValue(field(name),value))stop('추가 전 품목값이 다릅니다: '+name);
   const c=cell('대표품목여부');const radios=controls(c).filter(e=>e.type==='radio');const wanted=q.representative?'예':'아니오';const rdo=single(radios.filter(e=>norm(document.querySelector('label[for="'+CSS.escape(e.id)+'"]')?.textContent||e.nextSibling?.textContent)===norm(wanted)),'대표품목');if(!rdo.checked)rdo.click();
   clickOnce(q.key,around('items','추가'));return {requested:true};
  }
  if(q.action==='grid_read'){
   if(q.grid==='processes'){const actual=rows('processes').map(r=>get(col('processes',r,'분류코드'))).filter(Boolean);return {done:JSON.stringify(actual)===JSON.stringify(q.codes),proof:actual};}
   const rs=gridRows(q.grid);return {done:q.minimum!==undefined?rs.length>=q.minimum:rs.length===q.count,proof:rs.map(r=>controls(r).map(e=>[e.value,e.checked??null]))};
  }
  if(q.action==='grid_add'){const rs=gridRows(q.grid);if(rs.length!==q.count)stop('행 수가 변경됐습니다.');clickOnce(q.key,around(q.grid,'행추가'));return {requested:true};}
  if(q.action==='label_read'||q.action==='label_write'){
   const r=gridRows('labels')[q.index];if(!r)stop('표시사항 행이 없습니다.');const inputs=[single(controls(col('labels',r,'표시사항')),'표시사항 선택'),single(controls(col('labels',r,'표시사항명칭')),'표시사항 명칭'),single(controls(col('labels',r,'표시사항내용')),'표시사항 내용')];
   if(q.action==='label_write')inputs.forEach((e,i)=>set(e,q.values[i]));return {done:inputs.every((e,i)=>sameValue(e,q.values[i]))};
  }
  if(q.action==='process_add'){clickOnce(q.key,around('processes','추가'));return {requested:true};}
  if(q.action==='ingredients_read'){return {rows:ingredientRows().map(({row,...data})=>data)};}
  if(q.action==='ingredient_add'){
   const rs=ingredientRows();if(rs.length!==q.count)stop('성분 행 수가 변경됐습니다.');
   let b;if(q.parent){const parent=single(rs.filter(r=>r.sequence===q.parent),'상위 성분');b=button(q.kind==='부혼합'?'부혼합성분추가':'부성분추가',parent.row);}else b=button(q.kind==='혼합'?'혼합성분등록':'주성분등록');clickOnce(q.key,b);return {requested:true};
  }
  if(q.action==='ingredient_detail_read'||q.action==='ingredient_detail_write'){
   const r=single(ingredientRows().filter(r=>r.sequence===q.sequence),'성분 행');if(r.code!==q.code)stop('성분 코드가 다릅니다.');const input=single(controls(col('ingredients',r.row,'제품구분')),'제품구분');if(q.action==='ingredient_detail_write')set(input,q.value);return {done:sameValue(input,q.value)};
  }
  if(q.action==='ratio_read'||q.action==='ratio_write'){
   const r=single(ingredientRows().filter(r=>r.sequence===q.sequence),'성분 행');if(r.code!==q.code||r.parent!==(q.parent||''))stop('성분 코드 또는 상위 성분이 다릅니다.');
   const input=single(controls(col('ingredients',r.row,'배합비율')),'배합비율');if(q.action==='ratio_write')set(input,q.value);return {done:num(input.value)===num(q.value)};
  }
  if(q.action==='notice'){
   const title=q.kind==='label'?'한글표시사항 작성 안내':'첨부파일 안내';const heads=[...document.querySelectorAll('span,strong,h2,h3,div')].filter(e=>visible(e)&&norm(text(e))===norm(title));if(!heads.length)return {done:true};
   const roots=[];for(const h of heads){let n=h.parentElement;while(n&&n!==document.body){if(buttons(n).filter(e=>norm(text(e))==='확인').length===1&&norm(text(n)).includes('오늘하루그만보기')){roots.push(n);break;}n=n.parentElement;}}
   const root=single([...new Set(roots)],title);
   const compact=v=>String(v).normalize('NFKC').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s/g,'');
   const render=n=>{if(n.nodeType===Node.TEXT_NODE)return n.parentElement&&visible(n.parentElement)?n.textContent:'';if(n.nodeType!==Node.ELEMENT_NODE||!visible(n)||n.matches('script,style,option'))return '';if(n.matches('button,a,[role=button]')&&/^(close|닫기|[×✕✖xX])$/i.test(compact(text(n))))return '';if(n.matches('textarea'))return n.value;if(n.matches('input'))return ['button','submit'].includes(n.type)?n.value:'';return [...n.childNodes].map(render).join(' ');};
   const expected=q.kind==='label'?"수입신고서 불러오기 시 '제조일자', '소비기한', '생산연도' 등 일자 또는 영업자 소재지, 내용량 등 정보의 변경 사항이 있는 경우 현품 포장지 내용을 확인 후 다시 작성하여 신고하시기 바랍니다.":'사진파일, 각종 증명서류를 10번 항목에 10개까지 등록할 수 있도록 개선하였습니다. 가급적 각 항목에 맞는 구비서류(첨부파일)를 등록하여 주시기 바라며, 향후 항목에 맞지 않는 구비서류를 첨부하는 경우 식약처 수입 시스템 검증 과정에서 자동 반려될 수 있음을 알려드립니다.';
   const body=compact(render(root)),rest=body.replace(compact(title),'').replace(compact(expected),'').replace('오늘하루그만보기','').replace('확인','').replace(/닫기|[×✕✖xX]/g,'');
   if(!body.includes(compact(expected))||rest)stop('알려진 안내창과 문구가 다릅니다: '+render(root).slice(0,600));
   if(root.dataset.visionNoticeRequested)return {done:false};root.dataset.visionNoticeRequested='1';button('확인',root).click();return {done:!visible(root)};
  }
  if(q.action.startsWith('file_')){
   if(!(q.slot===0||Number.isInteger(q.slot)&&q.slot>=9&&q.slot<=18))stop('첨부 위치가 다릅니다.');const t=table('attachments'),r=t.rows[q.slot],input=r?.querySelector('input[type=file]');if(!input)stop('첨부 선택칸이 없습니다.');
   const hash=async f=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await f.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
   if(q.action==='file_read'){const f=input.files[0],method=r.querySelector('select')||t.rows[9]?.querySelector('select');return {done:!!f&&!!method&&sameValue(method,'파일첨부')&&f.name===q.meta.name&&f.size===q.meta.size&&await hash(f)===q.meta.sha256};}
   window.__visionNewFiles??={};
   if(q.action==='file_begin'){
    if(input.files.length||!/\.(png|jpe?g|bmp|gif|tiff?|pdf)$/i.test(q.meta.name)||q.meta.size<1||q.meta.size>5000000)stop('기존 파일·형식·크기를 확인해주세요.');
    set(r.querySelector('select')||t.rows[9]?.querySelector('select'),'파일첨부');window.__visionNewFiles[q.slot]={input,meta:q.meta,parts:[],size:0};return {ready:true};
   }
   const s=window.__visionNewFiles[q.slot];if(!s||s.input!==input)stop('첨부 연결이 바뀌었습니다.');
   if(q.action==='file_chunk'){if(s.size!==q.offset||q.data.length>180000)stop('첨부 전달 순서가 다릅니다.');const bytes=Uint8Array.from(atob(q.data),c=>c.charCodeAt(0));s.size+=bytes.length;if(s.size>s.meta.size)stop('첨부 크기 초과');s.parts.push(bytes);return {received:true};}
   if(q.action!=='file_commit'||s.size!==s.meta.size||input.files.length)stop('첨부 상태가 변경됐습니다.');
   const f=new File(s.parts,s.meta.name,{type:s.meta.type,lastModified:s.meta.lastModified});if(await hash(f)!==s.meta.sha256)stop('원본 첨부와 다릅니다.');guard();if(!input.isConnected||input.disabled||!visible(input))stop('첨부칸이 바뀌었습니다.');const dt=new DataTransfer();dt.items.add(f);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));delete window.__visionNewFiles[q.slot];return {requested:true};
  }
  if(q.action==='final_click'){if(!['오류검증','임시저장','전송'].includes(q.label))stop('알 수 없는 최종 동작');clickOnce(q.key,button(q.label));return {requested:true};}
  stop('지원하지 않는 동작: '+q.action);
 }catch(e){return {status:'blocked',reason:e.message};}
}
