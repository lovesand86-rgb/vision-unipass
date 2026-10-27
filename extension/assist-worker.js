import {emptyState,STORAGE,validateJob} from './assist-model.js';
const host='kr.co.visionconsulting.assist';
chrome.action.onClicked.addListener(()=>chrome.tabs.create({url:chrome.runtime.getURL('assist.html')}));
chrome.runtime.onInstalled.addListener(()=>{});
let queue=Promise.resolve(),restarting=false;
async function updateView(sender){
 if(!Number.isInteger(sender.tab?.id)||sender.frameId!==0||new URL(sender.url).pathname!=='/assist.html')throw Error('비전 어시스트의 업데이트 화면에서 다시 열어주세요.');
 // tabs.query omits extension URLs without the tabs permission. Own runtime
 // contexts identify tool pages without access to the user's other websites.
 const views=await chrome.runtime.getContexts({contextTypes:['TAB']});
 const current=views.find(v=>v.tabId===sender.tab.id&&v.documentId===sender.documentId);
 if(!current)throw Error('업데이트 화면이 바뀌었습니다. 다시 확인해주세요.');
 if(views.some(v=>v.tabId!==sender.tab.id))throw Error('입력 도구 탭을 닫은 후 업데이트해주세요. UNI-PASS 화면은 그대로 두세요.');
 const state=(await chrome.storage.local.get(STORAGE))[STORAGE];
 if(state?.jobs.some(j=>j.attempts?.some(a=>a.result==='pending')))throw Error('입력 결과가 미확인인 작업이 있습니다. 결과를 확인한 후 업데이트해주세요.');
 return current;
}
async function finishReload(view){
 try{
  const views=await chrome.runtime.getContexts({contextTypes:['TAB']});
  if(views.some(v=>v.documentId!==view.documentId))throw Error('새로 열린 작업 화면이 있어 재시작을 멈췄습니다.');
  // Unloading an extension while its popup is open leaves a blank Chrome
  // window behind. Close only this verified app tab before unloading it.
  if(views.some(v=>v.documentId===view.documentId))await chrome.tabs.remove(view.tabId);
  chrome.runtime.reload();
 }catch(error){restarting=false;console.error('비전 어시스트 재시작:',error.message);}
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('')))return;
 const execute=async()=>{
  if(restarting)throw Error('새 버전으로 다시 여는 중입니다. 잠시 기다려주세요.');
  if(message.type==='read')return (await chrome.storage.local.get(STORAGE))[STORAGE]||emptyState();
  if(message.type==='write'){
   const old=(await chrome.storage.local.get(STORAGE))[STORAGE]||emptyState();
   if(message.expectedRevision!==old.revision)throw Error('다른 창에서 작업이 바뀌었습니다. 최신 작업을 다시 열어주세요. 입력 내용은 이 창에 남아 있습니다.');
   const value=message.state;if(value?.schema!==1||!Array.isArray(value.jobs)||value.jobs.length>500||value.jobs.some(j=>validateJob(j).length))throw Error('저장할 자료 형식이 올바르지 않습니다.');
   if(JSON.stringify(value).length>7500000)throw Error('저장 공간이 부족합니다. 작업을 내보내 보관해주세요.');
   value.revision=old.revision+1;await chrome.storage.local.set({[STORAGE]:value});return value;
  }
  if(message.type==='native'){
   if(!['status','check','apply','restore'].includes(message.command))throw Error('지원하지 않는 동작입니다.');
   if(['apply','restore'].includes(message.command))await updateView(sender);
   return await chrome.runtime.sendNativeMessage(host,{command:message.command,version:chrome.runtime.getManifest().version});
  }
  if(message.type==='reload'){
   const view=await updateView(sender);
   const result=await chrome.runtime.sendNativeMessage(host,{command:'reopen'});
   if(!result?.ok)throw Error(result?.message||'프로그램을 다시 열지 못했습니다. 현재 창은 유지합니다.');
   restarting=true;setTimeout(()=>finishReload(view),150);return {ok:true};
  }
  throw Error('지원하지 않는 요청입니다.');
 };
 queue=queue.catch(()=>{}).then(execute);queue.then(data=>reply({ok:true,data}),error=>reply({ok:false,error:error.message||String(error)}));return true;
});
