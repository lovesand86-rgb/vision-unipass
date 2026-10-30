// Only the empty-form category change, explicitly requested by this workflow.
export async function watchCategoryDialog(tabId,log){
 const target={tabId};let attached=false,closed=false;
 const allowed=text=>/^(?:신고)?제품구분을변경하면입력(?:한|하신)모든정보가초기화됩니다[.!]?(?:신고제품구분을)?변경하시겠습니까[?]?$/.test(String(text).replace(/\s/g,''));
 const event=(source,method,p)=>{
  if(closed||source.tabId!==tabId||source.sessionId||method!=='Page.javascriptDialogOpening')return;
  if(p.url!=='https://unipass.customs.go.kr/csp/index.do')return;
  log(p.message);
  if(['alert','confirm'].includes(p.type)&&allowed(p.message))void chrome.debugger.sendCommand(target,'Page.handleJavaScriptDialog',{accept:true});
  else log('새 안내창입니다. 유니패스에서 내용을 확인한 뒤 이어하기를 누르면 진행 기록에서 계속합니다.');
 };
 async function stop(){if(closed)return;closed=true;chrome.debugger.onEvent.removeListener(event);if(attached)try{await chrome.debugger.detach(target);}catch{}}
 chrome.debugger.onEvent.addListener(event);
 try{await chrome.debugger.attach(target,'1.3');attached=true;await chrome.debugger.sendCommand(target,'Page.enable');return {stop};}catch(e){await stop();throw Error('제품구분 안내 연결 실패: '+e.message);}
}
