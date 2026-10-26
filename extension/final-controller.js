import {finalStep} from './final-step.js';
import {watchFinalDialog} from './final-dialog.js';
const $=id=>document.getElementById(id);
const storeKey='visionFinalActionsV1';
const names={validate:'오류검증',save:'임시저장',send:'전송'};
export function createFinalActions({invoke,runExclusive,identity,log,tabId}){
  let review=null,record=null,busy=false;
  const caseKey=JSON.stringify(identity);
  $('final-panel').hidden=false;
  const load=async()=>((await chrome.storage.local.get(storeKey))[storeKey]||{})[caseKey]||{attempts:[]};
  const save=async()=>{const all=(await chrome.storage.local.get(storeKey))[storeKey]||{};all[caseKey]=record;await chrome.storage.local.set({[storeKey]:all});};
  const pending=()=>record?.attempts.find(a=>a.outcome==='unconfirmed');
  const sameApp=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const belongs=a=>review&&(a.form_id===review.form_id||review.application_ref[2]&&sameApp(a.application_ref,review.application_ref));
  const successful=kind=>{const latest=record?.attempts.findLast(a=>a.kind===kind&&a.digest===review?.digest&&belongs(a));return latest&&['user_confirmed_success','site_confirmed_success'].includes(latest.outcome);};
  const sent=()=>record?.attempts.some(a=>a.kind==='send'&&a.outcome!=='not_requested'&&belongs(a));
  function refresh(isBusy=busy){
    busy=isBusy;
    $('final-read').disabled=busy;
    $('final-validate-save').disabled=busy||!review||!!pending()||!!sent()||successful('save');
    $('final-validate').disabled=busy||!review||!!pending()||!!sent();
    $('final-save').disabled=busy||!review||!!pending()||!!sent()||!successful('validate')||successful('save');
    $('final-send').disabled=busy||!review||!!pending()||!!sent()||!successful('validate')||!successful('save')||!review.application_ref[2];
    $('final-result-record').disabled=busy||!pending()||!review;
    $('final-result').disabled=busy||!pending();$('final-result-note').disabled=busy||!pending();
  }
  function render(){
    $('final-history').textContent=(record?.attempts||[]).map(a=>`${names[a.kind]} · ${a.outcome==='unconfirmed'?'결과 미확인':a.outcome==='not_requested'?'실행 전 중단':a.outcome==='user_confirmed_success'?'사용자 결과 확인':a.outcome==='site_confirmed_success'?'사이트 완료 안내 확인':a.outcome==='site_reported_error'?'사이트 오류 안내':a.outcome==='user_reported_failure'?'사용자 오류 확인':a.outcome} · ${a.at}${a.note?'\n'+a.note:''}`).join('\n\n');
    const p=pending();$('final-result-label').textContent=p?`${names[p.kind]} 실행 결과를 유니패스에서 직접 확인한 뒤 기록하세요.`:'실행 후 유니패스 결과를 확인합니다.';
    $('final-result').value='';
    $('final-status').textContent=p?`${names[p.kind]} 실행 시도가 기록되어 있습니다. 성공으로 간주하지 않으며 자동 반복하지 않습니다.`:'검토한 내용이 바뀌면 다시 읽고 오류검증을 진행합니다.';
    refresh();
  }
  async function read(){
    record=await load();
    const r=await invoke(finalStep,{action:'read',identity});review=r.snapshot;
    const s=review.summary;
    $('final-summary').textContent=`신청번호: ${review.application_ref.join('-')}\n제품: ${s.product}\nB/L: ${s.bl}\n화물: ${s.cargo}\n창고: ${s.warehouse}\n신고기관: ${s.agency}\n선적일: ${s.shipment} / 반입일: ${s.entry}\n전화: ${s.phone} / 휴대전화: ${s.mobile}\n첨부 선택: ${review.files.map(f=>f.name).join(', ')||'(현재 선택 파일 없음)'}\n한글표시 내용은 직접 확인·수정해 주세요.`;
    $('final-notices').textContent=r.notices?.join('\n\n')||'화면에서 읽은 결과 안내가 없습니다. 브라우저 알림창이나 별도 결과창은 유니패스에서 확인하세요.';
    render();return r;
  }
  async function execute(kind){
    if(!review)throw Error('먼저 최종 입력내용을 읽어 주세요.');
    record=await load();if(pending())throw Error('이전 실행 결과가 미확인입니다. 결과부터 확인해 주세요.');
    if(sent())throw Error('이 신청서의 전송 시도 기록이 있습니다. 자동 재전송하지 않습니다.');
    if(kind!=='validate'&&!successful('validate'))throw Error('현재 내용의 오류검증 결과 확인이 필요합니다.');
    if(kind==='save'&&successful('save'))throw Error('현재 내용은 이미 임시저장 결과를 확인했습니다.');
    if(kind==='send'&&(!successful('save')||!review.application_ref[2]))throw Error('현재 내용의 임시저장 결과와 신청번호가 필요합니다.');
    const fresh=(await invoke(finalStep,{action:'read',identity})).snapshot;
    if(fresh.digest!==review.digest||fresh.form_id!==review.form_id||!sameApp(fresh.application_ref,review.application_ref))throw Error('검토 이후 신고서가 바뀌었습니다. 최종 입력내용을 다시 읽어 주세요.');
    // Attach before the action; the action is not attempted if observation cannot start.
    const watcher=await watchFinalDialog(tabId,kind,message=>{$('final-notices').textContent=message;$('final-result-note').value=message;});
    const attempt={token:crypto.randomUUID(),kind,digest:review.digest,form_id:review.form_id,application_ref:review.application_ref,at:new Date().toISOString(),outcome:'unconfirmed'};
    try{
      record.attempts.push(attempt);await save();render();
      watcher.arm();
      try{await invoke(finalStep,{action:'execute',identity,kind,review,token:attempt.token});}
      catch(error){
        if(error.blockedBeforeAction){
          attempt.outcome='not_requested';attempt.source='tool_preflight';attempt.note=error.message;await save();render();
          log(names[kind]+' 실행 전 중단: '+error.message);return false;
        }
        log(names[kind]+' 실행 응답 미확인: '+error.message);
      }
      const result=await watcher.finished;
      if(result?.classification){
        if(result.classification==='error'){
          attempt.outcome='site_reported_error';attempt.source=result.source;attempt.note=result.message;await save();render();
          log(names[kind]+' 오류: '+result.message+' 입력을 수정한 뒤 다시 오류검증해 주세요.');return false;
        }
        if(kind!=='send'){
          const current=(await invoke(finalStep,{action:'read',identity})).snapshot;
          const appOkay=sameApp(current.application_ref,attempt.application_ref)||!attempt.application_ref[2]&&current.application_ref[0]===attempt.application_ref[0]&&current.application_ref[1]===attempt.application_ref[1]&&!!current.application_ref[2];
          if(current.form_id!==attempt.form_id||current.digest!==attempt.digest||!appOkay)throw Error('완료 안내가 나왔지만 신고서 내용이 바뀌어 같은 내용의 완료로 기록하지 않았습니다.');
          review=current;attempt.application_ref=current.application_ref;
        }
        attempt.outcome='site_confirmed_success';attempt.source=result.source;attempt.note=result.message;attempt.confirmed_at=new Date().toISOString();await save();render();
        log(names[kind]+' 완료 안내를 확인했습니다.'+(kind==='send'?' 전송 안내이며 식약처 접수·수리 완료 확인은 별도입니다.':''));return true;
      }
      log(names[kind]+' 결과를 자동으로 판정하지 못했습니다. 유니패스 결과를 직접 확인해 기록해 주세요.');render();return false;
    }finally{await watcher.stop();}
  }
  async function recordResult(){
    record=await load();const attempt=pending(),choice=$('final-result').value,note=$('final-result-note').value.trim();
    if(!attempt||!['success','failure'].includes(choice)||!note)throw Error('유니패스에서 확인한 결과를 선택하고 안내 문구 또는 확인 내용을 적어 주세요.');
    const current=(await invoke(finalStep,{action:'read',identity})).snapshot;
    const appOkay=sameApp(current.application_ref,attempt.application_ref)||!attempt.application_ref[2]&&current.application_ref[0]===attempt.application_ref[0]&&current.application_ref[1]===attempt.application_ref[1]&&!!current.application_ref[2];
    if(current.form_id!==attempt.form_id||!appOkay)throw Error('실행했던 신고서 화면이 바뀌었습니다. 기존 실행은 결과 미확인으로 유지합니다.');
    if(choice==='success'&&current.digest!==attempt.digest)throw Error('실행 이후 내용·첨부가 바뀌어 같은 내용의 성공으로 기록할 수 없습니다.');
    attempt.outcome=choice==='success'?'user_confirmed_success':'user_reported_failure';attempt.source='user_reported';attempt.note=note;attempt.application_ref=current.application_ref;attempt.confirmed_at=new Date().toISOString();
    await save();review=current;$('final-result-note').value='';render();
    log(names[attempt.kind]+' 결과를 사용자 확인으로 기록했습니다. '+(attempt.kind==='send'?'식약처 접수·수리 완료를 자동 확인한 것은 아닙니다.':''));
  }
  function bind(id,fn){$(id).addEventListener('click',()=>runExclusive(async()=>{try{await fn();}catch(error){$('final-status').textContent=error.message;log(error.message);}}));}
  bind('final-read',read);bind('final-validate',()=>execute('validate'));bind('final-validate-save',async()=>{if(await execute('validate'))await execute('save');});bind('final-save',()=>execute('save'));bind('final-send',()=>execute('send'));bind('final-result-record',recordResult);
  refresh();return {refresh,read,report:()=>({review_digest:review?.digest,record})};
}
