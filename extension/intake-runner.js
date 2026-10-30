import {intakeDOM} from './intake-dom.js';
import {watchFinalDialog} from './final-dialog.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function runNewIntake({job,tabId,files,log,onState}){
 const key='visionNewRun:'+job.id,signature=JSON.stringify(job);
 let state=(await chrome.storage.local.get(key))[key];
 if(state&&(state.signature!==signature||state.tabId!==tabId))throw Error('진행 중인 작업과 자료 또는 연결 화면이 달라졌습니다. 새 작업으로 시작해주세요.');
 state??={session:crypto.randomUUID(),signature,tabId,done:[],pending:null,application:null};
 const persist=()=>chrome.storage.local.set({[key]:state});
 const call=async(q,target=tabId)=>{
  let timer;const results=await Promise.race([chrome.scripting.executeScript({target:{tabId:target},func:intakeDOM,args:[{session:state.session,application:state.application,...q}]}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('화면 응답 시간이 지났습니다. 진행 기록을 보존했습니다.')),15000);})]).finally(()=>clearTimeout(timer));
  const r=results.find(r=>r.frameId===0)?.result;if(!r||r.status==='blocked')throw Error(r?.reason||'화면 응답을 확인하지 못했습니다.');return r;
 };
 const poll=async(fn)=>{const end=Date.now()+12000;do{const r=await fn();if(r.status!=='waiting')return r;await delay(250);}while(Date.now()<end);throw Error('조회 또는 입력 결과를 확인하지 못했습니다.');};
 const step=async(name,fn)=>{
  if(state.done.includes(name)){if(state.application)await call({action:'read'});return;}
  if(state.pending)throw Error('이전 동작 결과를 확인해야 합니다: '+state.pending+' · 중복 추가하지 않았습니다.');
  log(name);onState(name);state.pending=name;await persist();await fn();state.done.push(name);state.pending=null;await persist();
 };
 const lookup=async({label,suffix,fields,code,name,path})=>{
  const before=await chrome.tabs.query({url:'https://unipass.customs.go.kr/*'});
  await call({action:'lookup',label,suffix});
  let popup;await poll(async()=>{const all=await chrome.tabs.query({url:'https://unipass.customs.go.kr/*'});const found=all.filter(t=>!before.some(b=>b.id===t.id)&&(t.openerTabId===undefined||t.openerTabId===tabId)&&(!path||new URL(t.url).pathname===path));if(found.length>1)throw Error('조회창이 여러 개입니다.');popup=found[0];return {status:popup?'found':'waiting'};});
  const popupPath=new URL(popup.url).pathname;
  await call({action:'popup_query',fields,popupPath},popup.id);
  await poll(()=>call({action:'popup_select',code,name,popupPath},popup.id));
  await poll(async()=>({status:(await chrome.tabs.query({url:'https://unipass.customs.go.kr/*'})).some(t=>t.id===popup.id)?'waiting':'closed'}));
 };
 // The first action opens an empty form; no existing declaration is replaced.
 if(!state.application){await step('빈 신청서 열기',async()=>{await call({action:'open_new'});await delay(500);state.application=(await call({action:'bind'})).application;});}
 await step('제품구분 선택',()=>call({action:'fields',fields:{신고제품구분:job.basic.신고제품구분}}));
 await step('기본정보 입력',()=>call({action:'fields',fields:{신고구분:'본신고',신고기관:job.basic.신고기관,신청인전화:job.basic.신청인전화,신청인휴대폰:job.basic.신청인휴대폰}}));
 const b=job.basic;
 await step('대행업체 조회',()=>lookup({label:'허가(등록,신고)번호',fields:{사업자등록번호:b.대행업체사업자번호},code:b.대행업체허가번호}));
 await step('수입화주 입력',()=>call({action:'fields',fields:{수입화주사업자번호:b.수입화주사업자번호}}));
 await step('수입화주 조회',()=>lookup({suffix:'impOwrPermDclrNo',fields:{사업자등록번호:b.수입화주사업자번호},code:b.화주허가번호}));
 await step('해외제조업소 조회',()=>lookup({suffix:'mnfcCoPermDclrNo',fields:{등록번호:b.제조업소등록번호},code:b.제조업소등록번호,name:b.제조업소명}));
 await step('검사장소 조회',()=>lookup({suffix:'inscBrngFdmcSfkpWrhsCd',fields:{창고코드:b.보관창고코드},code:b.보관창고코드,path:'/csp/csw/infomt/cdmt/openCSW0302065Q.do'}));
 if(b.검사기관코드)await step('검사기관 조회',()=>lookup({label:'검사기관',fields:{검사기관코드:b.검사기관코드},code:b.검사기관코드}));
 await step('품목사항 열기',()=>call({action:'tab',label:'품목사항'}));
 if(b.HSK)await step('HSK 입력',()=>call({action:'fields',fields:{'세번부호(HSK번호)':b.HSK}}));
 for(const [index,item]of job.items.entries()){
  await step(`${index+1}번 화물 연결`,async()=>{
   await lookup({suffix:'cargMtNoPrlst1',fields:{조회구분:'화물관리번호'},code:item.화물관리번호,path:'/csp/myc/comn/ComnCdCtr/openMYC0801008Q.do'});
   await poll(()=>call({action:'cargo_check',cargo:item.화물관리번호,hbl:item.HBL}));
  });
  await step(`${index+1}번 품목 입력`,()=>call({action:'fields',fields:Object.fromEntries(['제품명','한글명','수량','순중량kg','금액USD','소비기한'].map(k=>[k,item[k]]))}));
  await step(`${index+1}번 품목 추가`,async()=>{await call({action:'item_add',index,expectedCount:index});await poll(()=>call({action:'item_verify',expectedCount:index+1,values:[item.제품명,item.화물관리번호,item.소비기한]}));});
 }
 await step('공통사항 열기',()=>call({action:'tab',label:'공통사항'}));
 await step('신고일반 입력',async()=>{
  for(const [label,key]of [['용도','용도'],['생산국(제조국)','생산국'],['수출국','수출국'],['국내도착항','국내도착항'],['선적항','선적항']])if(b[key])await lookup({label,fields:{코드:b[key]},code:b[key]});
  await call({action:'fields',fields:Object.fromEntries(['선적일','반입일','선기명'].filter(k=>b[k]).map(k=>[k,b[k]]))});
 });
 await step('복합구성제품 열기',()=>call({action:'tab',label:'복합구성제품'}));
 for(const [index,type]of job.types.entries())await step(`${index+1}번 제품유형 등록`,async()=>{
  await call({action:'grid_add',table:'cmpsPrdtTbl',expectedRows:index});
  await gridLookup('cmpsPrdtTbl',index,{제품유형코드:type.제품유형코드},type.제품유형코드,type.제품유형명);
 });
 async function gridLookup(table,index,fields,code,name){
  const before=await chrome.tabs.query({url:'https://unipass.customs.go.kr/*'});await call({action:'grid_lookup',table,index});
  let popup;await poll(async()=>{const found=(await chrome.tabs.query({url:'https://unipass.customs.go.kr/*'})).filter(t=>!before.some(b=>b.id===t.id)&&(t.openerTabId===undefined||t.openerTabId===tabId));if(found.length>1)throw Error('조회창이 여러 개입니다.');popup=found[0];return {status:popup?'found':'waiting'};});
  const popupPath=new URL(popup.url).pathname;await call({action:'popup_query',fields,popupPath},popup.id);await poll(()=>call({action:'popup_select',code,name,popupPath},popup.id));
 }
 await step('한글표시사항 열기',()=>call({action:'tab',label:'한글표시사항정보'}));
 await step('표시사항 안내 확인',()=>call({action:'notice',kind:'label'}));
 for(const [index,r]of job.labels.entries())await step(`${index+1}번 표시사항 입력`,async()=>{
  await call({action:'grid_add',table:'koreIndcMatrTbl',expectedRows:index});await call({action:'grid_fields',table:'koreIndcMatrTbl',index,values:[r.표시사항코드,r.명칭,r.내용]});
 });
 await step('제조공정 열기',()=>call({action:'tab',label:'제조/가공공정'}));
 await step('제조공정 등록',async()=>{
  const before=await chrome.tabs.query({url:'https://unipass.customs.go.kr/*'});await call({action:'process_open'});
  let popup;await poll(async()=>{popup=(await chrome.tabs.query({url:'https://unipass.customs.go.kr/*'})).find(t=>!before.some(b=>b.id===t.id)&&new URL(t.url).pathname.endsWith('/openCSW0302013Q.do'));return {status:popup?'found':'waiting'};});
  await call({action:'process_select',codes:[...job.processes].sort((a,b)=>Number(a.순서)-Number(b.순서)).map(r=>r.공정코드)},popup.id);await call({action:'process_add'});
  await poll(()=>call({action:'grid_verify',table:'mnfcProgTbl',values:job.processes.map(r=>r.공정코드)}));
 });
 await step('성분 열기',()=>call({action:'tab',label:'성분/재질'}));
 for(const [index,r]of job.ingredients.entries())await step(`${index+1}번 성분 등록`,async()=>{
  await call({action:'ingredient_add',kind:r.구분,parentIndex:r.상위성분ID?job.ingredients.findIndex(p=>p.성분ID===r.상위성분ID):null});
  await gridLookup('mnigTbl',index,{식약성분코드:r.성분코드},r.성분코드,r.성분명);await call({action:'ingredient_ratio',code:r.성분코드,value:r.배합비율});
 });
 await step('첨부파일 열기',()=>call({action:'tab',label:'첨부파일'}));await step('첨부 안내 확인',()=>call({action:'notice',kind:'attachment'}));
 for(const {slot,file}of files)await step('첨부 '+slot+' '+file.name,async()=>{
  const data=new Uint8Array(await file.arrayBuffer()),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(v=>v.toString(16).padStart(2,'0')).join('');
  await call({action:'file_begin',slot,name:file.name,type:file.type,size:file.size,sha256});
  for(let i=0;i<data.length;i+=131072){let raw='';for(const b of data.subarray(i,i+131072))raw+=String.fromCharCode(b);await call({action:'file_chunk',slot,data:btoa(raw),offset:i});}
  await call({action:'file_commit',slot});
 });
 await step('오류검증',async()=>{const watcher=await watchFinalDialog(tabId,'validate',log);try{watcher.arm();await call({action:'validate'});const result=await watcher.finished;if(result?.classification!=='success')throw Error('오류검증 결과를 확인해야 합니다.');}finally{await watcher.stop();}});
 onState('입력·첨부·오류검증 완료. 유니패스에서 검토 후 전송하세요.');return state;
}
