import {watchCategoryDialog} from './new-dialog.js';
import {newDOM} from './new-dom.js';
import {createJournal} from './new-journal.js';
import {ingredientPlan,representativeItem,businessSignature,GENERAL_CHOICES} from './new-plan.js';
import {validateIntake} from './intake-model.js';
import {watchFinalDialog} from './final-dialog.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function runNewIntake({job,tabId,files,log=()=>{},onState=()=>{},transport,storage=chrome.storage.local,watchDialog=watchFinalDialog,categoryDialog=watchCategoryDialog}){
 const errors=validateIntake(job,{execution:true});if(errors.length)throw Error(errors.join('\n'));
 if(!files.some(f=>f.slot===0)||!files.some(f=>f.slot===9))throw Error('한글표시 사진과 제품 전면 사진을 먼저 선택해주세요.');
 if(files.some(({slot,file})=>file.size<1||file.size>5000000||!/^.+\.(png|jpe?g|bmp|gif|tiff?|pdf)$/i.test(file.name)||slot===9&&/\.pdf$/i.test(file.name)))throw Error('첨부 형식·크기 또는 제품 전면 사진을 확인해주세요.');
 const attachments=await Promise.all(files.map(async({slot,file})=>({slot,file,meta:{name:file.name,size:file.size,type:file.type,lastModified:file.lastModified,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('')}})));
 if(new Set(files.map(f=>f.slot)).size!==files.length)throw Error('첨부 위치가 중복됩니다.');
 const key='visionNewRun:'+job.id,signature=businessSignature(job)+JSON.stringify(attachments.map(({slot,meta})=>({slot,meta})));
 let state=(await storage.get(key))[key];
 if(state&&(state.signature!==signature||state.tabId!==tabId))throw Error('진행 중인 자료·첨부 또는 대상 탭이 달라졌습니다. 저장한 작업과 원래 신청서를 연결해주세요.');
 state??={session:crypto.randomUUID(),signature,tabId,application:null,steps:{}};
 const persist=()=>storage.set({[key]:state});
 const identity={importer:job.basic.수입화주사업자번호,manufacturer:job.basic.제조업소등록번호};
 const call=async(q,target=tabId,allowBlocked=false)=>{
  const args={session:state.session,application:state.application,identity,...q};let timer;
  const request=transport?transport(args,target):chrome.scripting.executeScript({target:{tabId:target},func:newDOM,args:[args]}).then(rs=>rs.find(r=>r.frameId===0)?.result);
  const r=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('화면 응답 시간이 지났습니다. 진행 기록을 보존했습니다.')),15000);})]).finally(()=>clearTimeout(timer));
  if(!r||r.status==='blocked'&&!allowBlocked)throw Error(r?.reason||'화면 응답을 확인하지 못했습니다.');return r;
 };
 const poll=async fn=>{const until=Date.now()+15000;do{const r=await fn();if(r.done||r.ready||r.selected)return r;await delay(350);}while(Date.now()<until);throw Error('화면 반영을 확인하지 못했습니다. 원래 신청서를 유지하고 이어하기를 눌러주세요.');};
 const journal=createJournal({state,persist,log:t=>{log(t);onState(t);}});
 const step=async(name,read,write,options)=>{await call({action:'guard'});return journal(name,(record,after)=>after?poll(()=>read(record)):read(record),write,options);};
 const transient=async(name,read,write)=>{await call({action:'guard'});if(state.steps[name]?.status==='done')return;return step(name,read,write,{idempotent:true});};
 const fields=async(name,values)=>{const descriptors=values.filter(f=>f.value!==undefined&&f.value!=='');if(descriptors.length)await transient(name,()=>call({action:'fields_read',fields:descriptors}),()=>call({action:'fields_write',fields:descriptors}));};
 const tab=async kind=>{if((await call({action:'tab',tab:kind,readOnly:true})).done)return;await call({action:'tab',tab:kind});await poll(()=>call({action:'tab',tab:kind,readOnly:true}));};
 const tabs=()=>transport?transport({action:'tabs'}):chrome.tabs.query({url:'https://unipass.customs.go.kr/*'});
 async function popup(q){
  await call({action:'lookup_open',...q});
  let found;
  await poll(async()=>{const matches=[];for(const t of await tabs()){
   if(t.id===tabId||t.openerTabId!==undefined&&t.openerTabId!==tabId)continue;
   try{const r=await call({action:'popup_probe',...q},t.id,true);if(r.ready)matches.push(t);}catch{}
  }if(matches.length>1)throw Error('연결된 조회창이 여러 개입니다. 하나만 남겨주세요.');found=matches[0];return {done:!!found};});
  if(q.process)await call({action:'process_choose',...q},found.id);
  else{await call({action:'popup_query',...q},found.id);await poll(()=>call({action:'popup_choose',...q},found.id));}
 }
 const lookup=async(name,q,{transientResult=false}={})=>{
  const action=transientResult?transient:step;
  return action(name,()=>call({action:'lookup_read',...q}),()=>popup({...q,lookupKey:state.session+':'+name}));
 };
 // Keep the same empty form and session across pauses. Never navigate an existing filled form away.
 if(!state.application){
  await persist();for(let n=0;n<3;n++){const r=await call({action:'navigate'});if(r.done)break;await delay(900);}
  const binding=await call({action:'bind'});if(!binding.application)throw Error('빈 수입식품 신고서를 연 뒤 이어하기를 눌러주세요.');state.application=binding.application;await persist();
 }
 await call({action:'guard'});
 const b=job.basic;
 await tab('common');
 const category=[{label:'신고제품구분',value:b.신고제품구분}];
 if(state.steps['신고제품구분 선택']?.status!=='done'&&!(await call({action:'fields_read',fields:category})).done){
  await call({action:'category_guard'});const watcher=await categoryDialog(tabId,log);try{await fields('신고제품구분 선택',category);}finally{await watcher.stop();}
 }else await fields('신고제품구분 선택',category);
 await fields('신청인·신고기관 입력',[{label:'신고기관',value:b.신고기관},{label:'신청인전화',value:b.신청인전화},{label:'신청인휴대폰',value:b.신청인휴대폰}]);
 await fields('대행업체 사업자번호 입력',[{section:'수입신고대행업체',label:'사업자등록번호',value:b.대행업체사업자번호}]);
 await lookup('대행업체 허가 조회',{section:'수입신고대행업체',label:'허가(등록,신고)번호',fields:[['사업자등록번호',b.대행업체사업자번호]],code:b.대행업체허가번호});
 await fields('수입화주 사업자번호 입력',[{label:'수입화주사업자번호',value:b.수입화주사업자번호}]);
 await lookup('수입화주 허가 조회',{suffix:'impOwrPermDclrNo',label:'허가(등록,신고)번호',section:'수입신고인(수입화주)',fields:[['사업자등록번호',b.수입화주사업자번호]],code:b.화주허가번호});
 await fields('화주 알림번호 입력',[{section:'수입신고인(수입화주)',label:'휴대폰번호',value:b.화주휴대폰}]);
 await lookup('해외제조업소 조회',{suffix:'mnfcCoPermDclrNo',section:'해외제조업소(해외작업장)',label:'등록번호',fields:[[['등록번호','해외제조업소등록번호'],b.제조업소등록번호]],code:b.제조업소등록번호,name:b.제조업소명});
 await lookup('검사장소 조회',{suffix:'inscBrngFdmcSfkpWrhsCd',label:'보관창고코드',fields:[[['보관창고코드','창고코드'],b.보관창고코드]],code:b.보관창고코드});
 if(b.검사기관코드)await lookup('검사기관 조회',{label:'검사기관',fields:[[['검사기관코드','기관코드'],b.검사기관코드]],code:b.검사기관코드});
 await tab('items');
 await fields('품목 공통정보 입력',[{label:['세번부호(HSK번호)','HSK번호','HSK'],value:b.HSK},{label:'수량단위',value:''}]);
 await lookup('총수량 단위 조회',{label:'총수량',fields:[['단위코드',job.items[0].수량단위]],code:job.items[0].수량단위,unit:true});
 const representative=representativeItem(job.items);
 for(const [i,item]of job.items.entries()){
  const name=`품목 ${i+1} 추가`;
  // A committed row is the completion proof. Editor fields are reset by UNI-PASS after adding.
  const check=()=>call({action:'items_read',items:job.items,minimum:i+1});
  if((await check()).done){await step(name,check,()=>{});continue;}
  await lookup(`품목 ${i+1} 화물 조회`,{suffix:'cargMtNoPrlst1',cargo:item},{transientResult:true});
  await fields(`품목 ${i+1} 정보 입력`,['제품명','한글명','수량','순중량kg','금액USD','제조일자','소비기한'].map(label=>({label,value:item[label]})));
  await step(name,check,()=>call({action:'item_add',key:name,count:i,item,representative:i===representative}));
 }
 await tab('common');
 for(const [label,key,aliases]of [['용도','용도',['용도코드','코드']],['생산국(제조국)','생산국',['국가코드','코드']],['수출국','수출국',['국가코드','코드']],['국내도착항','국내도착항',['항구코드','항구부호','코드']],['선적항','선적항',['항구코드','항구부호','코드']]])if(b[key])await lookup(key+' 조회',{label,fields:[[aliases,b[key]]],code:b[key]});
 await fields('신고일반 입력',['선적일','반입일','선기명','구성제품 수량','수입신고 참고사항'].filter(label=>b[label]).map(label=>({label,value:b[label]})));
 const choices=Object.fromEntries(GENERAL_CHOICES.filter(k=>b[k]).map(k=>[k,b[k]]));if(b.제품상태)choices.제품상태=b.제품상태.split('|').map(s=>s.trim());
 if(Object.keys(choices).length)await step('신고일반 선택사항',()=>call({action:'choices_read',values:choices}),()=>call({action:'choices_write',values:choices}),{idempotent:true});
 await tab('types');
 for(const [i,type]of job.types.entries()){
  await step(`제품유형 ${i+1} 행`,()=>call({action:'grid_read',grid:'types',minimum:i+1}),async()=>{const r=await call({action:'grid_read',grid:'types',count:i});if(!r.done)throw Error('제품유형 행 수가 예상과 다릅니다.');await call({action:'grid_add',grid:'types',key:`type:${i}`,count:i});});
  await lookup(`제품유형 ${i+1} 조회`,{grid:'types',index:i,fields:[['제품유형코드',type.제품유형코드]],code:type.제품유형코드,name:type.제품유형명});
 }
 if(!(await call({action:'grid_read',grid:'types',count:job.types.length})).done)throw Error('예상하지 않은 제품유형 행이 있습니다.');
 await tab('labels');await poll(()=>call({action:'notice',kind:'label'}));
 for(const [i,row]of job.labels.entries()){
  await step(`표시사항 ${i+1} 행`,()=>call({action:'grid_read',grid:'labels',minimum:i+1}),()=>call({action:'grid_add',grid:'labels',count:i,key:`label:${i}`}));
  const values=[row.표시사항코드,row.명칭,row.내용];await step(`표시사항 ${i+1} 입력`,()=>call({action:'label_read',index:i,values}),()=>call({action:'label_write',index:i,values}),{idempotent:true});
 }
 if(!(await call({action:'grid_read',grid:'labels',count:job.labels.length})).done)throw Error('예상하지 않은 표시사항 행이 있습니다.');
 await tab('processes');const codes=[...job.processes].sort((a,b)=>Number(a.순서)-Number(b.순서)).map(r=>r.공정코드);
 await step('제조공정 등록',()=>call({action:'grid_read',grid:'processes',codes}),async()=>{
  await transient('제조공정 선택',()=>call({action:'process_editor',codes}),()=>popup({process:true,codes,lookupKey:state.session+':process'}));
  if(!(await call({action:'process_editor',codes})).done)throw Error('추가할 공정 순서가 달라졌습니다.');await call({action:'process_add',key:'process-add'});
 });
 await tab('ingredients');
 const plan=ingredientPlan(job.ingredients),resolved=new Map();
 async function resolveCompleted(){
  const actual=(await call({action:'ingredients_read'})).rows;resolved.clear();
  for(const expected of plan){const parent=expected.상위성분ID?resolved.get(expected.상위성분ID)?.sequence:'';if(parent===undefined)continue;
   const matches=actual.filter(a=>a.code===expected.성분코드&&a.parent===parent&&a.kind.replace(/성분/g,'')===expected.구분);if(matches.length>1)throw Error('같은 상위 성분에 동일 코드가 여러 개입니다.');if(matches.length)resolved.set(expected.성분ID,matches[0]);
  }return actual;
 }
 for(const [i,row]of plan.entries()){
  await resolveCompleted();const parent=row.상위성분ID?resolved.get(row.상위성분ID)?.sequence:'';if(parent===undefined)throw Error('상위 성분 반영을 확인하지 못했습니다.');
  const name=`성분 ${row.성분ID} 행`;
  const readRow=async()=>{const actual=await resolveCompleted();const existing=resolved.get(row.성분ID);if(existing)return {done:true,proof:existing};
   const blanks=actual.filter(a=>!a.code&&a.parent===parent&&a.kind.replace(/성분/g,'')===row.구분);if(blanks.length>1)throw Error('미입력 성분 행이 여러 개입니다.');return {done:blanks.length===1,proof:blanks[0]||{count:actual.length}};};
  await step(name,readRow,async()=>{await call({action:'ingredient_add',count:i,parent,kind:row.구분,key:name});});
  const current=(await readRow()).proof;
  await lookup(`성분 ${row.성분ID} 코드`,{grid:'ingredients',sequence:current.sequence,fields:[['식약성분코드',row.성분코드]],code:row.성분코드,name:row.성분명});
  await resolveCompleted();const target=resolved.get(row.성분ID);if(!target)throw Error('성분 연결을 확인하지 못했습니다.');
  const args={sequence:target.sequence,parent:target.parent,code:row.성분코드,value:row.배합비율};await step(`성분 ${row.성분ID} 배합비`,()=>call({action:'ratio_read',...args}),()=>call({action:'ratio_write',...args}),{idempotent:true});
 }
 const finalIngredients=await resolveCompleted();if(finalIngredients.length!==plan.length||resolved.size!==plan.length)throw Error('성분 목록에 예상하지 않은 행이나 연결이 있습니다.');
 // Conditional ingredient product classification is entered after children make it editable.
 for(const row of plan.filter(r=>r.제품구분)){await resolveCompleted();const target=resolved.get(row.성분ID);const args={sequence:target.sequence,code:row.성분코드,value:row.제품구분};await step(`성분 ${row.성분ID} 제품구분`,()=>call({action:'ingredient_detail_read',...args}),()=>call({action:'ingredient_detail_write',...args}),{idempotent:true});if(row.품목유형코드)await lookup(`성분 ${row.성분ID} 품목유형`,{grid:'ingredients',sequence:target.sequence,detail:true,fields:[['제품유형코드',row.품목유형코드]],code:row.품목유형코드,name:row.품목유형명});}
 await tab('attachments');await poll(()=>call({action:'notice',kind:'attachment'}));
 for(const {slot,file,meta}of attachments)await step(`첨부 ${slot+1}: ${file.name}`,()=>call({action:'file_read',slot,meta}),async()=>{
  await call({action:'file_begin',slot,meta});const data=new Uint8Array(await file.arrayBuffer());
  for(let offset=0;offset<data.length;offset+=131072){let raw='';for(const byte of data.subarray(offset,offset+131072))raw+=String.fromCharCode(byte);await call({action:'file_chunk',slot,offset,data:btoa(raw)});}await call({action:'file_commit',slot});
 },{idempotent:true});
 // Validation is harmless to repeat after an interrupted result dialog. Sending is never a pipeline step.
 const snapshot=(await call({action:'snapshot'})).snapshot;
 if(state.validatedSnapshot!==snapshot){
  const watcher=await watchDialog(tabId,'validate',log);try{watcher.arm();await call({action:'final_click',label:'오류검증',key:'validate:'+crypto.randomUUID()});const result=await watcher.finished;if(result?.classification!=='success')throw Error('오류검증 결과를 확인해주세요. 입력 자료와 진행 기록은 보존했습니다.');state.validatedSnapshot=(await call({action:'snapshot'})).snapshot;await persist();}finally{await watcher.stop();}
 }
 onState('입력·첨부·오류검증 완료. 유니패스에서 검토 후 전송할 수 있습니다.');return state;
}
