import {templateBase64,guide} from './intake-assets.js';
import {intakeDOM} from './intake-dom.js';
import {BASIC,TABLES,blankJob,fromTables,validateIntake,compileTargets,searchPeriods,applyPrevious} from './intake-model.js';
import {readWorkbook} from './workbook.js';
import {draftStore} from './intake-store.js';
import {chooseUnipassTab,continueInTool,guardToolNavigation} from './assist-navigation.js';
import {putAttachments} from './attachment-handoff.js';
import {declarationStep} from './search-copy.js';
const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
let activeStep=0;
function setStep(n){activeStep=n;$('data-step').hidden=n!==0;$('photos-step').hidden=n!==1;$('step-data').classList.toggle('active',n===0);$('step-photos').classList.toggle('active',n===1);}
let job=blankJob(new URL(location.href).searchParams.get('kind')==='new'?'new':'history'),busy=false,files=[],selected=new Map(),role='label',prior=null,discovery=null,objectURLs=[];
let diagnostics=null;
const logs=[],roles={label:'한글표시사항',front:'제품 전면',other:'기타 사진·서류'};
const status=t=>$('status').textContent=t,log=t=>{logs.push({at:new Date().toISOString(),message:t});$('log').append(el('li',t));status(t);};
const settingsKey='visionIntakeDefaultsV1';
let defaults=(await chrome.storage.local.get(settingsKey))[settingsKey]||{};
function applyDefaults(){for(const [k,v]of Object.entries(defaults))if(BASIC.includes(k)&&!job.basic[k])job.basic[k]=v;}
applyDefaults();
function field(label,value,change){const l=el('label',label),input=el('input');input.value=value||'';input.setAttribute('aria-label',label);input.onchange=()=>{change(input.value.trim());};l.append(input);return l;}
function render(){
 $('mode').textContent=job.kind==='new'?'신규 자료 입력':'실적 기반 입력';$('new-data').hidden=job.kind!=='new';$('start').textContent=job.kind==='new'?'신규 화면 연결 확인':'입력 시작';$('find-previous').hidden=job.kind!=='history';
 const primary=['작업명','수입화주명','수입화주사업자번호','제조업소명','제조업소등록번호','선적일'];
 for(const id of ['basic-primary','basic-more'])$(id).replaceChildren();
 for(const key of [...primary,...BASIC.filter(k=>!primary.includes(k))])$(primary.includes(key)?'basic-primary':'basic-more').append(field(key,job.basic[key],v=>{job.basic[key]=v;discovery=prior=null;}));
 $('previous-title').textContent=discovery?discovery.date+' · '+discovery.application:'';
 $('items').replaceChildren();job.items.forEach((item,index)=>{
  const section=el('div',undefined,'item'),head=el('div',undefined,'item-header');head.append(el('h3','품목 '+(index+1)));if(job.items.length>1){const remove=el('button','삭제','button small');remove.onclick=()=>{job.items.splice(index,1);discovery=prior=null;render();};head.append(remove);}section.append(head);
  const grid=el('div',undefined,'fields-grid');for(const key of TABLES.품목.filter(k=>!['출처','품목ID'].includes(k))){const f=field(key,item[key],v=>{item[key]=v;if(['제품명','수량단위'].includes(key)){prior=null;discovery=null;}});
   if(prior&&index===0&&['수량','순중량kg','금액USD'].includes(key)){const b=el('button',prior[key]+' 적용','button small');b.onclick=()=>{try{job.items[index]=applyPrevious(item,prior,[key]);render();}catch(e){status(e.message);}};f.append(b);}grid.append(f);
  }section.append(grid);if(prior&&index===0){const b=el('button','세 항목 모두 적용','button');b.onclick=()=>{try{job.items[index]=applyPrevious(item,prior);render();}catch(e){status(e.message);}};section.append(b);}$('items').append(section);
 });
 $('tables').replaceChildren();for(const [name,key]of Object.entries({제품유형:'types',표시사항:'labels',제조공정:'processes',성분:'ingredients'})){
  const details=el('details'),summary=el('summary',name+' · '+job[key].length+'행'),wrap=el('div',undefined,'table-scroll'),table=el('table'),header=el('tr');for(const col of TABLES[name])header.append(el('th',col));table.append(header);
  job[key].forEach((row,i)=>{const tr=el('tr');for(const col of TABLES[name]){const td=el('td'),input=el('input');input.value=row[col]||'';input.setAttribute('aria-label',name+' '+(i+1)+' '+col);input.onchange=()=>row[col]=input.value.trim();td.append(input);tr.append(td);}const td=el('td'),del=el('button','삭제');del.onclick=()=>{job[key].splice(i,1);render();};td.append(del);tr.append(td);table.append(tr);});
  const add=el('button','＋ 행 추가','button small');add.onclick=()=>{job[key].push(Object.fromEntries(TABLES[name].map(k=>[k,''])));render();};wrap.append(table);details.append(summary,wrap,add);$('tables').append(details);
 }
 renderPhotos();
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
   if(selected.has(index))selected.delete(index);else{if(file.size>5000000||!file.size){status('첨부는 파일당 5MB 이하입니다.');return;}if(role==='other'&&[...selected.values()].filter(v=>v==='other').length>=9){status('기타는 최대 9개입니다.');return;}if(role!=='other')for(const [k,v]of selected)if(v===role)selected.delete(k);selected.set(index,role);if(role==='label')role='front';else if(role==='front')role='other';}renderPhotos();};$('gallery').append(b);
 });
 $('photo-summary').textContent=Object.entries(roles).map(([k,v])=>v+' '+[...selected.values()].filter(r=>r===k).length).join(' · ');
 $('selected-files').replaceChildren();const others=[...selected].filter(([,r])=>r==='other');others.forEach(([index],i)=>{const row=el('div');row.append(el('span',(i+1)+'. '+files[index].name));for(const delta of [-1,1]){const b=el('button',delta<0?'↑':'↓','button small');b.disabled=i+delta<0||i+delta>=others.length;b.onclick=()=>{[others[i],others[i+delta]]=[others[i+delta],others[i]];selected=new Map([...selected].filter(([,r])=>r!=='other').concat(others));renderPhotos();};row.append(b);}$('selected-files').append(row);});
}
function on(id,fn,event='click'){$(id).addEventListener(event,async()=>{if(busy)return;try{await fn();}catch(e){log(e.message);}});}
async function withBusy(fn){if(busy)return;busy=true;document.querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=true);try{await fn();}finally{busy=false;document.querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=false);}}
const download=(blob,name)=>{const a=el('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
on('template',()=>download(new Blob([Uint8Array.from(atob(templateBase64),c=>c.charCodeAt(0))],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'비전-입력양식.xlsx'));
on('guide',()=>download(new Blob([guide],{type:'text/plain;charset=utf-8'}),'GPT-자료정리지침.txt'));
on('inspect',async()=>{const tab=await chooseUnipassTab();if(!tab)return;const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:intakeDOM,args:[{action:'diagnostics'}]});diagnostics=result.find(r=>r.frameId===0)?.result;status('입력칸 이름과 버튼 구조를 읽었습니다. 기록 저장으로 내보낼 수 있습니다. 입력값은 수집하지 않았습니다.');});
on('step-data',()=>setStep(0));on('step-photos',()=>setStep(1));on('extra-picker',()=>$('extra-files').click());
on('folder',()=>$('folder-input').click());on('excel',()=>$('excel-input').click());
async function importFile(file){const next=fromTables(await readWorkbook(file),job.kind);job=next;discovery=prior=null;applyDefaults();render();const errors=validateIntake(job);status(errors.length?errors.join('\n'):'엑셀을 불러왔습니다. 사진을 선택하고 시작하세요.');}
on('excel-input',async()=>{if($('excel-input').files[0])await importFile($('excel-input').files[0]);},'change');
on('folder-input',async()=>{
 const all=[...$('folder-input').files];if(all.length>1000)throw Error('한 건의 폴더를 선택해주세요. 최대 1,000파일입니다.');
 files=all.filter(f=>/\.(png|jpe?g|bmp|gif|tiff?|pdf)$/i.test(f.name));selected.clear();role='label';discovery=prior=null;
 $('folder-name').textContent=(all[0]?.webkitRelativePath.split('/')[0]||'폴더')+' · 사진/PDF '+files.length+'개';
 const books=all.filter(f=>/\.xlsx$/i.test(f.name)&&!f.name.startsWith('~$'));$('workbooks').replaceChildren(new Option('읽을 엑셀 선택',''));$('workbooks').hidden=books.length<2;
 for(const [i,f]of books.entries())$('workbooks').append(new Option(f.webkitRelativePath||f.name,String(i)));
 $('workbooks').onchange=()=>{if($('workbooks').value!=='')importFile(books[Number($('workbooks').value)]).catch(e=>status(e.message));};
 renderPhotos();if(books.length===1)await importFile(books[0]);else status(books.length?'읽을 엑셀을 선택해주세요.':'사진을 불러왔습니다. 엑셀을 추가하거나 직접 입력하세요.');
},'change');
on('extra-files',()=>{setStep(1);files.push(...[...$('extra-files').files].filter(f=>/\.(png|jpe?g|bmp|gif|tiff?|pdf)$/i.test(f.name)));renderPhotos();},'change');
on('add-item',()=>{job.items.push({품목ID:'P'+crypto.randomUUID().slice(0,8)});discovery=prior=null;render();});
on('settings',()=>{
 $('dialog-body').replaceChildren(el('h2','기본정보 설정'));for(const key of ['대행업체사업자번호','대행업체허가번호','신청인전화','신청인휴대폰','화주휴대폰'])$('dialog-body').append(field(key,defaults[key],v=>defaults[key]=v));
 const save=el('button','기본값 저장','button green');save.onclick=async()=>{await chrome.storage.local.set({[settingsKey]:defaults});applyDefaults();render();$('dialog').close();status('기본값을 저장했습니다. 이번 건에서는 각각 변경할 수 있습니다.');};$('dialog-body').append(save);$('dialog').showModal();
});on('dialog-close',()=>$('dialog').close());
on('save',async()=>{const errors=validateIntake(job);if(errors.length)throw Error(errors.join('\n'));const bytes=files.reduce((n,f)=>n+f.size,0);if(bytes>60000000)throw Error('작업 파일 합계는 60MB 이하로 저장해주세요.');await draftStore('save',{id:job.id,job,files,selected:[...selected],activeStep,at:Date.now()});status('이 PC에 자료와 선택한 첨부를 저장했습니다.');});
on('resume',async()=>{
 const drafts=await draftStore('list');$('dialog-body').replaceChildren(el('h2','저장한 작업'));
 for(const d of drafts.sort((a,b)=>b.at-a.at)){const row=el('div',undefined,'toolbar'),b=el('button',d.job.basic.작업명||d.job.items[0]?.제품명||'작업','button');b.onclick=()=>{job=d.job;files=d.files;selected=new Map(d.selected);role=[...selected.values()].includes('label')?([...selected.values()].includes('front')?'other':'front'):'label';discovery=prior=null;render();setStep(d.activeStep||0);$('dialog').close();};const del=el('button','삭제','button');del.onclick=async()=>{await draftStore('delete',d.id);row.remove();};row.append(b,del);$('dialog-body').append(row);}$('dialog').showModal();
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
 const errors=validateIntake(job,{execution:true});if(errors.length)throw Error(errors.join('\n'));
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
  // Actual new-form lookup contracts have not been captured on the user's PC.
  // Do not execute speculative site writes. Export a read-only integration report.
  const tab=await chooseUnipassTab();if(!tab)return;
  await withBusy(async()=>{const frames=await chrome.scripting.executeScript({target:{tabId:tab.id},func:intakeDOM,args:[{action:'diagnostics'}]});diagnostics=frames.find(r=>r.frameId===0)?.result;await draftStore('save',{id:job.id,job,files,selected:[...selected],activeStep,at:Date.now()});log('신규 자료를 저장하고 화면 구조를 읽었습니다. 신규 자동 입력은 실제 조회창 연결 확인 후 활성화됩니다. 이번에는 값을 변경하지 않았습니다.');});
 }
});
on('export-log',()=>{const a=el('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({version:chrome.runtime.getManifest().version,job,logs,diagnostics},null,2)],{type:'application/json'}));a.download='vision-intake-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
render();if(new URL(location.href).searchParams.has('resume'))$('resume').click();guardToolNavigation(()=>busy);
