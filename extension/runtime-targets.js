import * as fallback from './cargo-target.js';
// Immutable per-job handoff, never a global override for other app windows.
export async function runtimeTargets(){
 const id=new URL(location.href).searchParams.get('intake');if(!id)return fallback;
 const stored=(await chrome.storage.local.get('visionIntakeRun:'+id))['visionIntakeRun:'+id];
 const tab=await chrome.tabs.getCurrent();
 if(!stored||stored.appTab!==tab.id||Date.now()-stored.at>86400000){const p=document.createElement('p');p.textContent='이번 건 준비 자료가 만료되었거나 다른 창의 작업입니다. 처음 화면에서 작업을 다시 열어주세요.';document.body.replaceChildren(p);throw Error(p.textContent);}
 return stored.targets;
}
