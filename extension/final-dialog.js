// Narrow informational-result recognition; no confirm/prompt is auto-accepted.
export function classifyFinalMessage(kind,message){
  const s=String(message||'').normalize('NFKC').replace(/\s/g,'');
  if(kind==='validate'&&/^(?:(?:오류검증|검증)(?:결과)?[:：]?)?(?:오류가?없습니다|문제가?없습니다|정상입니다)[.!。]?$/.test(s))return 'success';
  if(kind==='save'&&/^(?:정상적으로)?임시저장(?:이)?(?:되었습니다|완료되었습니다)[.!。]?$/.test(s))return 'success';
  if(kind==='send'&&/^(?:정상적으로)?전송(?:이)?(?:되었습니다|완료되었습니다)[.!。]?$/.test(s))return 'success';
  if(/입력하|입력해|선택하|선택해|필수|누락|실패|오류|할수없/.test(s))return 'error';
  return null;
}
export async function watchFinalDialog(tabId,kind,onNotice){
  const target={tabId};let attached=false,closed=false,armed=false,result=null,completed=null,timer,resolve;
  const finished=new Promise(r=>resolve=r);
  const allowed=url=>{try{const u=new URL(url);return u.origin==='https://unipass.customs.go.kr'&&u.pathname==='/csp/index.do';}catch{return false;}};
  async function stop(){
    if(closed)return;closed=true;clearTimeout(timer);
    chrome.debugger.onEvent.removeListener(event);chrome.debugger.onDetach.removeListener(detach);
    if(attached){attached=false;try{await chrome.debugger.detach(target);}catch{}}
    resolve(completed);
  }
  function detach(source){if(source.tabId===tabId){attached=false;void stop();}}
  function event(source,method,params){
    if(closed||source.tabId!==tabId||source.sessionId)return;
    if(method==='Page.javascriptDialogOpening'){
      result=null;
      if(!armed||!allowed(params.url))return;
      const text=String(params.message||'');onNotice(text);
      if(params.type!=='alert')return;
      result={classification:classifyFinalMessage(kind,text),message:text,source:'site_alert'};
      if(result.classification==='success')void chrome.debugger.sendCommand(target,'Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});
    }
    if(method==='Page.javascriptDialogClosed'&&result){completed=result;void stop();}
  }
  const tab=await chrome.tabs.get(tabId);if(!allowed(tab.url))throw Error('최종 결과를 읽을 신고서 탭이 다릅니다.');
  chrome.debugger.onEvent.addListener(event);chrome.debugger.onDetach.addListener(detach);
  try{
    let startupTimer;
    try{await Promise.race([
      (async()=>{
        await chrome.debugger.attach(target,'1.3');
        if(closed){try{await chrome.debugger.detach(target);}catch{}return;}
        attached=true;await chrome.debugger.sendCommand(target,'Page.enable');
      })(),
      new Promise((_,reject)=>{startupTimer=setTimeout(()=>reject(Error('결과 알림 연결 시간이 지났습니다.')),5000);})
    ]);}finally{clearTimeout(startupTimer);}
    return {finished,stop,arm(){if(closed)throw Error('결과 알림 연결이 종료되었습니다.');armed=true;timer=setTimeout(()=>void stop(),40000);}};
  }catch(error){await stop();throw Error('결과 알림 연결을 시작하지 못했습니다. 다른 디버깅 연결은 해제하지 않았습니다. '+error.message);}
}
