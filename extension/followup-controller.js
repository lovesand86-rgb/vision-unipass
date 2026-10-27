import {followupStep} from './followup-step.js';
import {photoStep} from './photo-step.js';
import {warehouseStep} from './warehouse-step.js';
import {formNoticeStep} from './form-notice.js';
const $=id=>document.getElementById(id);
const hash=async file=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
const stateKey='visionProductStatesV1';
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const productKey=b=>JSON.stringify([b.identity.importer_id,b.identity.manufacturer_id,b.identity.product_name]);
export function createFollowup({invoke,log,stage,target,tabId}) {
  let binding=null,details=null,entry=null,warehousePopup=null,agencyProof=null;
  // Form reads/writes always use the original declaration tab. Popup focus or
  // an invocation adapter's default must never change the destination.
  const invokeForm=(func,arg)=>invoke(func,arg,tabId);
  $('photo-panel').hidden=false;
  $('followup-panel').hidden=false;
  const readStore=async key=>(await chrome.storage.local.get(key))[key]||{};
  const selectedFiles=()=>[...$('photos-label').files].map(file=>({slot:0,file})).concat([...$('photos-front').files].map(file=>({slot:9,file})),[...$('photos-other').files].map((file,i)=>({slot:10+i,file})));
  async function saveRules() {
    if(!binding||!details)throw Error('먼저 현재 신고서의 창고·제품상태를 읽어야 합니다.');
    const now=(await invokeForm(followupStep,{action:'read',binding})).details;
    if($('states-ack').checked){
      const states=[...$('product-states').querySelectorAll('input:checked')].map(n=>n.value);
      if(!states.length||states.includes('해당사항 없음')&&states.length!==1)throw Error('제품상태를 확인해 주세요. 해당사항 없음은 다른 항목과 함께 선택하지 않습니다.');
      const store=await readStore(stateKey);store[productKey(binding)]={states,confirmed:true};await chrome.storage.local.set({[stateKey]:store});
    }
    if(!$('states-ack').checked)throw Error('기억할 제품상태 기준을 확인해 주세요.');
  }
  async function readAgency() {
    const boundKey=JSON.stringify(stable({identity:binding.identity,application_ref:binding.application_ref,context:binding.context}));
    if(agencyProof&&agencyProof.key===boundKey&&Date.now()-agencyProof.at<600000&&agencyProof.result.agency===details.agency){
      log('이번 실행에서 조회한 창고·신고기관과 현재값이 같아 조회창을 다시 열지 않습니다.');return agencyProof.result;
    }
    const path='/csp/csw/infomt/cdmt/openCSW0302065Q.do';
    const tabs=()=>chrome.tabs.query({url:'https://unipass.customs.go.kr/*'});
    const isWarehouse=t=>{try{return new URL(t.url).pathname===path&&(t.openerTabId===undefined||t.openerTabId===tabId);}catch{return false;}};
    const before=(await tabs()).map(t=>t.id),openToken=crypto.randomUUID();
    await invokeForm(followupStep,{action:'open_warehouse',binding,open_token:openToken});
    warehousePopup=null;
    const until=Date.now()+10000;
    while(Date.now()<until){
      const all=(await tabs()).filter(isWarehouse),added=all.filter(t=>!before.includes(t.id));
      const candidates=added.length?added:all;
      if(candidates.length>1)throw Error('현재 신고서의 창고 조회창이 여러 개라 대상을 선택하지 않았습니다.');
      if(candidates.length===1){warehousePopup=candidates[0].id;break;}
      await new Promise(r=>setTimeout(r,200));
    }
    if(!warehousePopup)throw Error('현재 신고서에서 연 식약보관창고 조회창을 확인하지 못했습니다.');
    const token=crypto.randomUUID(),arg={binding,agencies:details.agencies,token,open_token:openToken};
    const readyUntil=Date.now()+8000;let ready=false;
    while(Date.now()<readyUntil){
      const probe=await invoke(warehouseStep,{...arg,action:'probe'},warehousePopup);
      if(probe.status==='warehouse_ready'){ready=true;break;}
      await new Promise(r=>setTimeout(r,200));
    }
    if(!ready)throw Error('창고 조회창 입력칸이 아직 준비되지 않았습니다.');
    await invoke(warehouseStep,{...arg,action:'search'},warehousePopup);
    const resultUntil=Date.now()+15000;
    while(Date.now()<resultUntil){
      const result=await invoke(warehouseStep,{...arg,action:'result'},warehousePopup);
      if(result.status==='matched'){
        await invokeForm(followupStep,{action:'read',binding});
        agencyProof={key:boundKey,at:Date.now(),result};
        try{await chrome.tabs.remove(warehousePopup);}catch{}warehousePopup=null;return result;
      }
      await new Promise(r=>setTimeout(r,300));
    }
    throw Error('보관창고 조회 결과가 갱신되지 않았습니다.');
  }
  async function process(snapshot,entryRecord,{attachments=true}={}) {
    binding=snapshot;entry=entryRecord||null;
    $('followup-panel').hidden=false;
    const pending=[];
    stage('warehouse','확인 중');
    details=(await invokeForm(followupStep,{action:'read',binding})).details;
    $('warehouse-details').textContent=`보관창고: ${details.warehouse_code} ${details.warehouse_name}\n현재 신고기관: ${details.agency}\n${entry?'이번 화물의 정상 반입 이력과 창고코드 일치':'이번 화물의 창고 반입 이력 확인 미완료'}`;
    const products=await readStore(stateKey);
    const productRule=products[productKey(binding)]||target?.product_states;
    const config={confirmed:true};
    if(entry){
      try{
        log('보관창고코드로 창고를 조회하고 결과에 표시된 신고기관을 읽습니다.');
        const agencyRule=await readAgency();
        config.agency=agencyRule.agency;config.warehouse_code=agencyRule.warehouse_code;
        $('warehouse-details').textContent+='\n창고 조회의 신고기관: '+agencyRule.agency;
      }catch(error){
        stage('warehouse','조회 확인 필요');pending.push('창고 신고기관: '+error.message);log(error.message);
        // Keep the primary lookup failure, and revalidate the declaration
        // before attempting independent product/label/photo operations.
        try{details=(await invokeForm(followupStep,{action:'read',binding})).details;}
        catch(formError){
          stage('product','신고서 재확인 필요');
          const message='창고 조회를 확인하지 못했고 원래 신고서 화면도 다시 읽지 못했습니다. 신청번호를 새로 입력하라는 뜻이 아닙니다. 후속 입력을 멈췄습니다.';
          pending.push(message);log(message+' 원래 신고서 확인: '+formError.message);
          return {pending,form_unavailable:true};
        }
      }
    }else{stage('warehouse','반입 이력 미확인');pending.push('신고기관 관할');}
    if(productRule?.confirmed===true){config.states=productRule.states;}else{stage('product','확인 기준 필요');pending.push('제품상태');}
    if(config.agency||config.states){
      const applied=await invokeForm(followupStep,{action:'apply',binding,config,before:details});
      details=applied.details;
      if(config.agency)stage('warehouse','신고기관 확인 완료');
      if(config.states)stage('product','선택 확인 완료');
    }
    $('product-states').replaceChildren();
    for(const state of details.states){const label=document.createElement('label');label.className='ack';const input=document.createElement('input');input.type='checkbox';input.value=state.label;input.checked=state.checked;label.append(input,document.createTextNode(state.label));$('product-states').append(label);}
    $('states-ack').checked=!!config.states;
    if(!attachments)return {pending};
    const attached=await attachPhotos();
    return {pending:[...pending,...attached.pending]};
  }
  // The photo button never calls process/readAgency or applies product states.
  // Keep the original binding on retries so another declaration cannot silently
  // inherit files selected for the previous one.
  async function attachPhotos(snapshot=null) {
    if(!binding&&snapshot)binding=snapshot;
    if(!binding)throw Error('사진을 첨부할 현재 신고서를 먼저 확인해야 합니다.');
    await invokeForm(followupStep,{action:'read',binding});
    const pending=[];
    const photos=selectedFiles();
    if(photos.filter(p=>p.slot>=10).length>9)throw Error('기타 사진은 최대 9개까지 가능합니다.');
    const prepared=[];
    for(const {slot,file} of photos){
      if(file.size>5000000||file.size<1||! /\.(png|jpg|jpeg|bmp|gif|tif|pdf)$/i.test(file.name))throw Error('사진은 파일당 5MB 이하의 지원 형식이어야 합니다: '+file.name);
      prepared.push({slot,file,meta:{name:file.name,size:file.size,type:file.type,lastModified:file.lastModified,sha256:await hash(file)}});
    }
    const existing=(await invokeForm(photoStep,{action:'evidence',binding})).files;
    for(const p of prepared){
      const current=existing.find(e=>e.slot===p.slot)?.meta;
      if(current&&(current.size!==p.meta.size||current.sha256!==p.meta.sha256))throw Error('신고서에 이미 선택된 사진과 도구에서 선택한 사진의 내용이 다릅니다: '+p.file.name);
    }
    stage('label','사람이 직접 확인');
    if(!prepared.length){
      if(existing.some(p=>p.slot===0)&&existing.some(p=>p.slot===9)){stage('photos','기존 파일 선택 확인');$('photo-result').textContent=existing.map(p=>p.meta.name).join('\n');}
      else{stage('photos','원본 파일 선택 필요');pending.push('사진 첨부');}
    }
    else{
      stage('photos','사진 전달 중');
      await invokeForm(formNoticeStep,{action:'open',kind:'attachment',binding});
      await invokeForm(photoStep,{action:'open',binding});
      for(const p of prepared){
        const token=crypto.randomUUID(),base={binding,slot:p.slot,file:p.meta,token};
        await invokeForm(formNoticeStep,{action:'dismiss',kind:'attachment',binding});
        const start=await invokeForm(photoStep,{...base,action:'begin'});
        if(start.status==='selected'){p.actualName=start.name||p.file.name;continue;}
        const bytes=new Uint8Array(await p.file.arrayBuffer());
        for(let offset=0,index=0;offset<bytes.length;offset+=131072,index++){
          const chunk=bytes.subarray(offset,offset+131072);let raw='';for(let i=0;i<chunk.length;i++)raw+=String.fromCharCode(chunk[i]);
          await invokeForm(photoStep,{...base,action:'chunk',index,data:btoa(raw)});
        }
        await invokeForm(formNoticeStep,{action:'dismiss',kind:'attachment',binding});
        const result=await invokeForm(photoStep,{...base,action:'commit'});
        if(result.status!=='selected')throw Error('사진 선택 이후 결과를 확인하지 못했습니다. 자동 재첨부하지 않습니다: '+p.file.name);
        p.actualName=result.name||p.file.name;
      }
      stage('photos','파일 선택 반영 확인');
      $('photo-result').textContent=prepared.map(p=>`${p.slot===0?'1번 한글표시':p.slot===9?'10번 첫 전면':'10번 기타'}: ${p.actualName}`).join('\n')+'\n원본 크기·해시 일치. 최종 저장·접수 확인은 별도입니다.';
      if(!prepared.some(p=>p.slot===0)||!prepared.some(p=>p.slot===9))pending.push('한글표시/전면 사진 슬롯 누락');
    }
    return {pending};
  }
  return {process,saveRules,attachPhotos,hasBinding:()=>!!binding};
}
