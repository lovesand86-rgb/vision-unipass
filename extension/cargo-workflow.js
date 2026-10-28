import {createPhotoPicker} from './photo-picker.js';
import {guardToolNavigation} from './assist-navigation.js';
import {cargoStep} from './cargo-step.js';
import * as targets from './cargo-target.js';
import {itemCommitStep} from './item-commit.js';
import {runCommonSequence,saveSequenceContact} from './common-sequence.js';
import {createFollowup} from './followup-controller.js';
import {readCommonData} from './common-data.js';
import {openCommonTab} from './common-navigation.js';
import {followupStep} from './followup-step.js';
import {createFinalActions} from './final-controller.js';
const {cargoTarget,itemTarget,commonTarget,followupTarget}=targets;
const $ = id => document.getElementById(id);
const target = Number(new URL(location.href).searchParams.get('tab'));
// Exact pathname captured in the user's progress export (2026-10-28).
const popupPath = '/csp/myc/comn/ComnCdCtr/openMYC0801008Q.do';
const key = 'visionCargoAttemptV1';
let job = cargoTarget, busy = false, contactSnapshot=null, activeStage='item', itemRepair=null, finalActions=null,lastError='';
const phaseNames={item:'품목·화물',common:'공통사항',shipment:'선적일',entry:'반입일',contact:'연락처',warehouse:'창고·기관',product:'제품상태',photos:'사진'};
const photos=createPhotoPicker($('photo-picker'),()=>refreshPhotoAction());
function refreshPhotoAction(){$('followup-run').hidden=!photos.ready()||!followup||$('stage-item').textContent!=='확인 완료';}
const stage=(key,value)=>{activeStage=key;const node=$('stage-'+key);if(node)node.textContent=value;if(busy)$('cargo-status').textContent=(phaseNames[key]||'입력')+' · '+value;};
const log = message => { const li = document.createElement('li'); li.textContent = message; $('cargo-log').append(li); };
const refresh = () => { $('start-cargo').disabled = busy || !job; $('check-cargo').disabled = busy || !job; $('cargo-file').disabled = busy;
  for(const id of ['sequence-phone','sequence-mobile'])$(id).disabled=busy;
  $('sequence-save-contact').disabled=busy||!contactSnapshot;
  for(const id of ['followup-run','warehouse-only-run','save-product-rule','states-ack'])$(id).disabled=busy;
  $('export-progress').disabled=busy;
  finalActions?.refresh(busy||!job||!commonForThisJob());
  $('final-panel').hidden=!job||!commonForThisJob();
  photos.setBusy(busy);refreshPhotoAction();$('start-cargo').textContent=busy?'입력 중…':'입력 시작·이어하기';
  $('review-form').disabled=busy;
  $('review-form').hidden=$('stage-item').textContent!=='확인 완료';
};
const summary = () => {
  if (!job || job.format !== 'vision-unipass-cargo-job' || job.version !== 1 || !job.identity || !job.cargo) { job = null; $('cargo-summary').textContent = ''; log('화물 연결 작업 파일이 필요합니다.');$('cargo-status').textContent='작업 파일을 선택해주세요.'; refresh(); return; }
  $('cargo-summary').textContent = job.identity.product_name+'\n'+job.cargo.hbl;
  $('cargo-status').textContent='시작하면 준비된 값을 입력합니다.';refresh();
};
const tabs = () => chrome.tabs.query({url:'https://unipass.customs.go.kr/*'});
const isPopup = tab => { try { return new URL(tab.url).pathname === popupPath; } catch { return false; } };
const fingerprint = async () => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(job))))].map(b=>b.toString(16).padStart(2,'0')).join('');
const save = record => chrome.storage.local.set({[key]:record});
const call = async (tabId, action, token, extra={}, func=cargoStep, payload=job, timeout=15000) => {
  let timer;
  try {
    const frames = await Promise.race([
      chrome.scripting.executeScript({target:{tabId,frameIds:[0]},func,args:[{action,job:payload,token,...extra}]}),
      new Promise((_,reject)=>{ timer=setTimeout(()=>reject(new Error('화면 응답 시간이 지났습니다. 열린 알림창 또는 현재 화면을 확인해 주세요.')),timeout); })
    ]);
    const frame = frames.find(f=>f.frameId===0);
    if (frame?.error) throw new Error(frame.error.message || '화면 실행 오류');
    if (!frame?.result) throw new Error('화면 응답을 받지 못했습니다.');
    if (frame.result.status === 'blocked') {const error=new Error(frame.result.reason);error.blockedBeforeAction=frame.result.before_action===true;throw error;}
    return frame.result;
  } finally { clearTimeout(timer); }
};
const poll = async (fn, ms=15000, message='화면 전환 또는 연결값을 확인하지 못했습니다. 자동으로 화물을 다시 선택하지 않습니다.') => {
  const until=Date.now()+ms;
  do { const result=await fn(); if (result) return result; await new Promise(r=>setTimeout(r,300)); } while(Date.now()<until);
  throw new Error(message);
};
const itemForThisJob = () => itemTarget && ['product_name','importer_id','manufacturer_id'].every(k=>itemTarget.identity[k]===job.identity[k]) && itemTarget.identity.bl===job.cargo.hbl && itemTarget.identity.cargo_mt_no===job.cargo.cargo_mt_no;
const commonForThisJob=()=>itemForThisJob()&&commonTarget&&['product_name','importer_id','manufacturer_id','bl','cargo_mt_no'].every(k=>commonTarget.identity?.[k]===itemTarget.identity[k]);
const invokeCommon=(func,arg,tabId=target)=>call(tabId,null,null,arg,func,null,arg.action==='lookup'?90000:15000);
const followup=followupTarget?.enabled?createFollowup({invoke:invokeCommon,log,stage,target:followupTarget,tabId:target,getPhotos:()=>{if(photos.count()&&!photos.ready())throw Error('사진에서 한글표시와 제품 전면을 골라주세요.');return photos.files();}}):null;
if(commonTarget)finalActions=createFinalActions({invoke:invokeCommon,identity:commonTarget.identity,tabId:target,log,
  runExclusive:async task=>{
    if(busy||!job||!commonForThisJob())return;
    busy=true;refresh();
    try{await navigator.locks.request('vision-unipass-search-copy',{ifAvailable:true},async lock=>{
      if(!lock)throw Error('다른 도구 작업이 끝난 뒤 다시 눌러 주세요.');
      await task();
    });}catch(error){log(error.message);}finally{busy=false;refresh();}
  }});
const onContact=s=>{contactSnapshot=s;$('sequence-contact').hidden=false;$('sequence-person').textContent='현재 신청인: '+s.context.aplcNm;
  $('sequence-phone').value=s.phone;$('sequence-mobile').value=s.mobile;};
const callItem = (action,token,extra={}) => call(target,action,token,extra,itemCommitStep,itemTarget);
async function reviewInterruptedItem(){
  if(!itemForThisJob())return;
  try{
    const r=await callItem('review',crypto.randomUUID());
    if(r.status!=='repair_review')return;
    itemRepair=r;$('item-repair').hidden=false;
    $('item-repair-values').textContent=r.rows.map(v=>`${v.matches?'일치':'불일치'} · ${v.label}\n현재: ${v.current||'(비어 있음)'} → 예정: ${v.expected}`).join('\n\n');
    const different=r.rows.filter(v=>!v.matches);
    $('item-repair-note').textContent=!different.length?'목록 값이 모두 일치합니다.':
      r.can_repair?'입력 시작·이어하기에서 현재값을 대조하고 반영합니다.':'화물 연결 또는 B/L부터 확인해야 합니다. 표시된 현재값을 알려주세요.';
    log(different.length?'품목 목록 대조 — '+different.map(v=>`${v.label}: ${v.current||'(비어 있음)'} → ${v.expected}`).join(' / '):'목록 대조값은 모두 일치합니다. 현재 신고서에서 이어하기를 다시 실행해 주세요.');
  }catch(error){log('품목 목록 재확인: '+error.message);}
}
const focusForm = async () => { const tab=await chrome.tabs.get(target); await chrome.tabs.update(target,{active:true}); await chrome.windows.update(tab.windowId,{focused:true}); };
async function finishItem(checkOnly=false) {
  if(!itemForThisJob())return false;
  stage('item','확인 중');
  const inspected=await callItem('inspect',crypto.randomUUID());
  if(inspected.status==='needs_cargo')return false;
  let result=inspected;
  if(inspected.status!=='committed'){
    let token=inspected.token;
    if(inspected.status==='ready'){
      if(checkOnly)throw new Error('화물은 연결됐지만 품목 수정 전입니다. 한 번에 입력 시작·이어하기를 누르세요.');
      token=crypto.randomUUID();
      await callItem('prepare',token);
      log('수량·중량·금액과 소비기한을 입력하고 품목 수정 버튼을 한 번 누릅니다.');
      try { await callItem('apply',token); }
      catch(error) { log('품목 수정 응답 확인 중: '+error.message+' 자동 재클릭 없이 목록을 확인합니다.'); }
    }
    result=await poll(async()=>{const r=await callItem('verify',token);return r.status==='committed'?r:null;},15000,'품목 수정 후 아래 목록의 반영값을 확인하지 못했습니다. 자동으로 수정 버튼을 다시 누르지 않습니다. 품목 목록 반영만 다시 확인을 이용해 주세요.');
  }
  log(`아래 품목 목록에서 화물번호·수량·순중량·금액·소비기한 반영을 확인했습니다.\n소비기한: ${itemTarget.fields.expiry_date.value} / 수량: ${itemTarget.fields.cartons.value} / 순중량: ${itemTarget.fields.net_kg.value} kg / 금액: ${itemTarget.fields.amount_usd.value} USD\n품목 수정까지 완료했습니다. 임시저장·전송은 하지 않았습니다.`);
  stage('item','확인 완료');
  if(!checkOnly&&commonForThisJob()){
    const common=await runCommonSequence({invoke:invokeCommon,job:commonTarget,applicationRef:result.application_ref,log,stage,onContact});
    let additional=null;
    if(followup){
      additional=await followup.process(common.snapshot,common.entry_record||(typeof common.entry==='object'?common.entry:null));
    }
    if(additional?.form_unavailable){log('후속 입력 보류: '+additional.pending.join(' / '));return true;}
    if(common.status==='needs_contact'){log('담당자 연락처 확인이 필요합니다.'+(additional?.pending.length?' 남은 확인: '+additional.pending.join(' / '):'')+(common.entry_error?' 반입일 미완료: '+common.entry_error:''));return true;}
    // Common events must not silently change the already committed item.
    const item=await callItem('inspect',crypto.randomUUID());
    const verified=item.status==='check_only'?await callItem('verify',item.token):item;
    if(verified.status!=='committed')throw Error('공통사항 입력 후 품목 목록이 바뀌었습니다.');
    $('sequence-contact').hidden=true;
    log(common.status==='common_partial'?`품목·선적일·연락처는 확인했습니다. 반입일 미완료: ${common.entry_error}`:`품목·선적일·반입일·신청인 연락처 입력과 최종 대조를 마쳤습니다.\n선적일 ${common.shipment} / 반입일 ${common.entry}\n공통사항 값 확인 완료. 오류검증·임시저장·전송은 하지 않았습니다.`);
    if(additional)log((common.entry_error?'반입일 미완료: '+common.entry_error+'\n':'')+(additional.pending.length?'남은 확인: '+additional.pending.join(' / '):'신고기관·제품상태·사진 선택 반영을 확인했습니다. 한글표시 내용은 사람이 직접 확인·수정해 주세요.')+'\n오류검증·임시저장·전송은 하지 않았습니다.');
    if(additional?.pending.length||common.entry_error)return true;
  }
  await focusForm();return true;
}
const verify = async (record,checkOnly=false) => {
  if (record.stage === 'selection_requested' && !record.selectionReturned) {
    if (!record.popup || (await tabs()).some(t=>t.id===record.popup)) throw new Error('화물 선택 응답을 확인하지 못했고 조회창이 아직 열려 있습니다. 현재 조회창을 확인해 주세요. 자동 재선택하지 않습니다.');
  }
  await poll(async()=> (await call(target,'verify',record.token)).status==='connected');
  await save({...record,stage:'connected'});
  if(await finishItem(checkOnly))return;
  log('품목 선택과 화물 연결값 확인을 마쳤습니다. 수량·금액·소비기한 입력, 품목 수정 반영, 임시저장·전송은 아직 하지 않았습니다.');
  const tab=await chrome.tabs.get(target); await chrome.tabs.update(target,{active:true}); await chrome.windows.update(tab.windowId,{focused:true});
};
async function run(checkOnly=false,repairToken=null) {
  if (busy || !job) return;
  busy=true;lastError='';activeStage='item';refresh();
  try {
    await navigator.locks.request('vision-unipass-search-copy',{ifAvailable:true},async lock=>{
      if (!lock) throw new Error('다른 비전 도구 작업이 끝난 뒤 실행해 주세요.');
      if (!Number.isInteger(target) || target<=0) throw new Error('신고서 탭에서 확장 도구로 열어 주세요.');
      $('sequence-contact').hidden=true;contactSnapshot=null;
      $('item-repair').hidden=true;itemRepair=null;
      if(!checkOnly&&itemForThisJob()){
        const reviewed=await callItem('review',crypto.randomUUID());
        if(reviewed.status==='repair_review'&&reviewed.rows.some(row=>!row.matches)){
          if(!reviewed.can_repair)throw Error('다른 화물이 연결되어 있어 입력을 멈췄습니다. 유니패스에서 확인해주세요.');
          repairToken=reviewed.token;log('현재 품목과 미반영 값을 대조했습니다. 같은 품목에 이어서 입력합니다.');
        }
      }
      if(repairToken){
        stage('item','확인 중');
        const selected=await poll(async()=>{const r=await callItem('repair_select',repairToken,{confirmed:true});return ['ready','needs_cargo'].includes(r.status)?r:null;},10000,'대상 품목 선택을 확인하지 못했습니다. 수정 버튼은 누르지 않았습니다.');
        if(selected.status==='needs_cargo'){

          await callItem('repair_restart',repairToken,{confirmed:true});
          await save(null);
          log('목록의 화물이 비어 있어 조회·연결부터 다시 진행합니다.');
        }else{
          await callItem('repair_prepare',repairToken,{confirmed:true});
          log('대조한 미반영 값을 입력하고 품목 수정 버튼을 한 번 누릅니다.');
          try{await callItem('apply',repairToken);}catch(error){log('수정 응답 확인 중: '+error.message+' 목록으로 결과를 확인합니다.');}
        }
      }
      if(await finishItem(checkOnly))return;
      const fp=await fingerprint();
      let record=(await chrome.storage.local.get(key))[key];
      if (checkOnly) {
        if (!record || record.target!==target || record.fingerprint!==fp || !['selection_requested','connected'].includes(record.stage)) throw new Error('이 신고서의 화물 선택 요청 기록이 없습니다.');
        await verify(record,true); return;
      }
      log('현재 복사본의 제품·수입화주·제조업소를 확인합니다.');
      const begin=await call(target,'begin',crypto.randomUUID());
      if (begin.status==='existing' && ['selection_requested','connected'].includes(begin.stage)) {
        if (begin.stage==='selection_requested' && (!record || record.target!==target || record.token!==begin.token || record.fingerprint!==fp)) throw new Error('선택 요청 기록이 불완전해 자동 재선택하지 않습니다. 현재 조회창을 확인해 주세요.');
        record={...(record?.token===begin.token?record:{}),target,fingerprint:fp,token:begin.token,stage:begin.stage}; await save(record); await verify(record); return;
      }
      if (begin.status==='existing' && begin.stage==='popup_requested' && (!record || record.target!==target || record.token!==begin.token || record.fingerprint!==fp)) throw new Error('열어둔 조회창의 작업 기록을 찾지 못했습니다. 자동으로 조회창을 더 열지 않습니다.');
      record = begin.stage==='popup_requested' ? record : {target,fingerprint:fp,token:begin.token,stage:'begun'};
      await save(record);
      if (begin.stage!=='popup_requested') {

        log('품목사항 탭을 열고 대상 제품을 선택합니다.');
        await call(target,'item_tab',record.token);
        await poll(async()=> (await call(target,'item_select',record.token)).status==='item_selected');
        const existing=(await tabs()).filter(t=>isPopup(t)&&(t.openerTabId===target));
        if(existing.length>1)throw Error('이 신청서의 화물 조회창이 여러 개 열려 있습니다. 하나만 남겨주세요.');
        record={...record,stage:'popup_requested',before:(await tabs()).map(t=>t.id),...(existing.length?{popup:existing[0].id}:{})};await save(record);
        log(existing.length?'열린 화물 조회창에서 계속합니다.':'화물관리번호 조회창을 엽니다.');
        await call(target,'open_popup',record.token,{reuse_popup:existing.length===1});
      }
      let popup;
      if (record.popup) {
        popup=(await tabs()).find(t=>t.id===record.popup && isPopup(t));
        if (!popup) throw new Error('작업 중이던 조회창이 닫혔습니다. 연결 결과를 확인해 주세요.');
      } else {
        popup=await poll(async()=>{
          const found=(await tabs()).filter(t=>isPopup(t) && !record.before.includes(t.id) && (t.openerTabId===undefined || t.openerTabId===target));
          if (found.length>1) throw new Error('새로 열린 화물조회창이 여러 개여서 선택하지 않았습니다.');
          return found[0];
        },15000,'화물 조회창을 찾지 못했습니다. 열린 창의 주소를 기록과 함께 확인해주세요.');
        record={...record,popup:popup.id};await save(record);
      }
      await poll(async()=> (await call(popup.id,'popup_ready',record.token)).status==='ready',15000,'화물 조회창의 입력칸이 준비되지 않았습니다.');
      log('H B/L과 연도를 입력하고 조회합니다.');
      await call(popup.id,'popup_search',record.token);
      const match=await poll(async()=>{const r=await call(popup.id,'popup_result',record.token);return r.status==='matched'?r:null;});
      log('화물관리번호·M B/L·H B/L이 모두 일치합니다. 해당 화물을 한 번 선택합니다.');
      const marked=await call(target,'mark_selection',record.token); // Rechecks identity, application and protected fields.
      record={...record,stage:'selection_requested'};await save(record);
      try {
        const selected=await call(popup.id,'popup_select',record.token,{signature:match.signature,parent_guard:marked.parent_guard});
        if (selected.status!=='selection_requested') throw new Error('화물 선택 응답을 확인하지 못했습니다.');
        record={...record,selectionReturned:true};await save(record);
      }
      catch(error) {
        // Only a closed popup can explain a lost response; a live popup guard
        // failure must never be treated as successful because old values match.
        if ((await tabs()).some(t=>t.id===popup.id)) throw error;
        log('조회창이 닫혔습니다. 재선택 없이 신고서 연결값을 확인합니다.');
      }
      await verify(record);
    });
  } catch(error) { lastError=error.message;const stopped=activeStage;stage(stopped,'중단');log(error.message || '진행을 중단했습니다.');if(stopped==='item')await reviewInterruptedItem(); }
  finally { busy=false;refresh();showResult(); }
}
function showResult(){
 const pending=Object.keys(phaseNames).filter(k=>!$('stage-'+k).textContent.includes('완료')&&!$('stage-'+k).textContent.includes('반영 확인')&&!$('stage-'+k).textContent.includes('기존 파일 선택 확인'));
 $('cargo-status').textContent=lastError||($('stage-item').textContent==='확인 완료'?(pending.length?'입력된 내용을 검토하세요. 남은 항목: '+pending.map(k=>phaseNames[k]).join(' · '):'입력을 마쳤습니다. 유니패스에서 검토하세요.'):'입력할 자료를 준비하고 시작하세요.');
 $('cargo-status').classList.toggle('warning',!!lastError);
}
$('review-form').addEventListener('click',()=>focusForm().catch(error=>{$('cargo-status').textContent=error.message;}));
$('start-cargo').addEventListener('click',()=>run());
$('check-cargo').addEventListener('click',()=>run(true));
$('cargo-file').addEventListener('change',async()=>{
  try {
    const file=$('cargo-file').files[0]; if (!file || file.size>100000) throw new Error('100KB 이하의 화물 연결 작업 JSON을 선택해 주세요.');
    job=JSON.parse(await file.text());summary();
  } catch(error) {job=null;log(error.message);$('cargo-status').textContent=error.message;refresh();}
});
summary();
$('export-progress').addEventListener('click',async()=>{
  if(busy)return;
  $('export-progress').disabled=true;
  try{
    let diagnostics;
    try{diagnostics=await invokeCommon(followupStep,{action:'diagnostics'});}catch(error){diagnostics={error:error.message};}
    const report={format:'vision-unipass-progress',version:1,created_at:new Date().toISOString(),tool:'VISION ASSIST · 실적 기반 입력',app_version:chrome.runtime.getManifest().version,
      browser:{target_tab:target,popups:(await tabs()).filter(t=>t.id!==target).flatMap(t=>{try{return [{id:t.id,opener_tab:t.openerTabId,path:new URL(t.url).pathname}];}catch{return [];}})},
      stages:Object.fromEntries(['item','common','shipment','entry','contact','warehouse','product','label','photos'].map(k=>[k,$('stage-'+k).textContent])),
      log:[...$('cargo-log').children].map(n=>n.textContent),final_actions:finalActions?.report(),diagnostics};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='vision-progress-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){log('진행결과 저장 실패: '+error.message);}
  finally{refresh();}
});
async function readBoundSnapshot(){
  const inspected=await callItem('inspect',crypto.randomUUID());
  const item=inspected.status==='check_only'?await callItem('verify',inspected.token):inspected;
  if(item.status!=='committed')throw Error('품목 목록의 반영값을 먼저 확인해야 합니다. 한 번에 입력 시작·이어하기를 이용해 주세요.');
  await invokeCommon(openCommonTab,{application_ref:item.application_ref,identity:commonTarget.identity});
  const snapshot=await poll(async()=>{
    try{return (await invokeCommon(readCommonData,{action:'read'})).snapshot;}
    catch(error){if(error.message.includes('공통사항 탭'))return null;throw error;}
  },5000,'후속 작업 대상 신고서를 읽지 못했습니다.');
  const norm=v=>String(v??'').replace(/[\s-]/g,'').toUpperCase();
  if(JSON.stringify(snapshot.application_ref)!==JSON.stringify(item.application_ref)||Object.keys(commonTarget.identity).some(k=>norm(snapshot.identity[k])!==norm(commonTarget.identity[k])))throw Error('현재 신고서가 작업 대상과 다릅니다.');
  return snapshot;
}
async function runWarehouse(){
  if(busy||!followup)return;
  busy=true;refresh();
  try{
    await navigator.locks.request('vision-unipass-search-copy',{ifAvailable:true},async lock=>{
      if(!lock)throw Error('다른 도구 작업이 끝난 뒤 실행해 주세요.');
      if(!Number.isInteger(target)||target<=0||!commonForThisJob())throw Error('이번 신고서 작업 정보가 없습니다.');
      stage('warehouse','대상 확인 중');
      const snapshot=await readBoundSnapshot();
      const entry=(await invokeCommon(readCommonData,{action:'lookup',snapshot})).entry;
      const norm=v=>String(v??'').replace(/[\s-]/g,'').toUpperCase();
      if(!entry||entry.warehouse_code!==snapshot.context.inscBrngFdmcSfkpWrhsCd||norm(entry.cargo_mt_no)!==norm(snapshot.identity.cargo_mt_no)||norm(entry.bl)!==norm(snapshot.identity.bl))throw Error('이번 화물의 반입 창고를 확인하지 못했습니다.');
      const result=await followup.process(snapshot,entry,{attachments:false});
      log('창고·신고기관·제품상태 결과: '+(result.pending.length?result.pending.join(' / '):'현재값 반영 확인')+'\n품목·날짜·연락처·사진은 다시 입력하지 않았습니다. 임시저장·전송은 하지 않았습니다.');
    });
  }catch(error){stage('warehouse','확인 필요');$('cargo-status').textContent=error.message;log(error.message);}
  finally{busy=false;refresh();}
}
$('warehouse-only-run').addEventListener('click',runWarehouse);
async function runPhotos(){
  if(busy||!followup)return;
  if(!photos.ready()){$('cargo-status').textContent='사진에서 한글표시와 제품 전면을 골라주세요.';return;}
  busy=true;refresh();
  try{
    await navigator.locks.request('vision-unipass-search-copy',{ifAvailable:true},async lock=>{
      if(!lock)throw Error('다른 비전 도구 작업이 끝난 뒤 실행해 주세요.');
      stage('photos','대상 확인 중');
      if(!Number.isInteger(target)||target<=0||!commonForThisJob())throw Error('사진과 연결된 신고서 작업 정보를 확인해야 합니다.');
      let snapshot=null;
      if(!followup.hasBinding()){
        snapshot=await readBoundSnapshot();
        for(const id of ['item','common','shipment','entry','contact','warehouse','product'])if($('stage-'+id).textContent==='대기')$('stage-'+id).textContent='사진 작업에서 재실행 안 함';
      }
      log('현재 신고서를 확인하고 사진 첨부만 진행합니다.');
      const result=await followup.attachPhotos(snapshot);
      $('cargo-status').textContent='사진 첨부를 확인했습니다. 유니패스에서 검토하세요.';log('사진 작업 결과: '+(result.pending.length?result.pending.join(' / '):'파일 선택 반영 확인')+'\n한글표시 내용은 사람이 직접 확인·수정해 주세요.'+'\n오류검증·임시저장·전송은 하지 않았습니다.');
    });
  }catch(error){stage(activeStage,'중단');$('cargo-status').textContent=error.message;log(error.message);}
  finally{busy=false;refresh();}
}
$('followup-run').addEventListener('click',runPhotos);
$('save-product-rule').addEventListener('click',async()=>{
  if(busy||!followup)return;busy=true;refresh();let saved=false;
  try{await navigator.locks.request('vision-unipass-search-copy',{ifAvailable:true},async lock=>{
    if(!lock)throw Error('다른 도구 작업이 진행 중입니다.');await followup.saveRules();saved=true;
  });}catch(error){log(error.message);}finally{busy=false;refresh();}
  if(saved)await run();
});
$('sequence-save-contact').addEventListener('click',async()=>{
  if(busy||!contactSnapshot)return;
  busy=true;refresh();let saved=false;
  try{await navigator.locks.request('vision-unipass-search-copy',{ifAvailable:true},async lock=>{
    if(!lock)throw Error('다른 도구 작업이 끝난 뒤 다시 눌러 주세요.');
    await saveSequenceContact({invoke:invokeCommon,snapshot:contactSnapshot,phone:$('sequence-phone').value,mobile:$('sequence-mobile').value});saved=true;
  });}catch(error){log(error.message);}finally{busy=false;refresh();}
  if(saved)await run();
});
guardToolNavigation(()=>busy);
