import {draftStore} from './intake-store.js';
import {sizeAssistWindow} from './assist-window.js';
import {openTool} from './assist-navigation.js';
import {VERSION,emptyState,newJob,validateJob,parseRows,readImport,cleanExport} from './assist-model.js';
import {assistFill} from './assist-fill.js';
const $=id=>document.getElementById(id), main=$('main');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>`<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;
const extension=!!globalThis.chrome?.runtime?.id;
let state=emptyState(),job=null,dirty=false,screen='home',capture=null,preview=null,tabId=null,nativeStatus=null,busy=false;
async function rpc(message){
 if(!extension){
  if(message.type==='read')return JSON.parse(localStorage.getItem('assist-preview')||'null')||emptyState();
  if(message.type==='write'){message.state.revision++;localStorage.setItem('assist-preview',JSON.stringify(message.state));return message.state;}
  throw Error('화면 미리보기에서는 PC·유니패스 연결을 실행하지 않습니다.');
 }
 const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw Error(r?.error||'프로그램 연결을 확인해주세요.');return r.data;
}
async function write(){state=await rpc({type:'write',state,expectedRevision:state.revision});}
function toast(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),6000);}
function on(id,fn,event='click'){$(id)?.addEventListener(event,async e=>{try{await fn(e);}catch(error){toast(error.message);}});}
function head(title,desc){void sizeAssistWindow();return `<button class="back" id="back">${icon('arrow')}처음으로</button><div class="page-head"><div><h1>${title}</h1><p>${desc}</p></div></div>`;}
function bindBack(){on('back',home);}
function ensureLeave(){return !dirty||confirm('저장하지 않은 변경이 있습니다. 이 화면을 나갈까요?');}
async function home(){if(!ensureLeave())return;dirty=false;job=null;capture=preview=null;screen='home';state=await rpc({type:'read'});renderHome();}
function renderHome(){
 void sizeAssistWindow(true);
 const count=state.jobs.length;
 main.innerHTML=`<section class="home"><h1>무엇을 할까요?</h1><div class="tiles"><button class="tile primary" id="history">${icon('history')}<strong>실적 기반 입력</strong><small>이전 실적에서 간편하게</small></button><button class="tile" id="new">${icon('new')}<strong>신규 자료 입력</strong><small>저장한 제품으로 간편하게</small></button><button class="tile" id="resume">${icon('resume')}<strong>작업 이어하기${count?`<span class="work-count">${count}</span>`:''}</strong><small>남겨둔 작업을 이어서</small></button><button class="tile" id="update">${icon('update')}<strong>업데이트 확인</strong><small>항상 편리한 작업 환경</small></button></div>${extension?'':'<p class="muted">디자인 미리보기 · PC 연결 기능은 설치 후 사용할 수 있습니다.</p>'}</section>`;
 on('history',history);on('new',()=>openTool('intake.html?kind=new')); on('resume',jobs);on('update',updates);
}
async function history(){
 if(!ensureLeave())return;dirty=false;screen='history';
 main.innerHTML=head('실적 기반 입력','어떤 작업을 할까요?')+`<div class="start-choices"><button id="history-start" class="start-choice primary"><span class="choice-icon">＋</span><strong>새로 시작</strong><small>이전 실적을 불러와 입력</small><span class="choice-arrow">→</span></button><button id="history-open" class="start-choice"><span class="choice-icon">↪</span><strong>이어서 입력</strong><small>열어둔 신청서에서 계속</small><span class="choice-arrow">→</span></button></div><details class="extra-tools"><summary>다른 작업</summary><div class="toolbar"><button class="button" id="history-data">입력 자료 정리</button><button class="button" id="legacy-tools">상세 도구</button><button class="button" id="legacy-start">기존 방식으로 시작</button><button class="button" id="folder-resume">폴더 작업 이어가기</button></div></details>`;
 bindBack();on('history-start',()=>openTool('intake.html?kind=history'));on('history-open',async()=>{const id=await pickTab();if(id)await openTool('cargo-workflow.html?tab='+id);});on('legacy-tools',()=>openTool('popup.html'));on('legacy-start',()=>openTool('workflow.html'));on('folder-resume',()=>openTool('intake.html?resume=1'));on('history-data',()=>{job=newJob('history');editor();});
}
async function jobs(){
 if(!ensureLeave())return;dirty=false;screen='jobs';state=await rpc({type:'read'});const preparations=extension?(await draftStore('list')).sort((a,b)=>b.at-a.at):[];
 main.innerHTML=head('작업 이어하기','저장한 자료와 입력 기록을 이어서 확인합니다.')+`<section class="panel"><div class="toolbar"><button class="button" id="import-job">작업 가져오기</button><button class="button" id="legacy-resume">기존 입력 작업 이어하기</button></div><div id="intake-jobs">${preparations.map(d=>`<div class="job-row"><div><strong>${esc(d.job.basic.작업명||d.job.items[0]?.한글명||d.job.items[0]?.제품명||'준비 중인 작업')}</strong><small>${new Date(d.at).toLocaleString('ko-KR')} · 사진 ${d.selected.length}개</small></div><button class="button small" data-draft="${esc(d.id)}">이어서 준비</button></div>`).join('')}</div><div id="jobs-list">${state.jobs.length?state.jobs.map(j=>`<div class="job-row"><div><strong>${esc(j.title)}</strong><span class="badge">${j.kind==='new'?'신규 자료':'실적 자료'}</span><small>${new Date(j.updatedAt).toLocaleString('ko-KR')} · ${j.fields.length}항목 · ${j.attempts?.some(a=>a.result==='pending')?'입력 결과 확인 필요':'저장됨'}</small></div><button class="button small" data-job="${esc(j.id)}">열기</button></div>`).join(''):preparations.length?'':'<p class="empty">아직 저장한 작업이 없습니다.<br><br>신규 자료 입력에서 첫 작업을 만들어보세요.</p>'}</div></section>`;
 bindBack();on('import-job',()=>chooseFile(async text=>{job=readImport(text);dirty=true;editor();}));on('legacy-resume',history);
 document.querySelectorAll('[data-draft]').forEach(b=>b.addEventListener('click',()=>openTool('intake.html?draft='+encodeURIComponent(b.dataset.draft))));
 document.querySelectorAll('[data-job]').forEach(b=>b.addEventListener('click',()=>{job=structuredClone(state.jobs.find(j=>j.id===b.dataset.job));editor();}));
}
function editor(){
 screen='editor';capture=preview=null;
 main.innerHTML=head(job.kind==='new'?'신규 자료 입력':'실적 자료 정리','자료를 저장하고, 실제 화면의 입력칸과 연결합니다.')+`<section class="panel"><label class="form-label" for="job-title">작업 이름</label><input id="job-title" type="text" maxlength="160" placeholder="예: 11월 수입 건 · 제품명" value="${esc(job.title)}"><div class="toolbar"><button class="button small" id="add-field">+ 항목 추가</button><button class="button small" id="paste-fields">표 붙여넣기</button><button class="button small" id="import-fields">자료 가져오기</button><button class="button small" id="export-job">내보내기</button></div><p class="hint">항목 · 입력할 값 · 출처를 정리한 후, 원문을 확인한 항목에 체크하세요.<br>엑셀의 3열(항목 / 값 / 출처)을 복사해 붙여넣을 수 있습니다. 사진과 원재료 표의 행 추가·코드 조회는 실제 화면에서 별도로 확인합니다.</p><div id="fields"></div><div class="button-row"><span id="save-state" class="muted"></span><button class="button" id="save-job">작업 저장</button><button class="button green" id="connect">입력칸 연결</button></div></section><section class="panel" id="attempt-panel"><h2>입력 기록</h2><div id="attempts"></div></section>`;
 bindBack();renderFields();renderAttempts();
 on('job-title',e=>{job.title=e.target.value;dirty=true;},'input');
 on('add-field',()=>{job.fields.push({id:crypto.randomUUID(),label:'',value:'',source:'',reviewed:false,required:false});dirty=true;renderFields();});
 on('save-job',()=>saveJob());on('export-job',()=>{const errors=validateJob(job);if(errors.length)throw Error(errors.join('\n'));download(cleanExport(job),'비전-작업.json');});
 on('paste-fields',()=>{modal(`<h2>표 붙여넣기</h2><p class="hint">엑셀에서 항목·값·출처 3열을 복사해주세요.<br>기존 자료 아래에 추가하며, 확인 상태는 새로 체크합니다.</p><textarea id="paste-area" rows="8" aria-label="붙여넣을 표"></textarea><div class="button-row"><button class="button green" id="paste-go">자료 추가</button></div>`);on('paste-go',()=>{const rows=parseRows($('paste-area').value);if(job.fields.length+rows.length>200)throw Error('최대 200항목까지 지원합니다.');job.fields.push(...rows);dirty=true;renderFields();$('dialog').close();});});
 on('import-fields',()=>chooseFile(async(text,name)=>{if(name.endsWith('.json')){const imported=readImport(text);if(job.fields.length+imported.fields.length>200)throw Error('최대 200항목까지 지원합니다.');job.fields.push(...imported.fields);}else {const rows=parseRows(text);if(job.fields.length+rows.length>200)throw Error('최대 200항목까지 지원합니다.');job.fields.push(...rows);}if(job.fields.length>200)throw Error('최대 200항목까지 지원합니다.');dirty=true;renderFields();}));
 on('connect',async()=>{const grant=extension?chrome.permissions.request({origins:['https://unipass.customs.go.kr/*']}):Promise.resolve(false);await saveJob(false);if(!await grant)throw Error('UNI-PASS 화면 연결 권한이 필요합니다.');tabId=await pickTab(false);if(tabId)await connect();});
}
function renderFields(){
 $('fields').innerHTML=job.fields.map((f,i)=>`<div class="field-row" data-field="${i}"><input data-prop="label" type="text" aria-label="${i+1}번째 항목 이름" placeholder="항목" maxlength="120" value="${esc(f.label)}"><textarea data-prop="value" aria-label="${i+1}번째 입력할 값" placeholder="입력할 값">${esc(f.value)}</textarea><input data-prop="source" type="text" aria-label="${i+1}번째 자료 출처" placeholder="자료 출처 · 페이지" maxlength="500" value="${esc(f.source)}"><label class="check"><input data-prop="reviewed" type="checkbox" aria-label="${i+1}번째 원문 확인" ${f.reviewed?'checked':''}>확인</label><button class="delete-field" data-remove="${i}" aria-label="${i+1}번째 항목 삭제">×</button></div>`).join('');
 $('fields').querySelectorAll('[data-prop]').forEach(e=>e.addEventListener('input',()=>{const f=job.fields[Number(e.closest('[data-field]').dataset.field)];f[e.dataset.prop]=e.type==='checkbox'?e.checked:e.value;if(e.dataset.prop!=='reviewed'){f.reviewed=false;e.closest('[data-field]').querySelector('[type=checkbox]').checked=false;}dirty=true;preview=null;}));
 $('fields').querySelectorAll('[data-remove]').forEach(e=>e.addEventListener('click',()=>{job.fields.splice(Number(e.dataset.remove),1);dirty=true;renderFields();}));
}
async function saveJob(notify=true){
 const errors=validateJob(job);if(errors.length)throw Error(errors.join('\n'));
 job.updatedAt=new Date().toISOString();const i=state.jobs.findIndex(j=>j.id===job.id);if(i<0)state.jobs.push(structuredClone(job));else state.jobs[i]=structuredClone(job);
 await write();dirty=false;if($('save-state'))$('save-state').textContent='저장됨';if(notify)toast('작업을 저장했습니다.');
}
function renderAttempts(){
 if(!$('attempts'))return;
 $('attempts').innerHTML=job.attempts?.length?job.attempts.slice().reverse().map(a=>`<div class="job-row"><div><strong>${a.result==='filled'?'입력칸 반영 확인':a.result==='pending'?'결과 확인 필요':a.result==='user_checked'?'사용자가 결과 확인':'일부 입력 · 확인 필요'}</strong><small>${esc(a.at)} · ${a.count}항목</small></div>${['pending','partial'].includes(a.result)?`<button class="button small" data-resolve="${esc(a.id)}">결과 확인 기록</button>`:''}</div>`).join(''):'<p class="muted">아직 입력하지 않았습니다. 작업 저장과 유니패스 입력은 별도입니다.</p>';
 document.querySelectorAll('[data-resolve]').forEach(b=>b.addEventListener('click',()=>{modal('<h2>입력 결과 확인</h2><p class="hint">실제 UNI-PASS 화면에서 확인한 내용을 기록해주세요. 자동으로 성공한 것으로 처리하지 않습니다.</p><textarea id="result-note" aria-label="확인 내용"></textarea><div class="button-row"><button class="button green" id="resolve-go">확인 기록 저장</button></div>');on('resolve-go',async()=>{const note=$('result-note').value.trim();if(!note)throw Error('확인한 내용을 적어주세요.');const a=job.attempts.find(a=>a.id===b.dataset.resolve);a.result='user_checked';a.note=note;await saveJob(false);renderAttempts();$('dialog').close();});}));
}
async function pickTab(requestPermission=true){
 if(!extension)throw Error('설치된 프로그램에서 UNI-PASS를 연결해주세요.');
 if(requestPermission&&!await chrome.permissions.request({origins:['https://unipass.customs.go.kr/*']}))throw Error('UNI-PASS 화면 연결 권한이 필요합니다.');
 const tabs=await chrome.tabs.query({url:'https://unipass.customs.go.kr/*'});if(!tabs.length)throw Error('Chrome에서 UNI-PASS에 로그인하고 입력할 신청서를 열어주세요.');
 if(tabs.length===1)return tabs[0].id;
 return new Promise(resolve=>{modal(`<h2>입력할 화면 선택</h2><p class="hint">여러 창이 열려 있습니다. 이번 작업의 신청서를 골라주세요.</p><select id="tab-pick" aria-label="UNI-PASS 화면">${tabs.map(t=>`<option value="${t.id}">${esc(t.title||'UNI-PASS')} · 창 ${t.windowId}</option>`).join('')}</select><div class="button-row"><button class="button green" id="tab-go">이 화면 연결</button></div>`);let chosen=false;$('dialog').addEventListener('close',()=>{if(!chosen)resolve(null);},{once:true});on('tab-go',()=>{chosen=true;const id=Number($('tab-pick').value);$('dialog').close();resolve(id);});});
}
async function invoke(request){const result=await chrome.scripting.executeScript({target:{tabId},func:assistFill,args:[request]});const r=result.find(r=>r.frameId===0);if(r?.error||!r?.result)throw Error(r?.error?.message||'화면 응답을 확인하지 못했습니다. 자동으로 다시 입력하지 않습니다.');return r.result;}
async function connect(){
 capture=await invoke({mode:'capture'});preview=null;screen='mapping';
 main.innerHTML=head('입력칸 연결','지금 열려 있는 탭의 입력칸에 자료를 연결합니다.')+`<section class="panel"><div class="status">신청번호: ${esc(capture.context.application.join('-')||'채번 전')}<br>공통사항·품목사항 등 화면 탭을 바꾸면 입력칸을 다시 읽어주세요.</div><div class="toolbar"><button class="button" id="reread">입력칸 다시 읽기</button><button class="button" id="edit-data">자료 수정</button></div><div class="table-wrap"><table><thead><tr><th>정리한 자료</th><th>입력할 값</th><th>실제 화면 입력칸</th></tr></thead><tbody>${job.fields.filter(f=>f.value.trim()).map(f=>`<tr><td>${esc(f.label)}${f.reviewed?'':'<span class="badge">미확인</span>'}</td><td>${esc(f.value)}</td><td><select data-map="${esc(f.id)}" aria-label="${esc(f.label)} 입력칸 연결"><option value="">이번에는 입력하지 않음</option>${capture.fields.map(c=>`<option value="${esc(c.id)}" ${job.mappings[f.id]===c.id?'selected':''}>${esc(c.label)} · ${esc(c.id.replace('CSW0101001S_',''))}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div><div class="button-row"><button class="button green" id="preview">입력 미리보기</button></div><div id="preview-area"></div></section>`;
 bindBack();on('reread',connect);on('edit-data',editor);
 document.querySelectorAll('[data-map]').forEach(e=>e.addEventListener('change',()=>{job.mappings[e.dataset.map]=e.value;dirty=true;preview=null;$('preview-area').replaceChildren();}));
 on('preview',async()=>{
  if(job.attempts?.some(a=>['pending','partial'].includes(a.result)))throw Error('이전 입력 결과를 자료 화면에서 먼저 확인하고 기록해주세요.');
  const rows=job.fields.filter(f=>job.mappings[f.id]&&f.value.trim()).map(f=>({...f,target:job.mappings[f.id]}));
  if(!rows.length)throw Error('입력할 자료와 입력칸을 하나 이상 연결해주세요.');
  const errors=validateJob({...job,fields:rows},{complete:true});if(errors.length)throw Error(errors.join('\n'));
  await saveJob(false);preview={...(await invoke({mode:'preview',context:capture.context,rows})),rows};
  $('preview-area').innerHTML=`<h2>입력 전 확인</h2><div class="table-wrap"><table><thead><tr><th>항목</th><th>현재 값</th><th>입력할 값</th></tr></thead><tbody>${preview.changes.map(c=>`<tr><td>${esc(c.label)}</td><td>${esc(c.before)||'비어 있음'}</td><td>${esc(c.after)}</td></tr>`).join('')}</tbody></table></div><p class="hint">연결한 입력칸만 반영합니다. 조회·행 추가·저장·전송 버튼은 누르지 않습니다.</p><div class="button-row"><button class="button green" id="apply">확인한 내용 입력</button></div>`;
  on('apply',async()=>{
   if(busy||!preview)return;busy=true;$('apply').disabled=true;
   try{
    await navigator.locks.request('vision-assist-input',{ifAvailable:true},async lock=>{
     if(!lock)throw Error('다른 창에서 입력 중입니다.');
     const attempt={id:crypto.randomUUID(),at:new Date().toISOString(),count:preview.rows.length,result:'pending',tabId};job.attempts.push(attempt);await saveJob(false);
     let result;try{result=await invoke({mode:'apply',context:capture.context,rows:preview.rows,digest:preview.digest});}catch(e){preview=null;throw e;}
     attempt.result=result.status;attempt.details=result;await saveJob(false);preview=null;
     $('preview-area').innerHTML=`<div class="status ${result.status==='filled'?'':'warning'}">${result.status==='filled'?`${result.count}개 입력칸의 반영을 확인했습니다. 저장·전송은 아직 하지 않았습니다.`:esc(result.message)}</div>`;
    });
   }finally{busy=false;}
  });
 });
}
async function updates(){
 if(!ensureLeave())return;dirty=false;screen='updates';
 main.innerHTML=head('업데이트 확인','ZIP을 다시 내려받지 않고, 여기서 새 기능을 받으세요.')+`<section class="panel update-center"><div class="update-mark">${icon('update')}</div><h2>비전 어시스트</h2><p>현재 버전 ${VERSION}</p><div class="toolbar" style="justify-content:center"><button class="button green" id="check-update">새 버전 확인</button><button class="button" id="restore-update">이전 버전 복구</button></div><div id="update-status" class="status">새 버전을 확인하면 배포된 업데이트가 있는지 안내합니다.</div><div id="update-action" class="button-row"></div></section>`;
 bindBack();on('check-update',checkUpdate);on('restore-update',async()=>{
  if(!confirm('작업 화면을 종료했나요? 마지막 업데이트 이전 파일로 복구합니다. 저장한 작업 자료는 유지됩니다.'))return;
  await nativeAction('restore');
 });
}
async function native(command){try{const r=await rpc({type:'native',command});if(!r.ok)throw Error(r.message||'작업을 완료하지 못했습니다.');return r;}catch(e){if(/native messaging host|Specified native|not found|Access to the specified/i.test(e.message))throw Error('실행기 연결이 필요합니다. 내려받은 비전 어시스트 실행 파일을 한 번 열어 연결을 완료해주세요.');throw e;}}
async function checkUpdate(){
 $('check-update').disabled=true;$('update-status').textContent='새 버전을 확인하고 있습니다.';
 try{
  const r=await native('check');nativeStatus=r;
  $('update-status').textContent=r.available?`새 버전 ${r.version}을 사용할 수 있습니다.\n다른 비전 작업 창을 닫은 뒤 업데이트하세요. UNI-PASS 화면과 저장 자료는 유지합니다.`:r.message||'현재 최신 버전입니다.';
  $('update-status').className='status';$('update-action').innerHTML=r.available?'<button class="button green" id="install-update">업데이트 설치</button>':'';
  on('install-update',()=>nativeAction('apply'));
 }catch(e){$('update-status').className='status warning';$('update-status').textContent=e.message;}
 finally{$('check-update').disabled=false;}
}
async function nativeAction(command){
 $('update-status').textContent=command==='apply'?'업데이트를 검증하고 적용합니다.':'이전 버전을 복구합니다.';
 try{const r=await native(command);$('update-status').textContent=r.message||'완료했습니다. 다시 열면 적용됩니다.';$('update-action').innerHTML='<button class="button green" id="reload-app">새 버전으로 다시 열기</button>';on('reload-app',async e=>{const button=e.currentTarget;button.disabled=true;button.textContent='다시 여는 중…';try{await rpc({type:'reload'});}catch(error){button.disabled=false;button.textContent='새 버전으로 다시 열기';throw error;}});}
 catch(e){$('update-status').className='status error';$('update-status').textContent=e.message;}
}
async function settings(){
 modal(`<h2>설정</h2><div class="setting-row"><div><strong>회사·화주·제품 기본정보</strong><p>한 번 저장하고 매번 불러옵니다.</p></div><button class="button small" id="intake-library">관리</button></div><div class="setting-row"><div><strong>실행 시 업데이트 확인</strong><p>새 버전이 있으면 알려줍니다. 설치는 직접 선택합니다.</p></div><input type="checkbox" id="auto-check" aria-label="실행 시 업데이트 확인" ${state.settings.checkOnOpen?'checked':''}></div><div class="setting-row"><div><strong>작업 백업</strong><p>저장한 자료를 파일로 보관합니다.</p></div><button class="button small" id="backup">내보내기</button></div><div class="setting-row"><div><strong>작업 백업 복원</strong><p>기존 작업을 유지하고 새 작업으로 가져옵니다.</p></div><button class="button small" id="restore-data">가져오기</button></div><p class="hint">자료는 현재 Chrome 프로필에 저장됩니다. 확장을 삭제하면 자료가 지워질 수 있으니 백업을 보관해주세요.</p><p class="muted">비전 어시스트 ${VERSION} · <a href="assist-licenses.html">프로그램 정보·라이선스</a></p>`);
 on('intake-library',()=>openTool('intake.html?manage=1'));
 on('auto-check',async e=>{state.settings.checkOnOpen=e.target.checked;await write();},'change');on('backup',()=>download(JSON.stringify({format:'vision-assist-backup',schema:1,jobs:state.jobs},null,2),'비전-작업백업.json'));
 on('restore-data',()=>chooseFile(async text=>{if(text.length>7500000)throw Error('백업 파일이 너무 큽니다.');const data=JSON.parse(text);if(data.format!=='vision-assist-backup'||data.schema!==1||!Array.isArray(data.jobs)||data.jobs.length>500)throw Error('지원하는 백업 파일이 아닙니다.');const added=data.jobs.map(j=>readImport(JSON.stringify({format:'vision-assist-job',schema:1,job:j})));state.jobs.push(...added);await write();$('dialog').close();toast(`${added.length}개 작업을 가져왔습니다. 입력 전 원문을 다시 확인해주세요.`);}));
}
function modal(html){$('dialog-content').innerHTML=html;if(!$('dialog').open)$('dialog').showModal();}
function chooseFile(handler){const input=$('import-file');input.value='';input.onchange=async()=>{const f=input.files[0];if(!f)return;try{if(f.size>7500000)throw Error('파일이 너무 큽니다.');await handler(await f.text(),f.name);}catch(e){toast(e.message);}};input.click();}
function download(text,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
on('brand',async e=>{e.preventDefault();await home();});on('settings',settings);
window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
try{state=await rpc({type:'read'});renderHome();const route=new URL(location.href).searchParams.get('view');if(route==='history')await history();if(route==='settings')await settings();if(state.settings.checkOnOpen&&extension){native('check').then(r=>{if(r.available)toast(`새 버전 ${r.version}이 있습니다. 업데이트 확인에서 설치할 수 있습니다.`);}).catch(()=>{});}}catch(e){main.textContent='자료를 불러오지 못했습니다. 창을 다시 열어주세요. '+e.message;}
