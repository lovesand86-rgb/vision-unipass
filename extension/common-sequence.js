import {readCommonData} from './common-data.js';
import {fillDraftFields} from './fill.js';
import {openCommonTab} from './common-navigation.js';

export const profileKey='visionApplicantProfilesV1';
export const profileId=s=>JSON.stringify([s.context.reqRqstNo1,s.context.aplcNm,s.context.aplcEml1.toLowerCase(),s.context.aplcEml2.toLowerCase()]);
const norm=v=>String(v??'').replace(/[\s-]/g,'').toUpperCase();
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const validContact=c=>c?.confirmed===true&&/^\+?[\d -]{8,22}$/.test(c.phone)&&/^01[016789][ -]?\d{3,4}[ -]?\d{4}$/.test(c.mobile);
const bound=(a,b)=>same(a.application_ref,b.application_ref)&&same(a.identity,b.identity)&&same(a.context,b.context);

export async function saveSequenceContact({invoke,snapshot,phone,mobile}) {
  if(snapshot)await invoke(openCommonTab,{application_ref:snapshot.application_ref,identity:snapshot.identity});
  const current=(await invoke(readCommonData,{action:'read'})).snapshot;
  if(!snapshot||!bound(current,snapshot))throw Error('연락처 확인 중 신고 대상·창고·신청인이 바뀌었습니다. 다시 이어서 실행해 주세요.');
  const contact={phone:phone.trim(),mobile:mobile.trim(),confirmed:true,confirmed_at:new Date().toISOString()};
  if(!validContact(contact))throw Error('전화번호와 휴대전화번호 형식을 확인해 주세요.');
  const profiles=(await chrome.storage.local.get(profileKey))[profileKey]||{}, id=profileId(current);
  if(!Object.hasOwn(profiles,id)&&Object.keys(profiles).length>=50)throw Error('담당자 저장 개수를 초과했습니다.');
  profiles[id]=contact;
  await chrome.storage.local.set({[profileKey]:profiles});
}

// Caller owns the shared workflow lock. Re-preview before each group of
// idempotent field writes, and bind them to the live application and context.
export async function runCommonSequence({invoke,job,applicationRef,log,stage,onContact}) {
  if(!job||job.format!=='vision-unipass-fill-job'||job.phase!=='common'||
     Object.keys(job.fields||{}).join('|')!=='shipment_date')throw Error('확인된 선적일 작업 정보가 필요합니다.');
  stage('common','진행 중');log('공통사항 탭으로 이동합니다.');
  await invoke(openCommonTab,{application_ref:applicationRef,identity:job.identity});
  let snapshot;
  for(let n=0;n<25;n++){
    try {snapshot=(await invoke(readCommonData,{action:'read'})).snapshot;break;}
    catch(error){if(!error.message.includes('공통사항 탭'))throw error;await new Promise(r=>setTimeout(r,200));}
  }
  if(!snapshot)throw Error('공통사항 탭이 열리지 않았습니다.');
  if(!same(snapshot.application_ref,applicationRef)||Object.keys(job.identity).some(k=>norm(snapshot.identity[k])!==norm(job.identity[k])))throw Error('공통사항의 신고 대상이 작업 정보와 다릅니다.');
  stage('common','확인 완료');
  const recheck=async()=>{
    const current=(await invoke(readCommonData,{action:'read'})).snapshot;
    if(!bound(current,snapshot))throw Error('진행 중 신청번호·화물·창고·신청인이 바뀌었습니다.');
    return current;
  };
  const apply=async fields=>{
    await recheck();
    const task={format:'vision-unipass-fill-job',version:1,job_id:'sequence-'+crypto.randomUUID(),phase:'common',
      application_ref:snapshot.application_ref,identity:snapshot.identity,common_context:snapshot.context,fields};
    const preview=await invoke(fillDraftFields,{mode:'preview',job:task});
    if(preview.status!=='preview')throw Error('공통사항 입력 전 대조를 완료하지 못했습니다.');
    const result=await invoke(fillDraftFields,{mode:'apply',job:task,review_hash:preview.review_hash});
    if(result.status!=='fields_filled')throw Error(result.error||result.note||'공통사항 입력값을 확인하지 못했습니다.');
  };
  stage('shipment','진행 중');
  await apply(job.fields);
  stage('shipment','확인 완료');log('선적일 '+job.fields.shipment_date.value+' 입력·읽기 확인을 마쳤습니다.');

  const field=(value,source)=>({value,source,reviewed:true});
  let entry=null,entryError='';
  stage('entry','조회 중');log('현재 보관창고와 일치하는 실제 반입일을 조회합니다.');
  try{
    snapshot=await recheck();
    const found=(await invoke(readCommonData,{action:'lookup',snapshot})).entry;
    if(!found||norm(found.cargo_mt_no)!==norm(snapshot.identity.cargo_mt_no)||norm(found.bl)!==norm(snapshot.identity.bl)||found.warehouse_code!==snapshot.context.inscBrngFdmcSfkpWrhsCd)throw Error('반입일 조회 결과가 현재 화물·창고와 다릅니다.');
    await recheck();
    await apply({entry_date:field(found.date,found.source+' / '+found.warehouse_code+' / '+found.at)});
    entry=found;stage('entry','확인 완료');log('창고 반입일 '+entry.date+' 입력·읽기 확인을 마쳤습니다.');
  }catch(error){
    entryError=error.message;stage('entry','중단');log('반입일 미완료: '+entryError);
    await recheck(); // Never continue with another applicant/application.
  }

  stage('contact','확인 중');
  const profiles=(await chrome.storage.local.get(profileKey))[profileKey]||{};
  let contact=profiles[profileId(snapshot)];
  if(!validContact(contact)&&validContact({...snapshot,confirmed:true})){
    await saveSequenceContact({invoke,snapshot,phone:snapshot.phone,mobile:snapshot.mobile});
    contact={phone:snapshot.phone,mobile:snapshot.mobile,confirmed:true};
  }
  if(!validContact(contact)){
    stage('contact','연락처 확인 필요');onContact(snapshot);
    log('현재 담당자의 확인된 연락처가 없어 아래에서 한 번 확인하면 이어갑니다.'+(entryError?' 반입일 미완료: '+entryError:''));
    return {status:'needs_contact',snapshot,entry,entry_error:entryError};
  }
  await apply({applicant_phone:field(contact.phone,'현재 신청인에게 연결된 확인 연락처'),
    applicant_mobile:field(contact.mobile,'현재 신청인에게 연결된 확인 연락처')});
  stage('contact','확인 완료');
  // Verify the full common field set again after the last field's events.
  const finalJob={format:'vision-unipass-fill-job',version:1,phase:'common',job_id:'sequence-final',
    application_ref:snapshot.application_ref,identity:snapshot.identity,common_context:snapshot.context,
    fields:{...job.fields,...(entry?{entry_date:field(entry.date,entry.source)}:{}),applicant_phone:field(contact.phone,'확인 연락처'),applicant_mobile:field(contact.mobile,'확인 연락처')}};
  await recheck();
  const final=await invoke(fillDraftFields,{mode:'preview',job:finalJob});
  if(!final.changes?.length||final.changes.some(c=>!c.same))throw Error('마지막 대조에서 공통사항 값이 달라졌습니다.');
  return {status:entry?'common_completed':'common_partial',snapshot,entry_record:entry,entry:entry?.date||null,entry_error:entryError,shipment:job.fields.shipment_date.value};
}
