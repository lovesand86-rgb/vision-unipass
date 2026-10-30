import {COMPANY,OWNER,SHIPMENT,CARGO,AMOUNTS,LIBRARY_KEY,readLibrary,changeLibrary,makeOwner,upsertJob,useProduct,labelRule,applyLabelDates,parseLibrary} from './intake-library.js';
import {runNewIntake} from './intake-runner.js';
import {templateBase64,guide} from './intake-assets.js';
import {intakeDOM} from './intake-dom.js';
import {BASIC,TABLES,blankJob,fromTables,validateIntake,compileTargets,searchPeriods,applyPrevious,decimal} from './intake-model.js';
import {readWorkbook} from './workbook.js';
import {draftStore} from './intake-store.js';
import {chooseUnipassTab,continueInTool,guardToolNavigation} from './assist-navigation.js';
import {putAttachments} from './attachment-handoff.js';
import {declarationStep} from './search-copy.js';
const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
let activeStep=0;
function setStep(n){activeStep=n;$('data-step').hidden=n!==0;$('photos-step').hidden=n!==1;$('step-data').classList.toggle('active',n===0);$('step-photos').classList.toggle('active',n===1);}
let job=blankJob(new URL(location.href).searchParams.get('kind')==='new'?'new':'history'),busy=false,starting=false,files=[],selected=new Map(),role='label',prior=null,discovery=null,objectURLs=[];
let diagnostics=null,library=await readLibrary(),ownerId='',draftTimer,lastDraft=null;

const logs=[],roles={label:'한글표시사항',front:'제품 전면',other:'기타 사진·서류'};
const status=t=>$('status').textContent=t,log=t=>{logs.push({at:new Date().toISOString(),message:t});$('log').append(el('li',t));status(t);};
const settingsKey='visionIntakeDefaultsV1';
let defaults=library.company;
function applyDefaults(){for(const [k,v]of Object.entries(defaults))if(BASIC.includes(k)&&!job.basic[k])job.basic[k]=v;}
applyDefaults();
function field(label,value,change){const l=el('label',label),input=el('input');input.value=value||'';input.setAttribute('aria-label',label);if(['선적일','제조일자','소비기한','반입일'].includes(label))input.type='date';input.onchange=()=>{change(input.value.trim());scheduleDraft();};l.append(input);return l;}
function render(){
 renderPickers();$('mode').textContent=job.kind==='new'?'신규 입력':'실적 기반 입력';$('start').textContent=job.kind==='new'?'신규 입력 시작 · 이어하기':'입력 시작';$('find-previous').hidden=job.kind!=='history';
 for(const id of ['basic-primary','basic-more','shipment-more','shipment-cargo','product-items','items'])$(id).replaceChildren();
 $('basic-primary').append(field('선적일',job.basic.선적일,v=>job.basic.선적일=v));
 for(const key of CARGO.filter(k=>k!=='조회연도'))$('basic-primary').append(field(key,job.items[0]?.[key],v=>{for(const r of job.items)r[key]=v;if(key==='화물관리번호'&&/^\d{2}[A-Z0-9]{9}\d{8}$/.test(v))for(const r of job.items)r.조회연도='20'+v.slice(0,2);}));
 $('shipment-more').append(field('조회연도',job.items[0]?.조회연도,v=>{for(const r of job.items)r.조회연도=v;}));
 for(const key of [...SHIPMENT.filter(k=>k!=='선적일'),...COMPANY.filter(k=>!k.startsWith('대행업체')),'보관창고코드','검사기관코드','신고기관'])$('shipment-more').append(field(key,job.basic[key],v=>job.basic[key]=v));
 for(const key of BASIC.filter(k=>!SHIPMENT.includes(k)&&!COMPANY.includes(k)&&!['보관창고코드','검사기관코드','신고기관'].includes(k)))$('basic-more').append(field(key,job.basic[key],v=>{job.basic[key]=v;discovery=prior=null;}));
 $('previous-title').textContent=discovery?discovery.date+' · '+discovery.application:'';
 job.items.forEach((item,index)=>{
  const section=el('div',undefined,'item'),title=item.한글명||item.제품명||'등록할 제품';section.append(el('h3',title+(item.수량단위?' · '+item.수량단위:'')));
  const previous=previousFor(index),grid=el('div',undefined,'fields-grid shipment-values');
  for(const key of [...AMOUNTS,'제조일자','소비기한']){const f=field(key,item[key],v=>{item[key]=v;renderLabels();});
   if(previous&&AMOUNTS.includes(key)){const b=el('button','저장한 '+previous[key]+' 적용','button small');b.onclick=()=>{try{job.items[index]=applyPrevious(item,previous,[key]);render();scheduleDraft();}catch(e){status(e.message);}};f.append(b);}grid.append(f);
  }section.append(grid);if(previous){const b=el('button','수량·중량·가격 모두 적용','button small');b.onclick=()=>{job.items[index]=applyPrevious(item,previous);render();scheduleDraft();};section.append(b);}$('items').append(section);
  const edit=el('div',undefined,'item'),head=el('div',undefined,'item-header');head.append(el('h3','품목·규격 '+(index+1)));if(job.items.length>1){const remove=el('button','삭제','button small');remove.onclick=()=>{job.items.splice(index,1);discovery=prior=null;render();scheduleDraft();};head.append(remove);}edit.append(head);
  const controls=el('div',undefined,'fields-grid');for(const key of ['제품명','한글명','수량단위','대표품목','출처'])controls.append(field(key,item[key],v=>{item[key]=v;prior=discovery=null;}));edit.append(controls);$('product-items').append(edit);
 });
 $('tables').replaceChildren();for(const [name,key]of Object.entries({제품유형:'types',표시사항:'labels',제조공정:'processes',성분:'ingredients'})){
  const details=el('details'),summary=el('summary',name+' · '+job[key].length+'행'),wrap=el('div',undefined,'table-scroll'),table=el('table'),header=el('tr');for(const col of TABLES[name])header.append(el('th',col));if(key==='labels')header.append(el('th','다음 건에 사용할 내용'));table.append(header);
  job[key].forEach((row,i)=>{const tr=el('tr');for(const col of TABLES[name]){const td=el('td'),input=el('input');input.value=row[col]||'';input.setAttribute('aria-label',name+' '+(i+1)+' '+col);input.onchange=()=>{row[col]=input.value.trim();renderLabels();scheduleDraft();};td.append(input);tr.append(td);}
   if(key==='labels'){const td=el('td'),select=el('select');for(const [value,title]of Object.entries({fixed:'고정 내용 저장',manufactured:'이번 제조일자',expiry:'이번 소비기한',manual:'매번 직접 입력'}))select.add(new Option(title,value));select.value=labelRule(row);select.setAttribute('aria-label',`표시사항 ${i+1} 재사용`);select.onchange=()=>{row.reuse=select.value;renderLabels();scheduleDraft();};td.append(select);tr.append(td);}
   const td=el('td'),del=el('button','삭제');del.onclick=()=>{job[key].splice(i,1);render();scheduleDraft();};td.append(del);tr.append(td);table.append(tr);
  });
  const add=el('button','＋ 행 추가','button small');add.onclick=()=>{job[key].push(Object.fromEntries(TABLES[name].map(k=>[k,''])));render();scheduleDraft();};wrap.append(table);details.append(summary,wrap,add);$('tables').append(details);
 }
 renderLabels();renderPhotos();
}
function previousFor(index){
 if(prior&&index===0)return prior;const p=library.products.find(p=>p.id===job.library?.productId);
 if(!p||p.ownerId!==String(job.basic.수입화주사업자번호).replace(/[\s-]/g,'')||p.basic.제조업소등록번호!==job.basic.제조업소등록번호)return null;
 const previous=p.previous?.[index];try{if(previous)applyPrevious(job.items[index],previous);return previous;}catch{return null;}
}
function renderLabels(){
 applyLabelDates(job);$('routine-labels').replaceChildren();
 if(job.kind!=='new')return;
 const rows=job.labels.filter(r=>labelRule(r)!=='fixed');if(!rows.length)return;
 const area=el('details');area.open=rows.some(r=>labelRule(r)==='manual'&&!r.내용);area.append(el('summary','이번 날짜·표시사항 '+rows.length+'개'));
 for(const row of rows){const rule=labelRule(row);if(rule==='manual')area.append(field(row.명칭||'표시사항 내용',row.내용,v=>{row.내용=v;}));else{area.append(el('p',(row.명칭||row.표시사항코드)+': '+(row.내용||'품목별 날짜가 다르거나 비어 있습니다.'),'muted'));if(!row.내용){const b=el('button','직접 입력으로 변경','button small');b.onclick=()=>{row.reuse='manual';renderLabels();scheduleDraft();};area.append(b);}}}
 $('routine-labels').append(area);
}
function entries(){let n=10;return [...selected].sort((a,b)=>['label','front','other'].indexOf(a[1])-['label','front','other'].indexOf(b[1])).map(([index,r])=>({slot:r==='label'?0:r==='front'?9:n++,file:files[index]}));}
function renderPhotos(){
 for(const url of objectURLs)URL.revokeObjectURL(url);objectURLs=[];$('roles').replaceChildren();
 for(const [r,title]of Object.entries(roles)){const b=el('button',title,'button '+(r===role?'active':''));b.onclick=()=>{role=r;renderPhotos();};$('roles').append(b);}
 $('photo-role-hint').textContent=roles[role]+(role==='other'?'는 여러 개 선택할 수 있습니다.':' 한 장을 누르면 다음 단계로 넘어갑니다.');
 $('gallery').replaceChildren();files.forEach((file,index)=>{
  const b=el('button',undefined,'file-card');b.setAttribute('aria-pressed',String(selected.has(index)));b.setAttribute('aria-label',file.name);
  if(/\.(png|jpe?g|bmp|gif)$/i.test(file.name)){const img=el('img');img.alt=file.name;img.loading='lazy';img.src=URL.createObjectURL(file);objectURLs.push(img.src);b.append(img);}else b.append(el('div',/\.pdf$/i.test(file.name)?'PDF':'이미지','file-icon'));
  b.append(el('span',file.name),el('b',selected.has(index)?roles[selected.get(index)]:'선택'));b.onclick=()=>{
   if(selected.has(index))selected.delete(index);else{if(role==='front'&&/\.pdf$/i.test(file.name)){status('제품 전면에는 사진파일을 선택해주세요. PDF는 기타 서류로 선택할 수 있습니다.');return;}if(file.size>5000000||!file.size){status('첨부는 파일당 5MB 이하입니다.');return;}if(role==='other'&&[...selected.values()].filter(v=>v==='other').length>=9){status('기타는 최대 9개입니다.');return;}if(role!=='other')for(const [k,v]of selected)if(v===role)selected.delete(k);selected.set(index,role);if(role==='label')role='front';else if(role==='front')role='other';}renderPhotos();scheduleDraft();};$('gallery').append(b);
 });
 $('photo-summary').textContent=Object.entries(roles).map(([k,v])=>v+' '+[...selected.values()].filter(r=>r===k).length).join(' · ');
 $('selected-files').replaceChildren();const others=[...selected].filter(([,r])=>r==='other');others.forEach(([index],i)=>{const row=el('div');row.append(el('span',(i+1)+'. '+files[index].name));for(const delta of [-1,1]){const b=el('button',delta<0?'↑':'↓','button small');b.disabled=i+delta<0||i+delta>=others.length;b.onclick=()=>{[others[i],others[i+delta]]=[others[i+delta],others[i]];selected=new Map([...selected].filter(([,r])=>r!=='other').concat(others));renderPhotos();scheduleDraft();};row.append(b);}$('selected-files').append(row);});
}
function on(id,fn,event='click'){$(id).addEventListener(event,async()=>{if(busy||starting)return;try{await fn();}catch(e){log(e.message);}});}
async function withBusy(fn){if(busy)return;busy=true;document.querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=true);try{await fn();}finally{busy=false;document.querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=false);}}
const download=(blob,name)=>{const a=el('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
on('template',()=>download(new Blob([Uint8Array.from(atob(templateBase64),c=>c.charCodeAt(0))],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'비전-입력양식.xlsx'));
on('guide',()=>download(new Blob([guide],{type:'text/plain;charset=utf-8'}),'GPT-자료정리지침.txt'));
on('inspect',async()=>{const tab=await chooseUnipassTab();if(!tab)return;const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:intakeDOM,args:[{action:'diagnostics'}]});diagnostics=result.find(r=>r.frameId===0)?.result;status('입력칸 이름과 버튼 구조를 읽었습니다. 기록 저장으로 내보낼 수 있습니다. 입력값은 수집하지 않았습니다.');});
on('step-data',()=>setStep(0));on('step-photos',()=>setStep(1));on('extra-picker',()=>$('extra-files').click());
on('folder',()=>$('folder-input').click());on('excel',()=>$('excel-input').click());
async function importFile(file){const next=fromTables(await readWorkbook(file),job.kind);job=next;ownerId='';discovery=prior=null;applyDefaults();render();$('registration').open=true;scheduleDraft();const errors=validateIntake(job);status(errors.length?errors.join('\n'):'엑셀을 불러왔습니다. 사진을 선택하고 시작하세요.');}
on('excel-input',async()=>{if($('excel-input').files[0])await importFile($('excel-input').files[0]);},'change');
on('folder-input',async()=>{
 const all=[...$('folder-input').files];if(all.length>1000)throw Error('한 건의 폴더를 선택해주세요. 최대 1,000파일입니다.');
 files=all.filter(f=>/\.(png|jpe?g|bmp|gif|tiff?|pdf)$/i.test(f.name));selected.clear();role='label';discovery=prior=null;
 $('folder-name').textContent=(all[0]?.webkitRelativePath.split('/')[0]||'폴더')+' · 사진/PDF '+files.length+'개';
 const books=all.filter(f=>/\.xlsx$/i.test(f.name)&&!f.name.startsWith('~$'));$('workbooks').replaceChildren(new Option('읽을 엑셀 선택',''));$('workbooks').hidden=!books.length;
 for(const [i,f]of books.entries())$('workbooks').append(new Option(f.webkitRelativePath||f.name,String(i)));
 $('workbooks').onchange=()=>{if($('workbooks').value!=='')importFile(books[Number($('workbooks').value)]).catch(e=>status(e.message));};
 renderPhotos();scheduleDraft();status(books.length?'사진을 불러왔습니다. 엑셀을 사용할 때만 목록에서 선택하세요.':'사진을 불러왔습니다. 저장한 제품과 이번 선적 정보로 진행하세요.');
},'change');
on('extra-files',()=>{setStep(1);files.push(...[...$('extra-files').files].filter(f=>/\.(png|jpe?g|bmp|gif|tiff?|pdf)$/i.test(f.name)));renderPhotos();scheduleDraft();},'change');
on('add-item',()=>{job.items.push({품목ID:'P'+crypto.randomUUID().slice(0,8)});discovery=prior=null;render();scheduleDraft();});
on('settings',companyDialog);on('dialog-close',()=>$('dialog').close());
on('save',async()=>{await saveDraft();status('이 PC에 자료와 선택한 첨부를 저장했습니다.');});
on('resume',async()=>{
 const drafts=await draftStore('list');$('dialog-body').replaceChildren(el('h2','저장한 작업'));
 for(const d of drafts.sort((a,b)=>b.at-a.at)){const row=el('div',undefined,'toolbar'),b=el('button',d.job.basic.작업명||d.job.items[0]?.제품명||'작업','button');b.onclick=()=>{restoreDraft(d);$('dialog').close();};const del=el('button','삭제','button');del.onclick=async()=>{await draftStore('delete',d.id);row.remove();};row.append(b,del);$('dialog-body').append(row);}$('dialog').showModal();
});
async function invoke(tabId,action,searchJob,more={}){const frames=await chrome.scripting.executeScript({target:{tabId},func:declarationStep,args:[{action,job:searchJob,...more}]});const r=frames.find(f=>f.frameId===0)?.result;if(!r||r.status==='blocked')throw Error(r?.reason||'실적 화면 응답이 없습니다.');return r;}
async function discover(){
 const tab=await chooseUnipassTab();if(!tab)return;
 const item=job.items[0],b=job.basic;for(const value of [item?.제품명,b.수입화주명,b.수입화주사업자번호,b.제조업소명,b.제조업소등록번호])if(!value)throw Error('제품명·화주명/사업자번호·제조업소명/등록번호를 입력해주세요.');
 await withBusy(async()=>{
  const searchJob={format:'vision-unipass-search-copy',version:1,identity:{product_name:item.제품명,importer_name:b.수입화주명,importer_id:b.수입화주사업자번호,manufacturer_name:b.제조업소명,manufacturer_id:b.제조업소등록번호},source_application:'AUTO-26-A'};
  for(const period of searchPeriods()){
   log(period.from+' ~ '+period.to+' 동일 실적 검색');searchJob.search={...period,product_term:item.제품명,importer_term:b.수입화주명};const token=crypto.randomUUID();await invoke(tab.id,'search',searchJob,{token});
   let result;const until=Date.now()+20000;do{result=await invoke(tab.id,'candidates',searchJob,{token});if(result.status==='candidates')break;await new Promise(r=>setTimeout(r,350));}while(Date.now()<until);
   if(result?.status!=='candidates')throw Error('실적 조회 응답이 없습니다.');if(!result.candidates.length)continue;
   if(result.candidates.length>1&&result.candidates[0].date===result.candidates[1].date)throw Error('같은 날짜 실적이 여러 개입니다. 원문을 확인해서 사용할 실적을 선택해야 합니다.');
   discovery={...result.candidates[0],period,tabId:tab.id};$('previous-title').textContent=discovery.date+' · '+discovery.application;
   searchJob.source_application=discovery.application;
   const matched=await invoke(tab.id,'result',searchJob,{token});
   await invoke(tab.id,'open',searchJob,{token,signature:matched.signature});
   const deadline=Date.now()+15000;let original;
   while(Date.now()<deadline&&!original){
    const tabs=await chrome.tabs.query({url:'https://unipass.customs.go.kr/*'});
    for(const candidate of tabs){if(!candidate.url?.includes('/retrieveApfmOdv.do'))continue;try{original={tab:candidate,result:await invoke(candidate.id,'original',searchJob)};break;}catch{}}
    if(!original)await new Promise(r=>setTimeout(r,250));
   }
   if(!original)throw Error('실적 원문에서 화주·제조업소 등록번호를 확인하지 못했습니다.');
   prior=original.result.previous;discovery.searchJob=searchJob;discovery.token=token;
   render();log(prior?'원문의 동일 제품·등록번호와 이전 값을 읽었습니다. 필요한 값만 적용하세요.':'원문 등록번호를 확인했습니다. 이전 수량의 단위까지 읽지 못해 자동 적용은 표시하지 않습니다.');return;
  }throw Error('최근 3년에서 동일 실적을 찾지 못했습니다. 신규 입력 또는 이전 도구에서 기간을 지정해주세요.');
 });
}
on('find-previous',discover);
on('start',async()=>{
 if(starting)return;starting=true;try{
 applyLabelDates(job);const errors=validateIntake(job,{execution:true});if(errors.length){$('registration').open=!job.library;throw Error(errors.join('\n'));}
 await saveDraft();await rememberValues();
 if(job.kind==='history'){
  if(job.items.length!==1)throw Error('실적 기반 자동 입력은 현재 한 품목씩 진행합니다.');
  if(!discovery){await discover();if(!discovery)return;}
  await withBusy(async()=>{
   const targets=compileTargets(job,discovery.application,discovery.period),app=await chrome.tabs.getCurrent();
   const fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(targets.searchTarget))))].map(v=>v.toString(16).padStart(2,'0')).join('');
   const old=(await chrome.storage.local.get('visionCopyAttemptV1')).visionCopyAttemptV1;
   if(old&&['copy_requested','copy_unknown','copy_verified'].includes(old.stage)&&old.fingerprint!==fingerprint)throw Error('이전 복사 작업이 남아 있습니다. 기존 입력 도구의 다음 건 준비로 정리해주세요.');
   await chrome.storage.local.set({['visionIntakeRun:'+job.id]:{targets,appTab:app.id,at:Date.now()},...(!old||!['copy_requested','copy_unknown','copy_verified'].includes(old.stage)?{visionCopyAttemptV1:{fingerprint,token:discovery.token,listTab:discovery.tabId,source:discovery.application,stage:'original_requested',started:new Date().toISOString()}}:{})});
   const transfer=await putAttachments(entries(),{appTab:app.id,targetTab:app.id,jobKey:JSON.stringify(targets.searchTarget)});
   continueInTool('workflow.html?intake='+encodeURIComponent(job.id)+'&attachments='+encodeURIComponent(transfer)+'&preparedStart=1');
  });
 }else{
  const tab=await chooseUnipassTab();if(!tab)return;
  if(![...selected.values()].includes('front')||![...selected.values()].includes('label'))throw Error('시작 전에 한글표시 사진과 제품 전면 사진을 선택해주세요.');
  await withBusy(async()=>{await draftStore('save',{id:job.id,job,files,selected:[...selected],activeStep,at:Date.now()});
   try{await runNewIntake({job,tabId:tab.id,files:entries(),log,onState:status});}
   catch(e){
    diagnostics=[];for(const target of (await chrome.tabs.query({url:'https://unipass.customs.go.kr/*'})).filter(t=>t.id===tab.id||t.openerTabId===tab.id)){try{const frames=await chrome.scripting.executeScript({target:{tabId:target.id},func:intakeDOM,args:[{action:'diagnostics'}]});diagnostics.push(frames.find(r=>r.frameId===0)?.result);}catch{}}
    log('진행 기록을 보존했습니다. 원래 유니패스 탭에서 필요한 부분을 수정하고 이어하기를 누르세요.');throw e;}
  });
 }
 }finally{starting=false;}
});
on('export-log',()=>{const a=el('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({version:chrome.runtime.getManifest().version,job,logs,diagnostics},null,2)],{type:'application/json'}));a.download='vision-intake-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
function renderPickers(){
 $('save-current').hidden=!!job.library||!job.items[0]?.제품명;
 ownerId=job.library?.ownerId||ownerId;
 const owners=[...library.owners].sort((a,b)=>b.at-a.at);$('owner-select').replaceChildren(new Option('화주 선택',''));for(const o of owners)$('owner-select').add(new Option(o.basic.수입화주명,o.id));$('owner-select').value=ownerId;
 $('product-search').hidden=library.products.filter(p=>p.ownerId===ownerId).length<8;const term=$('product-search').value.trim().toLowerCase();$('product-select').replaceChildren(new Option('제품 선택',''));
 for(const p of library.products.filter(p=>p.ownerId===ownerId).sort((a,b)=>b.at-a.at)){
  const title=p.items.map(r=>r.한글명||r.제품명).join(' / ')+' · '+p.basic.제조업소명;
  if(!term||title.toLowerCase().includes(term)||p.items.some(r=>r.제품명.toLowerCase().includes(term)))$('product-select').add(new Option(title,p.id));
 }
 $('product-select').value=job.library?.productId||'';
 $('profile-summary').textContent=job.library?`저장한 제품 정보 적용 · ${job.ingredients.length}개 성분 · ${job.processes.length}개 공정`:(owners.length?'화주와 제품을 고르면 기본정보가 채워집니다.':'회사 기본정보를 저장하고 제품을 한 번 등록해주세요.');
}
function hasShipment(){return selected.size>0||job.items.some(r=>[...AMOUNTS,...CARGO,'제조일자','소비기한'].some(k=>r[k]));}
async function allowSwitch(){if(!hasShipment()){if(draftTimer)await saveDraft();return true;}if(!confirm('현재 작업은 저장하고, 수량·날짜·사진 선택을 비운 새 작업을 준비할까요?'))return false;await saveDraft();await rememberValues();return true;}
function clearSelection(clearFiles=false){selected.clear();role='label';prior=discovery=null;if(clearFiles){files=[];$('folder-input').value='';$('folder-name').textContent='이번 선적 폴더를 선택하세요.';$('workbooks').hidden=true;}$('continue-draft').hidden=true;}
on('owner-select',async()=>{const id=$('owner-select').value;if(!await allowSwitch()){renderPickers();return;}job=blankJob(job.kind);ownerId=id;applyDefaults();const owner=library.owners.find(o=>o.id===id);if(owner)Object.assign(job.basic,owner.basic);const products=library.products.filter(p=>p.ownerId===id);if(products.length===1)job=useProduct(library,products[0].id,job.kind);clearSelection();$('product-search').value='';render();},'change');
on('product-select',async()=>{const id=$('product-select').value;if(!id)return;if(!await allowSwitch()){renderPickers();return;}job=useProduct(library,id,job.kind);clearSelection();$('registration').open=false;render();scheduleDraft();status('기본정보를 불러왔습니다. 이번 선적의 값과 사진만 넣으세요.');},'change');
on('product-search',renderPickers,'input');
on('new-product',async()=>{if(!await allowSwitch())return;job=blankJob(job.kind);applyDefaults();const o=library.owners.find(o=>o.id===ownerId);if(o)Object.assign(job.basic,o.basic);clearSelection();render();$('registration').open=true;$('registration').scrollIntoView({behavior:'smooth'});});
on('next-job',async()=>{if(!await allowSwitch())return;const id=job.library?.productId;job=id?useProduct(library,id,job.kind):blankJob(job.kind);applyDefaults();clearSelection(true);render();setStep(0);status('새 작업입니다. 이전 화물번호·수량·날짜·사진 선택을 비웠습니다.');});
on('save-current',()=>$('save-profile').click());
on('save-profile',()=>withBusy(async()=>{
 let ref;library=await changeLibrary(old=>{const result=upsertJob(old,job);ref=result.ref;return result.library;});job.library=ref;ownerId=ref.ownerId;defaults=library.company;render();$('registration').open=false;await saveDraft();status('화주·제품을 저장했습니다. 다음부터 목록에서 선택하면 됩니다.');
}));
async function rememberValues(){if(!job.library||job.items.some(r=>AMOUNTS.some(k=>!(decimal(r[k])>0))))return;library=await changeLibrary(old=>{
 const p=old.products.find(p=>p.id===job.library.productId);if(!p||p.revision!==job.library.revision)return old;
 if(p.basic.제조업소등록번호!==job.basic.제조업소등록번호||p.ownerId!==String(job.basic.수입화주사업자번호).replace(/[\s-]/g,''))return old;
 if(p.items.length!==job.items.length||p.items.some((r,i)=>['제품명','한글명','수량단위'].some(k=>r[k]!==String(job.items[i][k]??''))))return old;
 p.previous=job.items.map(r=>({...Object.fromEntries(AMOUNTS.map(k=>[k,r[k]])),product:r.제품명,unit:r.수량단위,currency:'USD',at:Date.now()}));p.at=Date.now();return old;
 });}
function companyDialog(){
 const next={...defaults};$('dialog-body').replaceChildren(el('h2','우리 회사 기본정보'),el('p','처음 한 번 저장하면 새 작업에 자동으로 채웁니다.','muted'));
 for(const key of COMPANY)$('dialog-body').append(field(key,next[key],v=>next[key]=v));
 const save=el('button','회사 기본정보 저장','button green');save.onclick=async()=>{try{const previous=defaults;library=await changeLibrary(old=>({...old,company:next}));defaults=library.company;await chrome.storage.local.set({[settingsKey]:defaults});for(const k of COMPANY)if(!job.basic[k]||job.basic[k]===previous[k])job.basic[k]=defaults[k];render();$('dialog').close();scheduleDraft();status('회사 기본정보를 저장했습니다.');}catch(e){status(e.message);}};$('dialog-body').append(save);$('dialog').showModal();
}
function manageLibrary(){
 $('dialog-body').replaceChildren(el('h2','저장한 기본정보'));
 const company=el('button','우리 회사 설정','button');company.onclick=()=>{$('dialog').close();companyDialog();};$('dialog-body').append(company);
 for(const owner of library.owners){const group=el('section');group.append(el('h3',owner.basic.수입화주명));const edit=el('button','화주 기본정보 수정','button small');edit.onclick=()=>ownerDialog(owner);group.append(edit);
  for(const p of library.products.filter(p=>p.ownerId===owner.id)){const row=el('div',undefined,'toolbar');row.append(el('span',p.items.map(i=>i.한글명||i.제품명).join(' / ')));const use=el('button','불러와서 수정','button small');use.onclick=async()=>{if(!await allowSwitch())return;job=useProduct(library,p.id,job.kind);ownerId=owner.id;clearSelection();render();$('registration').open=true;$('dialog').close();};const del=el('button','제품 삭제','button small');del.onclick=async()=>{if(!confirm('저장된 제품을 목록에서 삭제할까요? 작성한 작업은 유지됩니다.'))return;library=await changeLibrary(old=>({...old,products:old.products.filter(x=>x.id!==p.id)}));renderPickers();manageLibrary();};row.append(use,del);group.append(row);}$('dialog-body').append(group);
 }
 const backup=el('button','기본정보 백업 받기','button'),restore=el('button','백업 가져오기','button');backup.onclick=()=>download(new Blob([JSON.stringify({format:'vision-intake-library',library},null,2)],{type:'application/json'}),'비전-기본정보백업.json');restore.onclick=()=>$('library-file').click();$('dialog-body').append(backup,restore);if(!$('dialog').open)$('dialog').showModal();
}
function ownerDialog(owner){
 const next={...owner.basic};$('dialog-body').replaceChildren(el('h2','화주 기본정보 수정'));for(const k of OWNER)$('dialog-body').append(field(k,next[k],v=>next[k]=v));
 const save=el('button','화주 저장','button green');save.onclick=async()=>{try{const updated=makeOwner(next);if(updated.id!==owner.id)throw Error('사업자번호가 다른 화주는 새로 등록해주세요.');library=await changeLibrary(old=>({...old,owners:old.owners.map(o=>o.id===owner.id?updated:o)}));renderPickers();manageLibrary();status('화주 기본정보를 저장했습니다. 새로 불러오는 작업부터 적용합니다.');}catch(e){status(e.message);}};$('dialog-body').append(save);
}
on('manage-library',manageLibrary);
on('library-file',async()=>{const f=$('library-file').files[0];if(!f)return;if(f.size>4000000)throw Error('백업 파일은 4MB 이하입니다.');const incoming=parseLibrary(await f.text());if(!confirm(`화주 ${incoming.owners.length}개, 제품 ${incoming.products.length}개를 가져올까요? 같은 ID의 기존 정보는 유지합니다.`))return;
 library=await changeLibrary(old=>({schema:1,company:Object.keys(old.company).some(k=>old.company[k])?old.company:incoming.company,owners:[...old.owners,...incoming.owners.filter(o=>!old.owners.some(x=>x.id===o.id))],products:[...old.products,...incoming.products.filter(p=>!old.products.some(x=>x.id===p.id))]}));defaults=library.company;applyDefaults();render();manageLibrary();status('기본정보 백업을 가져왔습니다.');},'change');
function scheduleDraft(){clearTimeout(draftTimer);draftTimer=setTimeout(()=>{draftTimer=null;saveDraft().catch(e=>$('draft-status').textContent='자동 저장 실패: '+e.message);},900);}
async function saveDraft(){
 clearTimeout(draftTimer);draftTimer=null;let kept=files,assignments=[...selected];
 if(files.reduce((n,f)=>n+f.size,0)>60000000){kept=assignments.map(([i])=>files[i]);assignments=assignments.map(([,role],i)=>[i,role]);}
 if(kept.reduce((n,f)=>n+f.size,0)>60000000)throw Error('저장할 첨부 합계는 60MB 이하입니다.');
 const draft={id:job.id,job:structuredClone(job),files:[...kept],selected:assignments,activeStep,at:Date.now()};await navigator.locks.request('visionDraft:'+job.id,()=>draftStore('save',draft));$('draft-status').textContent='이 PC에 자동 저장됨';
}
function restoreDraft(d){clearTimeout(draftTimer);draftTimer=null;job=d.job;files=d.files;selected=new Map(d.selected);ownerId=job.library?.ownerId||'';role=[...selected.values()].includes('label')?([...selected.values()].includes('front')?'other':'front'):'label';discovery=prior=null;render();setStep(d.activeStep||0);$('continue-draft').hidden=true;status('저장한 작업을 불러왔습니다.');}
on('continue-last',()=>{if(lastDraft)restoreDraft(lastDraft);});

render();lastDraft=(await draftStore('list')).sort((a,b)=>b.at-a.at)[0];$('continue-draft').hidden=!lastDraft;if(new URL(location.href).searchParams.has('resume'))$('resume').click();if(new URL(location.href).searchParams.has('manage'))manageLibrary();const draftId=new URL(location.href).searchParams.get('draft');if(draftId){const d=await draftStore('get',draftId);if(d)restoreDraft(d);else status('저장된 작업을 찾지 못했습니다.');}guardToolNavigation(()=>busy||!!draftTimer);
