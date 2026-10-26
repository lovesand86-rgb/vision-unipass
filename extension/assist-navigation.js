// Navigate within the existing app window; UNI-PASS stays in its own Chrome tab.
let canNavigate=()=>true;
export function openTool(path) { if(canNavigate())location.assign(chrome.runtime.getURL(path)); }
export function guardToolNavigation(isBusy) {
  let changed=false;
  document.addEventListener('input',event=>{if(!event.target.closest('[data-routing]'))changed=true;});
  document.addEventListener('change',event=>{if(!event.target.closest('[data-routing]'))changed=true;});
  canNavigate=()=>{
    if(isBusy()){alert('작업 중입니다. 결과가 표시된 뒤 화면을 이동해주세요.');return false;}
    return !changed||confirm('선택한 파일이나 화면에서 작성 중인 내용은 다시 준비해야 할 수 있습니다. 이동할까요?');
  };
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-app-nav]')&&!canNavigate())event.preventDefault();
  });
  window.addEventListener('beforeunload',event=>{if(isBusy()){event.preventDefault();event.returnValue='';}});
}
export async function chooseUnipassTab() {
  if(!await chrome.permissions.request({origins:['https://unipass.customs.go.kr/*']}))throw Error('UNI-PASS 화면 연결 권한이 필요합니다.');
  const tabs=await chrome.tabs.query({url:'https://unipass.customs.go.kr/csp/*'});
  if(!tabs.length)throw Error('Chrome에서 UNI-PASS에 로그인하고 작업할 화면을 열어주세요.');
  if(tabs.length===1)return tabs[0];
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.dataset.routing='true';
    dialog.innerHTML='<h2>작업할 UNI-PASS 화면 선택</h2><p>이번 작업의 대상 화면을 선택해주세요.</p><select aria-label="작업할 UNI-PASS 화면"></select><div class="tool-dialog-actions"><button type="button" data-cancel>취소</button><button type="button" data-select>이 화면 연결</button></div>';
    const select=dialog.querySelector('select');
    for(const tab of tabs)select.append(new Option(`${tab.title||'UNI-PASS'} · 창 ${tab.windowId} / 탭 ${tab.id}`,String(tab.id)));
    let chosen=null;
    dialog.querySelector('[data-select]').onclick=()=>{chosen=tabs.find(t=>String(t.id)===select.value);dialog.close();};
    dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{dialog.remove();resolve(chosen);},{once:true});
    document.body.append(dialog);dialog.showModal();
  });
}
